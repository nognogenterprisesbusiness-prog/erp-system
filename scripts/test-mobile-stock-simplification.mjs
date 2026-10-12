import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
const warehouse='30000000-0000-0000-0000-000000000001',material='60000000-0000-0000-0000-000000000001';
const admin='10000000-0000-0000-0000-000000000001';
const cleanup=readFileSync(new URL('../supabase/migrations/20261012120000_retire_opening_setup.sql',import.meta.url),'utf8');
let checks=0, snapshot, auditSnapshot, auditIds;
const check=async(name,work)=>{await work();console.log(`PASS ${++checks}: ${name}`);};
const preserved=`select jsonb_build_object('balances',(select jsonb_agg(to_jsonb(b) order by id) from public.inventory_balances b),
 'values',(select jsonb_agg(to_jsonb(v) order by id) from public.inventory_valuations v),
 'layers',(select jsonb_agg(to_jsonb(l) order by id) from public.inventory_cost_layers l),
 'transactions',(select jsonb_agg(to_jsonb(t) order by id) from public.inventory_transactions t))`;

await withIsolatedPostgres(async({sql,as,result,scalar})=>{
  const value=async(q)=>scalar(await sql(q));
  const json=async(role,q)=>JSON.parse(scalar(await as(role,q)));
  const rows=async(role,q)=>await json(role,`select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (${q}) x`);
  const location=await value(`select id from public.inventory_locations where project_site_id='${site}'`);
  const source=await value(`select id from public.inventory_locations where warehouse_id='${warehouse}'`);
  const unit=await value(`select base_unit_id from public.materials where id='${material}'`);
  await check('cleanup preserves balances, values, layers, ledger and audit; setup objects are gone',async()=>{
    assert.equal(await value(preserved),snapshot);
    assert.equal(await value(`select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a where id::text in (${auditIds.map((id)=>`'${id}'`).join(',')})`),auditSnapshot);
    assert.equal(await value("select to_regclass('public.inventory_opening_values') is null and to_regclass('public.inventory_legacy_transit_values') is null"),'t');
    assert.equal(await value("select to_regprocedure('public.verify_opening_stock_value(uuid,uuid,uuid,numeric,numeric,text)') is null"),'t');
  });
  await check('site filtering happens before pagination, excluding zero and fully reserved stock',async()=>{
    await sql(`insert into public.materials(code,name,base_unit_id,created_by,updated_by)
      select 'MOB-'||n,'Mobile pagination '||lpad(n::text,3,'0'),'${unit}','${admin}','${admin}' from generate_series(1,65) n;
      insert into public.inventory_balances(material_id,inventory_location_id,quantity_on_hand,reserved_quantity)
      select id,'${location}',case when right(code,2)::int>45 then 0 else 10 end,case when right(code,2)::int between 31 and 45 then 10 else 0 end
      from public.materials where code like 'MOB-%';`);
    const seen=new Set();
    for(const offset of [0,20]){
      const page=await rows('foreman',`select * from public.list_mobile_site_stock('${project}','${site}','Mobile pagination',${offset},20)`);
      assert.equal(page.length,offset===0?20:10); assert.equal(page[0].total_count,30);
      for(const row of page){assert(row.available>0);assert(!seen.has(row.material_id));seen.add(row.material_id);}
    }
    assert.equal(seen.size,30);
  });
  await check('whole catalog includes zero stock, keeps name/SKU separate and exposes only linked warehouse availability',async()=>{
    const found=await rows('engineer',`select * from public.list_mobile_request_catalog('${project}','${site}',null,'MOB-65',0,20)`);
    assert.equal(found.length,1);assert.equal(found[0].code,'MOB-65');assert.equal(found[0].name,'Mobile pagination 065');assert.equal(found[0].available_quantity,0);
    assert(found[0].warehouses.length>0);assert(!JSON.stringify(found).includes('unit_cost'));
    const unlinked=randomUUID();
    await sql(`insert into public.warehouses(id,code,name,address,created_by,updated_by) values('${unlinked}','UNLINKED','Unlinked warehouse','Test','${admin}','${admin}')`);
    await assert.rejects(as('engineer',`select * from public.list_mobile_request_catalog('${project}','${site}','${unlinked}')`),/Not authorized/);
    const unknownSite=randomUUID();
    for(const role of ['engineer','foreman','finance','warehouse_staff']){
      await assert.rejects(as(role,`select * from public.list_mobile_site_stock('${project}','${unknownSite}')`),/Not authorized/);
      await assert.rejects(as(role,`select * from public.list_mobile_request_catalog('${project}','${unknownSite}')`),/Not authorized/);
      await assert.rejects(as(role,`select * from public.get_mobile_stock_provenance('${project}','${unknownSite}','{}')`),/Not authorized/);
    }
  });
  await check('catalog shortages retain identity and never create stock or catalog items; retry is once only',async()=>{
    const item=await value("select id from public.materials where code='MOB-65'");const key=randomUUID();
    const command=`select public.submit_catalog_shortage('${key}','${project}','${site}','${warehouse}','${item}',4,current_date+3,'Needed for site work')`;
    const id=result(await as('foreman',command));assert.equal(result(await as('foreman',command)),id);
    assert.equal(await value(`select reported_material_id from public.material_sourcing_requests where id='${id}'`),item);
    assert.equal(await value(`select coalesce(sum(quantity_on_hand),0) from public.inventory_balances where material_id='${item}'`),'0.0000');
    await assert.rejects(as('foreman',command.replace(item,material)),/Idempotency/);
  });
  await check('automatic references use Manila date; simultaneous retry and next-day retry keep one posting',async()=>{
    const key=randomUUID();
    const prepared=await rows('admin',`select * from public.prepare_web_inventory_movement('${key}','stock-in')`);
    assert.equal(prepared[0].transaction_date,await value("select (clock_timestamp() at time zone 'Asia/Manila')::date"));
    assert.match(prepared[0].reference_document,/^MOV-\d{4}-\d{8}$/);
    // Simulate the original attempt on the preceding Philippine day, without changing the server clock.
    await sql(`update private.web_inventory_commands set transaction_date=transaction_date-1 where idempotency_key='${key}'`);
    const input={materialId:material,unitId:unit,destinationLocationId:source,quantity:'5',totalCost:'500',remarks:'Documented other receipt'};
    const command=`select public.post_web_inventory_movement('${key}','stock-in','${JSON.stringify(input)}')`;
    const ids=await Promise.all([as('admin',command),as('admin',command)]);assert.equal(result(ids[0]),result(ids[1]));
    const tx=result(ids[0]);
    assert.equal(await value(`select reference_document from public.inventory_transactions where id='${tx}'`),prepared[0].reference_document);
    assert.equal(await value(`select transaction_date=(clock_timestamp() at time zone 'Asia/Manila')::date-1 from public.inventory_transactions where id='${tx}'`),'t');
    await assert.rejects(as('admin',command.replace('"5"','"6"')),/Idempotency/);
    for(const role of ['engineer','foreman','finance','warehouse_staff']) await assert.rejects(as(role,`select * from public.prepare_web_inventory_movement('${randomUUID()}','stock-in')`),/Not authorized/);
    await assert.rejects(as('engineer',`select * from public.prepare_web_inventory_movement('${key}','stock-in')`),/Not authorized/);
  });
  await check('failed stock-out keeps prepared metadata and can retry after correction',async()=>{
    const key=randomUUID();const prepared=await rows('admin',`select * from public.prepare_web_inventory_movement('${key}','stock-out')`);
    const post=(quantity)=>`select public.post_web_inventory_movement('${key}','stock-out','${JSON.stringify({materialId:material,unitId:unit,sourceLocationId:source,quantity,remarks:'Damaged warehouse stock'})}')`;
    await assert.rejects(as('admin',post('1000000')),/insufficient available/);
    const tx=result(await as('admin',post('1')));
    assert.equal(await value(`select reference_document from public.inventory_transactions where id='${tx}'`),prepared[0].reference_document);
    assert.equal(result(await as('admin',post('1'))),tx);
  });
  await check('web transfers and site returns use existing posting/cost rules and enforce destination scope',async()=>{
    const transfer={materialId:material,unitId:unit,sourceLocationId:source,destinationLocationId:location,quantity:'3',remarks:'Administrator exception for test delivery'};
    const tx=result(await as('admin',`select public.post_web_inventory_movement('${randomUUID()}','transfer','${JSON.stringify(transfer)}')`));
    const item=await value(`select id from public.inventory_transfer_items where transfer_id='${tx}'`);
    await as('admin',`select public.receive_inventory_transfer('${randomUUID()}','${item}',3,current_date,'Checked transfer receipt')`);
    const back={...transfer,sourceLocationId:location,destinationLocationId:source,quantity:'1',remarks:'Return unused stock'};
    const returnId=result(await as('admin',`select public.post_web_inventory_movement('${randomUUID()}','return','${JSON.stringify(back)}')`));
    assert(returnId);
    await assert.rejects(as('admin',`select public.post_web_inventory_movement('${randomUUID()}','return','${JSON.stringify(transfer)}')`),/Choose a project site/);
  });
  await check('mixed-source consumption and reversal expose quantities and real suppliers without prices',async()=>{
    const ids=[];
    for(const [name,quantity] of [['Source Hardware A',4],['Source Hardware B',3]]){
      const key=randomUUID();
      await as('engineer',`insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','10000000-0000-0000-0000-000000000003/${key}/receipt.webp')`);
      const purchase=result(await as('engineer',`select public.submit_site_purchase('${key}','${project}','${site}',null,'${name}','Test City','09170001111','${key}',current_date,'own_money',null,'[{"materialId":"${material}","quantity":"${quantity}","unitPrice":"100"}]')`));
      await as('finance',`select public.approve_site_purchase('${purchase}')`);
      const tx=await value(`select inventory_transaction_id from public.site_purchase_lines where site_purchase_id='${purchase}'`);
      const history=await rows('foreman',`select * from public.get_mobile_stock_provenance('${project}','${site}',array['${tx}']::uuid[])`);
      assert.equal(history[0].direction,'In');assert.equal(history[0].site_purchase_id,purchase);assert.equal(history[0].sources[0].name,name);
      await as('finance',`select public.mark_site_purchase_reimbursed('${purchase}',current_date,'${key}')`);
      ids.push(tx);
    }
    const tx=result(await as('foreman',`select public.consume_site_material('${randomUUID()}','${material}','${location}','${project}',8,'${unit}','USE-MIXED',current_date,'Recorded actual work')`));
    const history=await rows('foreman',`select * from public.get_mobile_stock_provenance('${project}','${site}',array['${tx}']::uuid[])`);
    const names=history[0].sources.map((item)=>item.name);
    assert(names.includes('Source Hardware A'));assert(names.includes('Source Hardware B'));
    assert.equal(history[0].sources.reduce((sum,item)=>sum+Number(item.quantity),0),8);
    assert.equal(history[0].direction,'Out');assert.equal(history[0].reference,'USE-MIXED');
    assert(!JSON.stringify(history).match(/unit_cost|total_cost|unit_price|total_value/));
    const reversal=result(await as('admin',`select public.reverse_inventory_transaction('${randomUUID()}','${tx}','Correct mistaken consumption')`));
    const back=await rows('engineer',`select * from public.get_mobile_stock_provenance('${project}','${site}',array['${reversal}']::uuid[])`);
    assert.equal(back[0].direction,'In');assert.deepEqual(back[0].sources,history[0].sources);
    await assert.rejects(as('foreman',`select * from public.get_mobile_stock_provenance('${randomUUID()}','${site}',array['${tx}']::uuid[])`),/Not authorized/);
    assert.equal(await value(`select count(*) from public.inventory_transactions where id in ('${ids.join("','")}')`),'2');
  });
  console.log(`${checks} stock simplification checks passed.`);
},{seedAfterMigrations:false,beforeMigration:async({name,sql})=>{
  if(name!=='20261012120000_retire_opening_setup.sql')return;
  await sql(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  const scalar=(s)=>s.split('\n').at(-1);
  const source=scalar(await sql(`select id from public.inventory_locations where warehouse_id='${warehouse}'`));
  const unit=scalar(await sql(`select base_unit_id from public.materials where id='${material}'`));
  const legacy=randomUUID();
  await sql(`insert into public.materials(id,code,name,base_unit_id,created_by,updated_by) values('${legacy}','LEGACY-TEST','Legacy cleanup fixture','${unit}','${admin}','${admin}');
    insert into public.inventory_balances(material_id,inventory_location_id,quantity_on_hand) values('${legacy}','${source}',10);
    insert into public.inventory_valuations(material_id,inventory_location_id,quantity_on_hand,total_value) values('${legacy}','${source}',10,null);`);
  await check('cleanup aborts with actionable unvalued stock counts and leaves setup available',async()=>{
    await assert.rejects(sql(cleanup),/1 unvalued stock locations/);
    assert.equal(scalar(await sql("select to_regclass('public.inventory_opening_values') is not null")),'t');
  });
  await sql(`begin;select set_config('request.jwt.claim.sub','${admin}',true);
    select public.verify_opening_stock_value('${randomUUID()}','${legacy}','${source}',10,1000,'Verified test count and cost');commit;`);
  await check('cleanup refuses unvalued transit and dependent setup functions without dropping data',async()=>{
    const transfer=randomUUID(),item=randomUUID();
    const destination=scalar(await sql(`select id from public.inventory_locations where project_site_id='${site}'`));
    await sql(`insert into public.inventory_transfers(id,transfer_number,source_location_id,destination_location_id,external_reference,dispatched_by,dispatched_at)
      values('${transfer}','TRF-LEGACY-TEST','${source}','${destination}','Old delivery','${admin}',now());
      insert into public.inventory_transfer_items(id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity)
      values('${item}','${transfer}','${legacy}','${unit}',2);`);
    await assert.rejects(sql(cleanup),/1 unvalued in-transit items/);
    await sql(`begin;select set_config('request.jwt.claim.sub','${admin}',true);
      select public.verify_legacy_transit_value('${randomUUID()}','${item}',200,0,'Signed dispatch','Verified old transit');commit;`);
    await sql(`update public.inventory_cost_layers set remaining_value=remaining_value+1 where transfer_item_id='${item}'`);
    await assert.rejects(sql(cleanup),/1 inconsistent transit batches/);
    await sql(`update public.inventory_cost_layers set remaining_value=remaining_value-1 where transfer_item_id='${item}';
      update public.inventory_balances set quantity_on_hand=quantity_on_hand+1 where material_id='${legacy}' and inventory_location_id='${source}'`);
    await assert.rejects(sql(cleanup),/1 balance\/valuation mismatches/);
    await sql(`update public.inventory_balances set quantity_on_hand=quantity_on_hand-1 where material_id='${legacy}' and inventory_location_id='${source}'`);
    await sql(`create function public.cleanup_dependency_probe() returns void language plpgsql as $$begin perform id from public.inventory_opening_values; end;$$`);
    await assert.rejects(sql(cleanup),/function still references setup tables/);
    await sql('drop function public.cleanup_dependency_probe()');
  });
  snapshot=scalar(await sql(preserved));
  auditSnapshot=scalar(await sql('select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a'));
  auditIds=JSON.parse(scalar(await sql('select json_agg(id::text) from public.audit_logs')));
}});
