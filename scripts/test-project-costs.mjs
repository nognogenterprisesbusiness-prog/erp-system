import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withIsolatedPostgres } from "./isolated-postgres-fixture.mjs";

const project = "20000000-0000-0000-0000-000000000001";
const site = "40000000-0000-0000-0000-000000000001";
let checks = 0;
const check = async (name, work) => { await work(); console.log(`PASS ${++checks}: ${name}`); };

await withIsolatedPostgres(async ({ sql, as, users, result, scalar }) => {
  const value = async (query) => scalar(await sql(query));
  const json = async (role, query) => JSON.parse(scalar(await as(role, query)));
  const profit = () => json("finance", `select row_to_json(p) from public.get_project_profitability('${project}') p`);
  const source = await value(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.warehouse_id='30000000-0000-0000-0000-000000000001'`);
  const asset = await value("select id from public.assets where code='EQ-EXC-001'");
  const loan = result(await as("foreman", `select public.submit_equipment_request('${asset}','${project}','${site}',current_date,current_date+7,'Work at construction site')`));
  await as("admin", `select public.decide_equipment_request('${loan}',true,null); select public.checkout_equipment_request('${loan}')`);
  const photos = async (role, key) => as(role, `insert into storage.objects(bucket_id,name) values
    ('erp-equipment-evidence','${users[role]}/${key}/start.webp'),('erp-equipment-evidence','${users[role]}/${key}/end.webp')`);
  const usage = (key, date = "current_date-1", hours = 2) => `select public.post_project_equipment_usage_with_photos('${key}','${project}','${asset}',${date},${hours},'Actual equipment work')`;
  const expenseKey = randomUUID();
  const expense = (key = expenseKey, amount = 123.45, reference = "PERMIT-001") => `select public.post_project_additional_expense('${key}','${project}',current_date,'permit','Project permit','${reference}',${amount})`;
  const budget = (key, amount) => `select public.adjust_project_budget('${key}','${project}',${amount},'Approved budget adjustment')`;
  const baseline = await profit();

  await check("equipment date validation uses the Philippine calendar instead of the caller's timezone", async () => {
    assert.equal(await value("select 'TimeZone=Asia/Manila'=any(proconfig) from pg_proc where oid='public.post_project_equipment_usage(uuid,uuid,uuid,date,numeric,text)'::regprocedure"), "t");
    const key = randomUUID();
    await photos("foreman", key);
    await assert.rejects(as("foreman", `set local timezone='Pacific/Honolulu'; ${usage(key, "(now() at time zone 'Asia/Manila')::date+1")}`), /future/);
  });

  await check("cost and budget posting is Admin-only; Finance reads and site roles remain cost-blind", async () => {
    for (const role of ["finance", "engineer", "foreman", "warehouse_staff"]) {
      await assert.rejects(as(role, expense()), /administrator/);
      await assert.rejects(as(role, budget(randomUUID(), 100)), /administrator/);
      await assert.rejects(as(role, `select public.set_equipment_hour_rate('${asset}',100,current_date-10)`), /administrator/);
    }
    for (const role of ["engineer", "foreman", "warehouse_staff"]) await assert.rejects(as(role, `select * from public.get_project_profitability('${project}')`), /authorized/);
  });

  await check("equipment usage requires both evidence photos and cannot bypass the protected wrapper", async () => {
    const key = randomUUID();
    await assert.rejects(as("foreman", usage(key)), /photos are required/);
    await assert.rejects(as("foreman", `select public.post_project_equipment_usage('${key}','${project}','${asset}',current_date-1,2,'Actual equipment work')`), /permission denied/);
    await photos("foreman", key);
    await assert.rejects(as("foreman", usage(key)), /No approved equipment rate/);
    await as("admin", `select public.set_equipment_hour_rate('${asset}',100,current_date-10)`);
  });

  let firstUsage;
  await check("concurrent equipment retry records one cost and rejects a changed payload", async () => {
    const key = randomUUID();
    await photos("foreman", key);
    const outcomes = await Promise.all([as("foreman", usage(key)), as("foreman", usage(key))]);
    firstUsage = result(outcomes[0]);
    assert.equal(result(outcomes[1]), firstUsage);
    await assert.rejects(as("foreman", usage(key, "current_date-1", 3)), /Idempotency key/);
    assert.equal(Number((await profit()).equipment_cost) - Number(baseline.equipment_cost), 200);
  });

  await check("equipment rate changes affect future use only; competing daily entries cannot double-charge", async () => {
    await as("admin", `select public.set_equipment_hour_rate('${asset}',150,current_date)`);
    const keys = [randomUUID(), randomUUID()];
    for (const key of keys) await photos("foreman", key);
    const outcomes = await Promise.allSettled(keys.map((key) => as("foreman", usage(key, "current_date", 2))));
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(outcomes.find((r) => r.status === "rejected").reason.message, /already posted/);
    assert.equal(Number(await value(`select hourly_rate_snapshot from public.project_equipment_usage where id='${firstUsage}'`)), 100);
    assert.equal(Number((await profit()).equipment_cost) - Number(baseline.equipment_cost), 500);
    const future = randomUUID();
    await photos("foreman", future);
    await assert.rejects(as("foreman", usage(future, "(now() at time zone 'Asia/Manila')::date+1")), /future/);
  });

  await check("equipment corrections preserve evidence and remove only the reversed cost", async () => {
    const key = randomUUID();
    const reverse = `select public.reverse_project_cost_entry('${key}','equipment','${firstUsage}','Correct duplicated working time')`;
    await assert.rejects(as("finance", reverse), /administrator/);
    const correction = result(await as("admin", reverse));
    assert.equal(result(await as("admin", reverse)), correction);
    assert.equal(Number((await profit()).equipment_cost) - Number(baseline.equipment_cost), 300);
    assert.equal(await value(`select start_photo_path is not null and end_photo_path is not null from public.project_equipment_usage where id='${firstUsage}'`), "t");
  });

  await check("a Foreman assigned to one site cannot post equipment hours at a sibling site", async () => {
    await sql(`delete from public.project_assignments where user_id='${users.foreman}'; update public.project_sites set foreman_id='${users.foreman}' where id='${site}'`);
    const sibling = randomUUID();
    await sql(`insert into public.project_sites(id,project_id,name,address,created_by,updated_by) values('${sibling}','${project}','Sibling site','Separate site','${users.admin}','${users.admin}')`);
    const target = await value(`select al.id from public.asset_locations al join public.inventory_locations il on il.id=al.inventory_location_id where il.project_site_id='${sibling}'`);
    const other = result(await as("admin", `select public.save_equipment_with_sku(null,'EQ-OTHER','Sibling mixer','',null,'Test brand','Model',current_date,'company_owned','available','${target}','','Mixer','OTHER-123',0,'OTHER-MIXER')`));
    await as("admin", `select public.set_equipment_hour_rate('${other}',100,current_date-10)`);
    const key = randomUUID();
    await photos("foreman", key);
    await assert.rejects(as("foreman", `select public.post_project_equipment_usage_with_photos('${key}','${project}','${other}',current_date-3,2,'Work at another site')`), /authorized|assigned site/);
    assert.equal(await value(`select count(*) from public.project_equipment_usage where asset_id='${other}'`), "0");
  });

  let expenseId;
  await check("concurrent expense retries post once and duplicate external references are refused", async () => {
    const outcomes = await Promise.all([as("admin", expense()), as("admin", expense())]);
    expenseId = result(outcomes[0]);
    assert.equal(result(outcomes[1]), expenseId);
    await assert.rejects(as("admin", expense(expenseKey, 124)), /Idempotency key/);
    await assert.rejects(as("admin", expense(randomUUID(), 123.45, "permit-001")), /duplicate key/);
    assert.equal(Number((await profit()).other_cost) - Number(baseline.other_cost), 123.45);
  });

  await check("expense reversal retries remove a cost once and preserve the posted expense", async () => {
    const key = randomUUID();
    const reverse = `select public.reverse_project_cost_entry('${key}','expense','${expenseId}','Permit receipt correction')`;
    const outcomes = await Promise.all([as("admin", reverse), as("admin", reverse)]);
    assert.equal(result(outcomes[0]), result(outcomes[1]));
    assert.equal(Number((await profit()).other_cost), Number(baseline.other_cost));
    assert.equal(await value(`select count(*) from public.project_additional_expenses where id='${expenseId}'`), "1");
  });

  await check("concurrent budget adjustments cannot create a negative budget and duplicate retries count once", async () => {
    const initial = Number((await profit()).approved_budget);
    const key = randomUUID();
    await Promise.all([as("admin", budget(key, 100)), as("admin", budget(key, 100))]);
    assert.equal(Number((await profit()).approved_budget), initial + 100);
    const outcomes = await Promise.allSettled([as("admin", budget(randomUUID(), -(initial + 100))), as("admin", budget(randomUUID(), -(initial + 100)))]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(outcomes.find((r) => r.status === "rejected").reason.message, /cannot be negative/);
    assert.equal(Number((await profit()).approved_budget), 0);
  });

  await check("project totals reconcile material, labor, equipment, expenses and separate revenue/collection", async () => {
    const summary = await profit();
    assert.equal(Number(summary.total_posted_cost), ["material_cost", "labor_cost", "equipment_cost", "other_cost", "site_stock_loss_cost", "transfer_loss_cost"].reduce((sum, key) => sum + Number(summary[key]), 0));
    assert.equal(Number(summary.estimated_gross_profit), Number(summary.contract_value) - Number(summary.total_posted_cost));
    assert.equal(Number(summary.receivables), Number(summary.invoiced_amount) - Number(summary.cash_received));
  });

  await check("equipment request options remain accessible beyond 300 with site scope and stable paging", async () => {
    await as("admin", `select public.return_equipment_request('${loan}',false,'Equipment safely returned')`);
    await sql(`begin;
      insert into public.assets(id,asset_kind,code,name,category_id,brand,model,acquisition_date,ownership_type,status,current_location_id,created_by,updated_by)
      select gen_random_uuid(),'equipment','EQ-PAGED-'||lpad(g::text,4,'0'),'Paged equipment '||g,null,'Test brand','Model',current_date,'company_owned','available','${source}','${users.admin}','${users.admin}' from generate_series(1,305) g;
      insert into public.equipment_details(asset_id,equipment_type,serial_number,acquisition_cost)
      select id,'Test equipment',code,0 from public.assets where code like 'EQ-PAGED-%';
      commit;`);
    assert.equal(Number(scalar(await as("foreman", `select count(*) from public.get_requestable_equipment('${project}','${site}') where asset_code like 'EQ-PAGED-%'`))), 305);
    const last = await json("foreman", `select jsonb_agg(r) from (select * from public.get_requestable_equipment('${project}','${site}') where asset_code like 'EQ-PAGED-%' order by asset_code,asset_id offset 300 limit 20) r`);
    assert.equal(last.length, 5);
    assert.equal(last[0].asset_code, "EQ-PAGED-0301");
    assert.equal(Number(scalar(await as("foreman", `select count(*) from public.get_requestable_equipment('${project}','${randomUUID()}')`))), 0);
    assert.equal(Number(scalar(await as("finance", `select count(*) from public.get_requestable_equipment('${project}','${site}')`))), 0);
  });
});
console.log(`\n${checks} real PostgreSQL project-cost and capacity checks passed.`);
