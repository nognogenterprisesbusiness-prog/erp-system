import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withLocalFixture } from "./local-integration-fixture.mjs";
await withLocalFixture(async ({ sql, as, users, result }) => {
  const prefix = `TEST-${randomUUID().replaceAll("-", "").slice(0,12).toUpperCase()}`;
  const location = result(await sql("select id from public.inventory_locations where warehouse_id='30000000-0000-0000-0000-000000000001'"));
  assert.ok(location);
  await sql(`insert into public.materials(code,name,category_id,base_unit_id,created_by,updated_by)
    select '${prefix}-'||n,'${prefix} material '||n,m.category_id,m.base_unit_id,'${users.admin}','${users.admin}'
    from generate_series(1,1101) n cross join public.materials m where m.id='60000000-0000-0000-0000-000000000001';
    insert into public.inventory_balances(material_id,inventory_location_id,quantity_on_hand)
    select id,'${location}',10 from public.materials where code like '${prefix}-%';`);
  const ids = new Set();
  let quantity = 0;
  for (let offset=0; offset<1101; offset+=500) {
    const output = await as("admin", `select row_to_json(x) from public.list_inventory_balances('${prefix}','${location}','warehouse',false,${offset},500) x`);
    const rows = output.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
    assert.equal(rows[0].total_count, 1101);
    for (const row of rows) { assert.equal(ids.has(row.id), false); ids.add(row.id); quantity+=Number(row.quantity_on_hand); }
  }
  assert.equal(ids.size,1101);
  assert.equal(quantity,11010);
  console.log("PASS: SQL balance pagination beyond 1,000 records, stable unique pages, exact total count and complete batched quantities. HTTP export still requires separate acceptance.");
});
