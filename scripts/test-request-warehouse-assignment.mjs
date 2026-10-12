import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
const warehouse='30000000-0000-0000-0000-000000000001',material='60000000-0000-0000-0000-000000000001';
let checks=0;
await withIsolatedPostgres(async({sql,as,result,scalar,users})=>{
  const value=async(q)=>scalar(await sql(q));
  const check=async(name,work)=>{await work();console.log(`PASS ${++checks}: ${name}`);};
  const key=randomUUID(),lines=JSON.stringify([{materialId:material,quantity:'3'}]);
  const submit=`select public.submit_mobile_material_request('${key}','${project}','${site}','Footing work','${lines}')`;
  let request,line;
  await check('mobile submission uses Manila date with no warehouse or reservation; simultaneous retries create one request',async()=>{
    const ids=await Promise.all([as('foreman',submit),as('foreman',submit)]);
    request=result(ids[0]);assert.equal(result(ids[1]),request);
    assert.equal(await value(`select source_warehouse_id is null and required_date=(now() at time zone 'Asia/Manila')::date from public.material_requests where id='${request}'`),'t');
    line=await value(`select id from public.material_request_lines where request_id='${request}'`);
    assert.equal(await value(`select count(*) from public.material_request_reservations where request_line_id='${line}'`),'0');
    await assert.rejects(as('foreman',submit.replace('Footing work','Changed work')),/different request data/);
    await assert.rejects(as('finance',submit.replace(key,randomUUID())),/not authorized|only staff/);
  });
  await check('unassigned requests reach assigned Warehouse Staff; approval waits for warehouse; roles cannot escalate',async()=>{
    assert.equal(scalar(await as('warehouse_staff',`select count(*) from public.material_requests where id='${request}'`)),'1');
    await assert.rejects(as('engineer',`select public.decide_material_request('${randomUUID()}','${request}','{"${line}":"3"}',null)`),/Choose a source warehouse/);
    const choose=`select public.assign_request_warehouse('${randomUUID()}','${request}','request','${warehouse}')`;
    await assert.rejects(as('foreman',choose),/not authorized/);
    await assert.rejects(as('engineer',choose),/not authorized/);
    await assert.rejects(as('finance',choose),/not authorized/);
    await assert.rejects(as('warehouse_staff',choose.replace(warehouse,randomUUID())),/not authorized/);
  });
  await check('warehouse selection is audited, idempotent and reserves nothing; approval reserves once and locks the source',async()=>{
    const assignmentKey=randomUUID();
    const assign=`select public.assign_request_warehouse('${assignmentKey}','${request}','request','${warehouse}')`;
    const assigned=await Promise.all([as('warehouse_staff',assign),as('warehouse_staff',assign)]);
    assert.equal(result(assigned[0]),request); assert.equal(result(assigned[1]),request);
    assert.equal(await value(`select count(*) from private.request_warehouse_assignments where target_id='${request}'`),'1');
    assert.equal(await value(`select count(*) from public.material_request_reservations where request_line_id='${line}'`),'0');
    assert.equal(result(await as('foreman',submit)),request);
    const approvalKey=randomUUID(),approve=`select public.decide_material_request('${approvalKey}','${request}','{"${line}":"3"}',null)`;
    await Promise.all([as('engineer',approve),as('engineer',approve)]);
    assert.equal(await value(`select sum(remaining_quantity) from public.material_request_reservations where request_line_id='${line}'`),'3.0000');
    await assert.rejects(as('admin',assign.replace(assignmentKey,randomUUID())),/Only submitted/);
    assert.equal(result(await as('warehouse_staff',assign)),request);
  });
  await check('catalog shortages omit warehouse/date, preserve identity, and require Admin warehouse selection before sourcing',async()=>{
    const reportKey=randomUUID();
    const report=`select public.submit_mobile_material_shortage('${reportKey}','${project}','${site}','${material}','Ignored client name','bag',5,'Need more cement')`;
    const id=result(await as('foreman',report));assert.equal(result(await as('foreman',report)),id);
    assert.equal(await value(`select source_warehouse_id is null and reported_material_id='${material}' from public.material_sourcing_requests where id='${id}'`),'t');
    await assert.rejects(as('warehouse_staff',`select public.assign_request_warehouse('${randomUUID()}','${id}','shortage','${warehouse}')`),/not authorized/);
    await as('admin',`select public.assign_request_warehouse('${randomUUID()}','${id}','shortage','${warehouse}')`);
    assert.equal(result(await as('foreman',report)),id);
    await assert.rejects(as('foreman',report.replace(`'${material}'`,'null')),/different catalog identity/);
  });
  await check('request retries after midnight preserve the original date',async()=>{
    // Simulate a request submitted yesterday without changing its immutable payload hash.
    const dayKey=randomUUID();
    const past=`select public.submit_material_request('${dayKey}','${project}','${site}',null,((now() at time zone 'Asia/Manila')::date-1),'Yesterday work','${lines}')`;
    const id=result(await as('foreman',past));
    assert.equal(result(await as('foreman',`select public.submit_mobile_material_request('${dayKey}','${project}','${site}','Yesterday work','${lines}')`)),id);
  });
  await check('purchase overview groups all items before pagination/search and denies non-financial roles',async()=>{
    const supplier=randomUUID();
    await sql(`insert into public.suppliers(id,code,supplier_name,business_name,contact_person,contact_number,email_address,business_address,city,province,payment_terms,created_by,updated_by)
      values('${supplier}','GROUP-SUP','Grouping Hardware','Grouping Hardware','Test Contact','09123456789','group@erp-test.local','Test street','Cebu','Cebu','Cash','${users.admin}','${users.admin}')`);
    const unit=await value(`select base_unit_id from public.materials where id='${material}'`);
    const other=result(await sql(`insert into public.materials(code,name,base_unit_id,created_by,updated_by) values('GROUP-PO','Grouping second item','${unit}',(select id from public.profiles order by id limit 1),(select id from public.profiles order by id limit 1)) returning id`));
    const orderLines=JSON.stringify([{materialId:material,quantity:'2',unitPrice:'100.00'},{materialId:other,quantity:'3',unitPrice:'50.00'}]);
    const id=result(await as('admin',`select public.issue_purchase_order('${randomUUID()}','${supplier}','${warehouse}',current_date,null,'Group order test','${orderLines}')`));
    const rows=JSON.parse(scalar(await as('admin',`select jsonb_agg(to_jsonb(r)) from public.get_purchases('Grouping second item',0,20) r`)));
    assert.equal(rows.length,1);assert.equal(rows[0].purchase_id,id);assert.equal(rows[0].item_count,2);assert.equal(Number(rows[0].order_total),350);
    assert.equal(rows[0].total_count,1);
    const receivedLine=await value(`select id from public.purchase_order_lines where purchase_order_id='${id}' and material_id='${other}'`);
    await as('warehouse_staff',`select public.inspect_purchase_delivery('${randomUUID()}','${receivedLine}',3,3,'GROUP-DR',current_date,null)`);
    await as('warehouse_staff',`select public.receive_purchase_order_line('${randomUUID()}','${receivedLine}',3,null,'GROUP-DR',current_date,null)`);
    assert.equal(scalar(await as('admin',`select delivery_stage from public.get_purchases('Grouping second item',0,20)`)),'partly_received');
    await as('admin',`select public.issue_purchase_order(gen_random_uuid(),'${supplier}','${warehouse}',current_date,null,'Paging group','${orderLines}') from generate_series(1,21)`);
    const page1=JSON.parse(scalar(await as('admin',`select jsonb_agg(to_jsonb(r)) from public.get_purchases('Grouping second item',0,20) r`)));
    const page2=JSON.parse(scalar(await as('admin',`select jsonb_agg(to_jsonb(r)) from public.get_purchases('Grouping second item',20,20) r`)));
    assert.equal(page1.length,20); assert.equal(page2.length,2); assert.equal(page1[0].total_count,22);
    assert.equal(new Set([...page1,...page2].map((r)=>r.purchase_id)).size,22);
    await as('finance',`select * from public.get_purchases('',0,20)`);
    for(const role of ['engineer','foreman','warehouse_staff']) await assert.rejects(as(role,`select * from public.get_purchases('',0,20)`),/Not authorized/);
  });
});
console.log(`${checks} request assignment/purchase grouping checks passed.`);
