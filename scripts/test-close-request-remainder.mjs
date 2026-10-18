import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
const warehouse='30000000-0000-0000-0000-000000000001';
const material='60000000-0000-0000-0000-000000000001';
await withIsolatedPostgres(async({sql,as,result,scalar})=>{
  const value=async(q)=>scalar(await sql(q));
  const reserved=()=>value(`select reserved_quantity from public.inventory_balances b join public.inventory_locations l on l.id=b.inventory_location_id where l.warehouse_id='${warehouse}' and b.material_id='${material}'`);
  const onHand=()=>value(`select quantity_on_hand from public.inventory_balances b join public.inventory_locations l on l.id=b.inventory_location_id where l.warehouse_id='${warehouse}' and b.material_id='${material}'`);
  const approved=async(qty)=>{
    const request=result(await as('foreman',`select public.submit_mobile_material_request('${randomUUID()}','${project}','${site}','Remainder close','[{"materialId":"${material}","quantity":"${qty}"}]')`));
    await as('admin',`select public.assign_request_warehouse('${randomUUID()}','${request}','request','${warehouse}')`);
    const line=await value(`select id from public.material_request_lines where request_id='${request}'`);
    await as('engineer',`select public.decide_material_request('${randomUUID()}','${request}','{"${line}":"${qty}"}',null)`);
    return {request,line};
  };
  const dispatch=(line,qty)=>as('warehouse_staff',`select public.dispatch_approved_request_line_with_manifest('${randomUUID()}','${line}',${qty},current_date,'Partial',null,'Test truck','Test driver','CLOSE-${randomUUID().slice(0,8)}')`);

  const a=await approved(10);
  assert.equal(await reserved(),'10.0000');
  const close=(key,request,reason)=>`select public.close_request_remainder('${key}','${request}','${reason}')`;
  // Nothing dispatched yet: cancellation is the right command, not a partial close.
  await assert.rejects(as('admin',close(randomUUID(),a.request,'Nothing sent yet')),/nothing dispatched/);
  await dispatch(a.line,6);
  assert.equal(await reserved(),'4.0000');
  const before=await onHand();

  // Cancel stays refused after a dispatch; only the new command can free the remainder.
  await assert.rejects(as('admin',`select public.cancel_material_request('${randomUUID()}','${a.request}','Too late')`),/dispatched request cannot be cancelled/);
  for(const role of ['foreman','engineer','finance'])
    await assert.rejects(as(role,close(randomUUID(),a.request,'Not allowed')),/not authorized/);
  await assert.rejects(sql(`set role anon; ${close(randomUUID(),a.request,'Anonymous')}`),/permission denied/);
  await assert.rejects(as('admin',close(randomUUID(),a.request,'ab')),/reason must be/);
  assert.equal(await reserved(),'4.0000');

  const key=randomUUID();
  const outputs=await Promise.all([as('admin',close(key,a.request,'Supplier short; remainder not coming')),as('admin',close(key,a.request,'Supplier short; remainder not coming'))]);
  for(const out of outputs) assert.equal(result(out),a.request);
  assert.equal(await reserved(),'0.0000');
  assert.equal(await onHand(),before,'closing a remainder must not change on-hand stock');
  assert.equal(await value(`select count(*) from public.material_request_reservation_events e join public.material_request_reservations r on r.id=e.reservation_id where r.request_line_id='${a.line}' and e.event_type='released' and e.reason='Supplier short; remainder not coming' and e.quantity=4`),'1');
  assert.equal(await value(`select status from public.material_request_reservations where request_line_id='${a.line}'`),'released');
  await assert.rejects(as('admin',close(key,a.request,'A different reason')),/another movement/);
  await assert.rejects(as('admin',close(randomUUID(),a.request,'Second close')),/no reserved stock remains/);
  // The released remainder can no longer be dispatched.
  await assert.rejects(dispatch(a.line,1),/remaining reserved quantity/);
  // What was already dispatched stays dispatched and receivable.
  const item=await value(`select transfer_item_id from public.material_request_dispatches where request_line_id='${a.line}'`);
  await as('foreman',`select public.receive_request_transfer_with_inspection('${randomUUID()}','${item}',6,current_date,'Full receipt','accepted',null)`);
  assert.equal(await value(`select received_quantity from public.inventory_transfer_items where id='${item}'`),'6.0000');

  // Assigned Warehouse Staff may close, matching who may dispatch.
  const b=await approved(5);
  await dispatch(b.line,2);
  assert.equal(await reserved(),'3.0000');
  assert.equal(result(await as('warehouse_staff',close(randomUUID(),b.request,'Customer reduced the order'))),b.request);
  assert.equal(await reserved(),'0.0000');
  console.log('PASS: Closing a partly dispatched request releases only the undispatched reservation once, with a reason, role limits and retry safety; on-hand and dispatched stock are untouched.');
});
