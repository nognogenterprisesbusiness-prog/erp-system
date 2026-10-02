import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withLocalFixture } from "./local-integration-fixture.mjs";
const project = "20000000-0000-0000-0000-000000000001";
const site = "40000000-0000-0000-0000-000000000001";
const warehouse = "30000000-0000-0000-0000-000000000001";
const material = "60000000-0000-0000-0000-000000000001";
await withLocalFixture(async ({ sql, as, result }) => {
  const request = result(await as("foreman", `select public.submit_material_request('${randomUUID()}','${project}','${site}','${warehouse}',current_date+7,'Concurrent release test','[{"materialId":"${material}","quantity":"10"}]'::jsonb)`));
  const line = result(await sql(`select id from public.material_request_lines where request_id='${request}'`));
  await as("engineer",`select public.decide_material_request('${randomUUID()}','${request}','{"${line}":"10"}'::jsonb,null)`);
  const attempts=await Promise.allSettled([1,2].map(() => as("warehouse_staff",`select public.dispatch_approved_request_line_with_manifest('${randomUUID()}','${line}',10,current_date,'Concurrent release test',null,'Test truck','Test Driver','TEST-TRIP')`)));
  assert.equal(attempts.filter((r) => r.status==="fulfilled").length,1);
  assert.equal(attempts.filter((r) => r.status==="rejected").length,1);
  const negative=await sql("select count(*) from public.inventory_balances where quantity_on_hand<0 or available_quantity<0");
  assert.equal(Number(negative),0);
  console.log("PASS: competing approved-request releases commit once without negative inventory.");
});
