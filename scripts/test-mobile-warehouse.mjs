import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withIsolatedPostgres } from "./isolated-postgres-fixture.mjs";

const warehouse = "30000000-0000-0000-0000-000000000001";
const otherWarehouse = "30000000-0000-0000-0000-000000000002";
const project = "20000000-0000-0000-0000-000000000001";
const site = "40000000-0000-0000-0000-000000000001";
const material = "60000000-0000-0000-0000-000000000001";
const queue = (id = warehouse) => `select id,ready_lines from public.list_mobile_warehouse_dispatch('${id}')`;

await withIsolatedPostgres(async ({ sql, as, users, result, scalar }) => {
  assert.equal(scalar(await as("warehouse_staff", "select public.guard_mobile_api(false)")), "t");
  assert.equal(scalar(await as("warehouse_staff", "select public.guard_mobile_api(true)")), "t");
  for (const role of ["foreman", "engineer", "finance", "admin"]) {
    await assert.rejects(as(role, queue()), /Warehouse access required/);
  }
  await assert.rejects(sql(`begin; set local role anon; ${queue()}; commit;`), /permission denied/);
  await assert.rejects(as("warehouse_staff", `select * from public.list_mobile_warehouse_dispatch('${warehouse}',-1,20)`), /Invalid dispatch pagination/);

  const key = randomUUID();
  const request = result(await as("foreman", `select public.submit_material_request('${key}','${project}','${site}','${warehouse}',(now() at time zone 'Asia/Manila')::date,'Concrete foundation work','[{"materialId":"${material}","quantity":"3"}]')`));
  const line = await sql(`select id from public.material_request_lines where request_id='${request}'`);
  assert.ok(line);
  assert.equal(scalar(await as("warehouse_staff", `select count(*) from (${queue()}) q`)), "0");
  await as("engineer", `select public.decide_material_request('${randomUUID()}','${request}','{"${line}":"3"}',null)`);
  assert.equal(scalar(await as("warehouse_staff", queue())), `${request}|1`);
  assert.equal(scalar(await as("warehouse_staff", `select count(*) from (${queue(otherWarehouse)}) q`)), "0");

  const location = await sql(`select id from public.inventory_locations where warehouse_id='${warehouse}'`);
  const stock = `select quantity_on_hand,reserved_quantity,available_quantity from public.list_inventory_balances('Portland Cement','${location}','warehouse')`;
  assert.equal(scalar(await as("warehouse_staff", stock)), "100.0000|3.0000|97.0000");
  await sql(`update public.warehouse_assignments set status='inactive',ended_at=now(),ended_by='${users.admin}'
    where warehouse_id='${warehouse}' and user_id='${users.warehouse_staff}'`);
  await assert.rejects(as("warehouse_staff", queue()), /Warehouse access required/);
  assert.equal(scalar(await as("warehouse_staff", `select count(*) from (${stock}) stock`)), "0");
  console.log("PASS: warehouse access, stock quantities, ready dispatch isolation, role denial, anonymous denial and revoked assignments.");
});
