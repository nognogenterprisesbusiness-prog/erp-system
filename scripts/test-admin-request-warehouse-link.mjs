import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withIsolatedPostgres } from './isolated-postgres-fixture.mjs';

const project='20000000-0000-0000-0000-000000000001',site='40000000-0000-0000-0000-000000000001';
const warehouse='30000000-0000-0000-0000-000000000001',other='30000000-0000-0000-0000-000000000002';
const material='60000000-0000-0000-0000-000000000001';
await withIsolatedPostgres(async({sql,as,result,scalar})=>{
  const value=async(q)=>scalar(await sql(q));
  const request=result(await as('foreman',`select public.submit_mobile_material_request('${randomUUID()}','${project}','${site}','Warehouse selection','[{"materialId":"${material}","quantity":"3"}]')`));
  await sql(`delete from public.project_warehouses where project_id='${project}'`);
  const balances=await value('select jsonb_agg(to_jsonb(b) order by id) from public.inventory_balances b');
  assert.equal(scalar(await as('admin',`select count(*) from public.get_request_warehouse_choices('${request}','request')`)),'0');
  assert.equal(scalar(await as('admin',`select count(*) from public.get_admin_request_warehouse_choices('${request}','request') where not is_linked`)),'2');
  const key=randomUUID(),assign=`select public.link_and_assign_request_warehouse('${key}','${request}','request','${warehouse}')`;
  for(const role of ['foreman','engineer','finance','warehouse_staff']) {
    await assert.rejects(as(role,assign),/Only Admin/);
    await assert.rejects(as(role,`select * from public.get_admin_request_warehouse_choices('${request}','request')`),/Only Admin/);
  }
  await assert.rejects(sql(`set role anon; ${assign}`),/permission denied/);
  await assert.rejects(as('admin',assign.replace(`'${key}'`,'null')),/required/);
  assert.equal(await value(`select count(*) from public.project_warehouses where project_id='${project}'`),'0');
  const saved=await Promise.all([as('admin',assign),as('admin',assign)]);
  for(const output of saved) assert.equal(result(output),request);
  assert.equal(await value(`select count(*) from public.project_warehouses where project_id='${project}'`),'1');
  assert.equal(await value(`select count(*) from private.request_warehouse_assignments where target_id='${request}'`),'1');
  assert.equal(await value(`select source_warehouse_id from public.material_requests where id='${request}'`),warehouse);
  assert.equal(await value('select jsonb_agg(to_jsonb(b) order by id) from public.inventory_balances b'),balances);
  assert.equal(await value(`select count(*) from public.material_request_reservations r join public.material_request_lines l on l.id=r.request_line_id where l.request_id='${request}'`),'0');
  assert.equal(scalar(await as('warehouse_staff',`select count(*) from public.get_request_warehouse_choices('${request}','request')`)),'1');
  await assert.rejects(as('admin',assign.replace(warehouse,other)),/different/);
  assert.equal(await value(`select count(*) from public.project_warehouses where project_id='${project}' and warehouse_id='${other}'`),'0');
  await sql(`update public.warehouses set status='inactive' where id='${other}'`);
  await assert.rejects(as('admin',assign.replace(key,randomUUID()).replace(warehouse,other)),/active warehouse/);
  await sql(`update public.projects set status='completed' where id='${project}'`);
  assert.equal(scalar(await as('admin',`select count(*) from public.get_admin_request_warehouse_choices('${request}','request')`)),'0');
  await assert.rejects(as('admin',assign.replace(key,randomUUID())),/active warehouse/);
  assert.equal(result(await as('admin',assign)),request);
  console.log('PASS: Admin-only linking, denied roles, empty linked choices, concurrent/replayed saves, changed retries, inactive records and unchanged stock/reservations.');
});
