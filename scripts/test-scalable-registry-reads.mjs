import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withIsolatedPostgres } from "./isolated-postgres-fixture.mjs";

await withIsolatedPostgres(async ({ sql, as, users, scalar }) => {
  const read = async (args, role = "admin") => JSON.parse(scalar(await as(role, `select coalesce(jsonb_agg(x),'[]') from public.search_registry_choices(${args}) x`)));
  await sql(`insert into public.asset_locations(location_kind,name,address,created_by,updated_by)
    select 'other','Depot '||lpad(i::text,5,'0'),'Test address','${users.admin}','${users.admin}' from generate_series(1,12005) i`);
  const first = await read("'asset_location','Depot',0,20");
  assert.equal(first.length,20); assert.equal(Number(first[0].total_count),12005);
  const tail = await read("'asset_location','Depot',12000,20");
  assert.equal(tail.length,5); assert.equal(tail.at(-1).name,'Depot 12005');
  const match = await read("'asset_location','DEPOT 12005',0,20");
  assert.equal(match.length,1); assert.equal(match[0].name,'Depot 12005');
  const selected = await read(`'asset_location','',0,20,'${tail.at(-1).id}'`);
  assert.equal(selected[0].id,tail.at(-1).id);
  assert.equal((await read(`'asset_location','',0,20,'${randomUUID()}'`)).length,0);
  for (const args of ["'asset_location','',-1,20", "'asset_location','',0,51", "'profile'", "null", "'asset_location','',0,null"])
    await assert.rejects(read(args), /Invalid search/);
  await assert.rejects(sql("set role anon;select * from public.search_registry_choices('asset_location')"),/permission denied/);
  // Every role sees exactly the existing row-policy result, never definer access.
  for (const role of ['admin','engineer','foreman','warehouse_staff','finance']) {
    const expected=Number(scalar(await as(role,"select count(*) from public.asset_locations where archived_at is null and name like 'Depot%'")));
    const result=await read("'asset_location','Depot',0,20",role);
    assert.equal(Number(result[0]?.total_count??0),expected);
  }
  const location=scalar(await sql("select id from public.inventory_locations where project_site_id='40000000-0000-0000-0000-000000000001'"));
  const sourceMaterial='60000000-0000-0000-0000-000000000001';
  const unit=scalar(await sql(`select base_unit_id from public.materials where id='${sourceMaterial}'`));
  const category=scalar(await sql(`select category_id from public.materials where id='${sourceMaterial}'`));
  const material=scalar(await as('admin', `select public.save_material(null,'CHART-TEST','Chart material',null,'${category}','${unit}','consumable',0,true)`));
  await sql(`begin; insert into public.inventory_balances(material_id,inventory_location_id,quantity_on_hand) values('${material}','${location}',50);
    insert into public.inventory_transactions(material_id,quantity,unit_of_measure_id,destination_location_id,transaction_type,reference_document,responsible_user_id,transaction_date,cost_total)
    values('${material}',50,'${unit}','${location}','STOCK_IN','Chart opening stock','${users.admin}',current_date,500); commit;`);
  const original=scalar(await as('admin',`select public.consume_site_material('${randomUUID()}','${material}','${location}','20000000-0000-0000-0000-000000000001',7,'${unit}','Chart source',current_date,'Test consumption')`));
  await as('admin',`select public.consume_site_material('${randomUUID()}','${material}','${location}','20000000-0000-0000-0000-000000000001',3,'${unit}','Chart kept',current_date,'Test consumption')`);
  await as('admin',`select public.reverse_inventory_transaction('${randomUUID()}','${original}','Chart correction test')`);
  for(const role of ['admin','engineer','foreman','warehouse_staff','finance']) {
    const actual=scalar(await as(role,"select coalesce(sum(quantity),0) from public.get_monthly_material_consumption(date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month')::date)"));
    const expected=scalar(await as(role,"select coalesce(sum(abs(t.quantity)),0) from public.inventory_transactions t where t.transaction_type='MATERIAL_CONSUMPTION' and t.transaction_date>=date_trunc('month',current_date) and t.transaction_date<date_trunc('month',current_date)+interval '1 month' and not exists(select 1 from public.inventory_transactions r where r.reversal_of=t.id)"));
    assert.equal(Number(actual),Number(expected));
    if(role==='admin') assert.equal(Number(actual),3);
  }
  await assert.rejects(sql("set role anon;select * from public.get_monthly_material_consumption(current_date,current_date+1)"),/permission denied/);
  await assert.rejects(as('admin',"select * from public.get_monthly_material_consumption(current_date,current_date)"),/Invalid chart period/);
  for (const role of ['admin','engineer','foreman','warehouse_staff','finance']) {
    await as(role,"select id,project_id,work_date,attendance_status,hours_worked,note from public.project_attendance order by work_date desc,id limit 20");
    await as(role,"select attendance_id,reason from public.project_attendance_reversals order by attendance_id limit 20");
  }
  const plan=await as('admin',"explain (costs off) select t.material_id,t.unit_of_measure_id,sum(abs(t.quantity)) from public.inventory_transactions t where t.transaction_type='MATERIAL_CONSUMPTION' and t.transaction_date>=current_date-30 and t.transaction_date<current_date+1 and not exists(select 1 from public.inventory_transactions r where r.reversal_of=t.id) group by t.material_id,t.unit_of_measure_id");
  console.log('Consumption aggregation query plan (fictional fixture, not a hosted benchmark):\n'+plan);
  console.log('PASS: 12,005 locations, deep paging/search/selected lookup, invalid parameters, five-role RLS parity, anonymous denial and reversed-consumption chart reconciliation.');
});
