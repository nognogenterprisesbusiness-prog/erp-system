import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

await withIsolatedPostgres(async ({ sql, as, users, result, scalar }) => {
  const project='20000000-0000-0000-0000-000000000001', site='40000000-0000-0000-0000-000000000001';
  const vehicle=randomUUID();
  const value=async(q)=>scalar(await sql(q));
  const location=await value(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.project_site_id='${site}'`);
  await sql(`begin; insert into public.assets(id,asset_kind,code,name,brand,model,acquisition_date,ownership_type,status,current_location_id,created_by,updated_by)
    values('${vehicle}','vehicle','TRUCK-FUEL','Fuel test truck','Test','Test',current_date,'company_owned','available','${location}','${users.admin}','${users.admin}'); insert into public.vehicle_details(asset_id,vehicle_type,plate_number) values('${vehicle}','Truck','TEST-123'); commit;`);
  const make=async(amount,role='engineer',paid='company_cash')=>{
    const key=randomUUID();
    await sql(`insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','${users[role]}/${key}/receipt.webp')`);
    return { key, call:`select public.submit_vehicle_fuel_receipt('${key}','${project}','${site}','${vehicle}',${amount},'${paid}','Fuel for hauling')` };
  };
  const stock=await value(`select coalesce(sum(quantity_on_hand),0) from public.inventory_balances`);
  const low=await make(50000,'engineer','own_money');
  const posted=await Promise.all([as('engineer',low.call),as('engineer',low.call)]);
  const id=result(posted[0]); assert.equal(result(posted[1]),id);
  assert.equal(await value(`select status from public.site_purchases where id='${id}'`),'approved');
  const expense=await value(`select project_expense_id from public.site_purchases where id='${id}'`);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${low.key}'`),'1');
  assert.equal(await value(`select amount from public.project_additional_expenses where id='${expense}'`),'50000.00');
  assert.equal(await value(`select receipt_date=(now() at time zone 'Asia/Manila')::date from public.site_purchases where id='${id}'`),'t');
  await assert.rejects(as('engineer',low.call.replace('50000','49999')),/different receipt/);
  await as('finance',`select public.mark_site_purchase_reimbursed('${id}',current_date,'FUEL-REIMBURSE')`);
  await as('finance',`select public.mark_site_purchase_reimbursed('${id}',current_date,'FUEL-REIMBURSE')`);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${low.key}'`),'1');
  console.log('PASS: PHP 50,000 auto-posts once, concurrent retries and reimbursement do not duplicate expense or stock');
  const high=await make(50000.01);
  const highId=result(await as('engineer',high.call));
  assert.equal(await value(`select project_expense_id is null and status='submitted' from public.site_purchases where id='${highId}'`),'t');
  await assert.rejects(as('finance',`select public.approve_site_purchase('${highId}')`),/require Admin/);
  await assert.rejects(as('engineer',`select public.approve_site_purchase('${highId}')`),/Only Admin/);
  await Promise.all([as('admin',`select public.approve_site_purchase('${highId}')`),as('admin',`select public.approve_site_purchase('${highId}')`)]);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${high.key}'`),'1');
  console.log('PASS: above PHP 50,000 requires Admin and concurrent approvals post one expense');
  const rejected=await make(60000); const rejectedId=result(await as('engineer',rejected.call));
  await as('finance',`select public.reject_site_purchase('${rejectedId}','Receipt is incorrect')`);
  await assert.rejects(as('admin',`select public.approve_site_purchase('${rejectedId}')`),/rejected/);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${rejected.key}'`),'0');
  const midnight=await make(100); const midnightId=result(await as('engineer',midnight.call));
  await sql(`update public.site_purchases set receipt_date=receipt_date-1 where id='${midnightId}'`);
  assert.equal(result(await as('engineer',midnight.call)),midnightId);
  assert.equal(await value(`select receipt_date<(now() at time zone 'Asia/Manila')::date from public.site_purchases where id='${midnightId}'`),'t');
  console.log('PASS: rejected receipts never post, retry preserves original posting date across midnight');
  for(const role of ['foreman','warehouse_staff','finance']) {
    const denied=await make(100,role);
    await assert.rejects(as(role,denied.call),/Not authorized/);
  }
  const invalid=await make(100);
  await assert.rejects(as('engineer',invalid.call.replace(vehicle,randomUUID())),/currently at this site/);
  await assert.rejects(as('engineer',invalid.call.replace(site,randomUUID())),/Not authorized|not active/);
  await assert.rejects(as('engineer',invalid.call.replace(',100,',',0,')),/Invalid diesel/);
  const noPhoto=await make(100); await sql(`delete from storage.objects where name='${users.engineer}/${noPhoto.key}/receipt.webp'`);
  await assert.rejects(as('engineer',noPhoto.call),/receipt photo/);
  await assert.rejects(as('engineer',`select private.post_site_receipt_expense('${highId}','${users.engineer}')`),/permission denied/);
  console.log('PASS: denied roles, cross-site vehicles, missing photos, invalid totals and private posting bypass');
  await as('admin',`select public.reverse_project_cost_entry('${randomUUID()}','expense','${expense}','Incorrect fuel receipt')`);
  assert.equal(await value(`select count(*) from public.project_expense_reversals where expense_id='${expense}'`),'1');
  await as('admin',`select public.approve_site_purchase('${id}')`);
  assert.equal(await value(`select count(*) from public.project_additional_expenses where idempotency_key='${low.key}'`),'1');
  assert.equal(await value(`select coalesce(sum(quantity_on_hand),0) from public.inventory_balances`),stock);
  assert.equal(await value(`select count(*) from public.site_purchase_lines where site_purchase_id in ('${id}','${highId}')`),'0');
  console.log('PASS: append-only expense reversal, retry after reversal, no stock or fake material lines');
  const history=(role='engineer',filter=vehicle,offset=0,limit=100,search='')=>as(role,
    `select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.list_mobile_vehicle_history('${project}','${site}','${filter}','${search}',${offset},${limit}) x`)
    .then(output=>JSON.parse(scalar(output)));
  const rate=randomUUID(), usage=randomUUID();
  await sql(`insert into public.asset_events(asset_id,event_type,current_status,current_location_id,summary,actor_id)
    values('${vehicle}','registered','available','${location}','Vehicle registered at site','${users.admin}');
    insert into public.equipment_hour_rates(id,asset_id,hourly_rate,effective_start_date,approved_by)
    values('${rate}','${vehicle}',100,current_date,'${users.admin}');
    begin; select set_config('request.jwt.claim.sub','${users.foreman}',true);
    insert into public.project_equipment_usage(id,project_id,project_site_id,asset_id,asset_code,asset_name,use_date,hours_used,rate_id,hourly_rate_snapshot,cost_total,work_note,recorded_by,idempotency_key,command_payload)
    values('${usage}','${project}','${site}','${vehicle}','TRUCK-FUEL','Fuel test truck',current_date,2,'${rate}',100,200,'Hauling materials','${users.foreman}','${randomUUID()}','{}'); commit;`);
  const material='60000000-0000-0000-0000-000000000001';
  const unit=await value(`select base_unit_id from public.materials where id='${material}'`);
  const source=await value(`select id from public.inventory_locations where warehouse_id='30000000-0000-0000-0000-000000000001'`);
  const destination=await value(`select id from public.inventory_locations where project_site_id='${site}'`);
  await as('admin',`select public.post_web_inventory_movement('${randomUUID()}','stock-in','${JSON.stringify({materialId:material,unitId:unit,destinationLocationId:source,quantity:'5',totalCost:'500',remarks:'Vehicle history fixture stock'})}')`);
  const transfer=result(await as('admin',`select public.post_web_inventory_movement('${randomUUID()}','transfer','${JSON.stringify({materialId:material,unitId:unit,sourceLocationId:source,destinationLocationId:destination,quantity:'3',remarks:'Documented direct site delivery'})}')`));
  await sql(`insert into public.material_delivery_manifests(transfer_id,vehicle_asset_id,vehicle_label,driver_name,delivery_reference,payload_hash,dispatched_by)
    values('${transfer}','${vehicle}','TRUCK-FUEL','Test driver','DELIVERY-HISTORY','fixture','${users.admin}')`);
  const timeline=await history();
  assert.ok(timeline.some(x=>x.record.kind==='movement'));
  assert.ok(timeline.some(x=>x.record.kind==='usage' && x.record.hours===2));
  assert.ok(timeline.some(x=>x.record.kind==='delivery' && x.record.note.includes('3.0000 remaining') && x.record.reference==='DELIVERY-HISTORY'));
  assert.ok(timeline.some(x=>x.record.kind==='fuel' && x.record.purchase_id===id && x.record.status==='reversed'));
  for(const row of timeline) for(const key of ['cost_total','hourly_rate_snapshot','receipt_amount','amount','details']) assert.equal(key in row.record,false);
  assert.equal((await history('foreman')).length,timeline.length);
  assert.equal((await history('engineer',vehicle,0,2))[0].total_count,timeline.length);
  const pages=[...(await history('engineer',vehicle,0,2)),...(await history('engineer',vehicle,2,2))];
  assert.equal(new Set(pages.map(x=>x.record.id)).size,4);
  assert.equal((await history('engineer',vehicle,0,100,'TRUCK-FUEL')).length,timeline.length);
  assert.equal((await history('engineer',randomUUID())).length,0);
  await assert.rejects(as('engineer',`select * from public.list_mobile_vehicle_history('${project}','${randomUUID()}')`),/Not authorized/);
  await assert.rejects(as('engineer',`select * from public.list_mobile_vehicle_history('${project}','${site}',null,'',-1,20)`),/Invalid/);
  await assert.rejects(sql(`begin; set local role anon; select * from public.list_mobile_vehicle_history('${project}','${site}'); commit;`),/permission denied/);
  const warehouseLocation=await value(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.warehouse_id='30000000-0000-0000-0000-000000000001'`);
  await sql(`update public.assets set current_location_id='${warehouseLocation}',updated_by='${users.admin}' where id='${vehicle}'`);
  assert.ok((await history()).length>=timeline.length);
  console.log('PASS: site vehicle timeline combines movement, hours and diesel; pagination/search, historical access and price-free permission boundaries');
});
