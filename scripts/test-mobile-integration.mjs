import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { withLocalFixture } from "./local-integration-fixture.mjs";
const project = "20000000-0000-0000-0000-000000000001",
  site = "40000000-0000-0000-0000-000000000001";
await withLocalFixture(async ({ sql, as, users, result }) => {
  const installed = Number(
    await sql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_mobile_projects'",
    ),
  );
  if (!installed)
    await sql(
      readFileSync(
        new URL(
          "../supabase/migrations/20260928100000_mobile_site_commands.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  await as(
    "engineer",
    `select * from public.get_mobile_projects('',null,0,20)`,
  );
  await assert.rejects(
    as(
      "foreman",
      `select * from public.get_mobile_site_operations('attendance','20000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003')`,
    ),
  );
  await assert.rejects(
    as(
      "warehouse_staff",
      `select * from public.get_mobile_site_operations('attendance','${project}','${site}')`,
    ),
  );
  const workers = [1, 2].map(() => ({
    employee: randomUUID(),
    assignment: randomUUID(),
    key: randomUUID(),
  }));
  for (const w of workers) {
    await sql(`insert into public.employees(id,code,first_name,last_name,category_id,employment_type,hire_date,created_by,updated_by)
      select '${w.employee}','MOB-${w.employee.slice(0, 8).toUpperCase()}','Mobile','Worker',category_id,employment_type,'2026-01-01','${users.admin}','${users.admin}' from public.employees where code='EMP-001';
      insert into public.employee_project_assignments(id,employee_id,project_id,project_site_id,position_title,start_date,assigned_by)
      values('${w.assignment}','${w.employee}','${project}','${site}','Mobile test','2026-01-01','${users.admin}');`);
    await as(
      "admin",
      `select public.post_labor_rate('${w.employee}','daily',750,'2026-01-01',null)`,
    );
  }
  const entries = workers
    .map((w) => ({
      idempotencyKey: w.key,
      assignmentId: w.assignment,
      status: "present",
      hours: "8",
      dayFraction: "1",
      note: "Mobile batch test",
    }))
    .sort((a, b) => a.assignmentId.localeCompare(b.assignmentId));
  const batch = (rows, date = "2026-09-28") =>
    `select public.post_project_attendance_batch('${project}','${site}','${date}','${JSON.stringify(rows)}'::jsonb)`;
  const invalid = entries.map((e, i) => (i === 1 ? { ...e, hours: "25" } : e));
  await assert.rejects(as("foreman", batch(invalid)));
  assert.equal(
    Number(
      await sql(
        `select count(*) from public.project_attendance where assignment_id in ('${workers[0].assignment}','${workers[1].assignment}')`,
      ),
    ),
    0,
    "invalid batch must roll back all workers",
  );
  await assert.rejects(as("engineer", batch(entries)));
  const [one, two] = await Promise.all([
    as("foreman", batch(entries)),
    as("foreman", batch(entries)),
  ]);
  assert.equal(one, two, "concurrent same-key retry returns identical IDs");
  assert.equal(
    Number(
      await sql(
        `select count(*) from public.project_attendance where assignment_id in ('${workers[0].assignment}','${workers[1].assignment}')`,
      ),
    ),
    2,
  );
  await assert.rejects(
    as(
      "foreman",
      batch(entries.map((e) => ({ ...e, idempotencyKey: randomUUID() }))),
    ),
  );
  const attendance = await as(
    "engineer",
    `select record from public.get_mobile_site_operations('attendance','${project}','${site}','2026-09-28')`,
  );
  assert.ok(attendance.includes('"hours_worked"'));
  for (const field of [
    "rate_snapshot",
    "cost_total",
    "rate_id",
    "hourly_rate_snapshot",
  ])
    assert.equal(attendance.includes(field), false);
  const report = randomUUID();
  await as(
    "foreman",
    `select public.save_daily_report('${report}','${project}','${site}','2026-09-28','Clear','Mobile site work','Mobile test complete','','','',false)`,
  );
  const attendanceId = result(
    await sql(
      `select id from public.project_attendance where assignment_id='${workers[0].assignment}'`,
    ),
  );
  const cost = await sql(
    `select sum(cost_total) from public.project_attendance where project_id='${project}'`,
  );
  const warehouse = "30000000-0000-0000-0000-000000000001",
    material = "60000000-0000-0000-0000-000000000001";
  // Same caller RPCs used by mobile commands and web approval/warehouse actions.
  await sql(
    readFileSync(
      new URL(
        "../supabase/migrations/20260927160000_repair_request_receipt_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const requestKey = randomUUID();
  const submit = `select public.submit_material_request('${requestKey}','${project}','${site}','${warehouse}','2026-09-28','Mobile material flow','[{"materialId":"${material}","quantity":"8"}]'::jsonb)`;
  const requestId = result(await as("foreman", submit));
  assert.equal(result(await as("foreman", submit)), requestId);
  const line = result(
    await sql(
      `select id from public.material_request_lines where request_id='${requestId}'`,
    ),
  );
  await assert.rejects(
    as(
      "foreman",
      `select public.decide_material_request('${randomUUID()}','${requestId}','{"${line}":"8"}'::jsonb,null)`,
    ),
  );
  await as(
    "engineer",
    `select public.decide_material_request('${randomUUID()}','${requestId}','{"${line}":"8"}'::jsonb,null)`,
  );
  const releaseKey = randomUUID();
  const release = `select public.dispatch_approved_request_line_with_manifest('${releaseKey}','${line}',8,'2026-09-28','Mobile flow release',null,'Test truck','Test Driver','TEST-TRIP')`;
  const transfer = result(await as("warehouse_staff", release));
  assert.equal(result(await as("warehouse_staff", release)), transfer);
  const item = result(
    await sql(
      `select id from public.inventory_transfer_items where transfer_id='${transfer}'`,
    ),
  );
  const destination = result(
    await sql(
      `select destination_location_id from public.inventory_transfers where id='${transfer}'`,
    ),
  );
  const unit = result(
    await sql(
      `select unit_of_measure_id from public.inventory_transfer_items where id='${item}'`,
    ),
  );
  const receiptKey = randomUUID();
  const receipt = `select public.receive_request_transfer_with_inspection('${receiptKey}','${item}',3,'2026-09-28','Mobile partial receipt','accepted',null)`;
  assert.equal(
    result(await as("foreman", receipt)),
    result(await as("foreman", receipt)),
  );
  await assert.rejects(
    as(
      "foreman",
      `select public.receive_request_transfer_with_inspection('${randomUUID()}','${item}',6,'2026-09-28',null,'accepted',null)`,
    ),
  );
  await as(
    "foreman",
    `select public.receive_request_transfer_with_inspection('${randomUUID()}','${item}',5,'2026-09-28','Mobile full receipt','accepted',null)`,
  );
  assert.equal(
    Number(
      await sql(
        `select received_quantity from public.inventory_transfer_items where id='${item}'`,
      ),
    ),
    8,
  );
  const beforeUse = Number(
    await sql(
      `select quantity_on_hand from public.inventory_balances where material_id='${material}' and inventory_location_id='${destination}'`,
    ),
  );
  const consumeKey = randomUUID();
  const consume = `select public.consume_site_material('${consumeKey}','${material}','${destination}','${project}',2,'${unit}','Mobile flow','2026-09-28','Mobile materials used')`;
  const consumption = result(await as("foreman", consume));
  assert.equal(result(await as("foreman", consume)), consumption);
  assert.equal(
    Number(
      await sql(
        `select quantity_on_hand from public.inventory_balances where material_id='${material}' and inventory_location_id='${destination}'`,
      ),
    ),
    beforeUse - 2,
  );
  const materialCost = await sql(
    `select cost_total from public.inventory_transactions where id='${consumption}'`,
  );
  await assert.rejects(
    as(
      "engineer",
      `select public.attach_daily_report_resource('${report}','material','${consumption}')`,
    ),
  );
  for (let i = 0; i < 2; i++)
    await as(
      "foreman",
      `select public.attach_daily_report_resource('${report}','material','${consumption}')`,
    );
  assert.equal(
    Number(
      await sql(
        `select count(*) from public.daily_report_resource_links where report_id='${report}' and transaction_id='${consumption}'`,
      ),
    ),
    1,
  );
  assert.equal(
    await sql(
      `select cost_total from public.inventory_transactions where id='${consumption}'`,
    ),
    materialCost,
  );
  for (let i = 0; i < 2; i++)
    await as(
      "foreman",
      `select public.attach_daily_report_resource('${report}','attendance','${attendanceId}')`,
    );
  assert.equal(
    await sql(
      `select sum(cost_total) from public.project_attendance where project_id='${project}'`,
    ),
    cost,
  );
  await as(
    "foreman",
    `select public.save_daily_report('${report}','${project}','${site}','2026-09-28','Clear','Mobile site work','Mobile test complete','','','',true)`,
  );
  await assert.rejects(
    as(
      "foreman",
      `select public.review_daily_report('${report}','approve','Self review')`,
    ),
  );
  await as(
    "engineer",
    `select public.review_daily_report('${report}','approve','Mobile reviewed')`,
  );
  await assert.rejects(
    as(
      "foreman",
      `select public.detach_daily_report_resource('${report}','material','${consumption}')`,
    ),
  );
  await as(
    "foreman",
    `do $$ begin if exists(select 1 from public.labor_rates) then raise exception 'Foreman received wages'; end if; end $$`,
  );
  await as(
    "engineer",
    `do $$ begin if exists(select 1 from public.project_attendance where project_id='${project}') then raise exception 'Engineer received financial attendance'; end if; end $$`,
  );
  const asset = result(
    await sql(
      `select id from public.assets where asset_kind='equipment' and status='available' and archived_at is null order by id limit 1`,
    ),
  );
  assert.ok(asset, "fixture needs available equipment");
  const equipmentKey = randomUUID();
  const equipment = `select public.submit_equipment_request_once('${equipmentKey}','${asset}','${project}','${site}',current_date,current_date+1,'Mobile equipment test')`;
  const equipmentId = result(await as("foreman", equipment));
  assert.equal(result(await as("foreman", equipment)), equipmentId);
  await assert.rejects(
    as(
      "foreman",
      equipment.replace("Mobile equipment test", "Changed purpose"),
    ),
  );
  await assert.rejects(as("engineer", equipment));
  await sql(
    `update public.project_assignments set status='inactive' where user_id='${users.foreman}' and project_id='${project}'`,
  );
  // Site-only access must discover the project without granting another site.
  await sql(
    `update public.project_sites set foreman_id='${users.foreman}' where id='${site}'`,
  );
  const onlySite = await as(
    "foreman",
    `select record from public.get_mobile_projects('', '${project}')`,
  );
  assert.ok(onlySite.includes(project));
  assert.ok(onlySite.includes('"can_record": true'));
  const otherSite = randomUUID();
  await sql(`insert into public.project_sites(id,project_id,name,address,status,created_by,updated_by)
    values('${otherSite}','${project}','Mobile denied site','Test address','active','${users.admin}','${users.admin}')`);
  await assert.rejects(
    as(
      "foreman",
      `select * from public.get_mobile_site_operations('attendance','${project}','${otherSite}')`,
    ),
  );
  await as(
    "foreman",
    `select * from public.get_mobile_site_operations('attendance','${project}','${site}')`,
  );
  await sql(
    `update public.project_sites set foreman_id=null where id='${site}'`,
  );
  await assert.rejects(
    as(
      "foreman",
      `select * from public.get_mobile_site_operations('attendance','${project}','${site}')`,
    ),
  );
  console.log(
    "PASS mobile: atomic attendance rollback, retries/concurrency, role/revocation denial, financial redaction, report link cost preservation, independent review and equipment idempotency.",
  );
});
