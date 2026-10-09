import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { withIsolatedPostgres } from "./isolated-postgres-fixture.mjs";
import { withLocalFixture } from "./local-integration-fixture.mjs";

const project = "20000000-0000-0000-0000-000000000001";
const site = "40000000-0000-0000-0000-000000000001";
const warehouse = "30000000-0000-0000-0000-000000000001";
const material = "60000000-0000-0000-0000-000000000001";
let checks = 0;
const check = async (name, work) => { await work(); console.log(`PASS ${++checks}: ${name}`); };

const fixture = process.env.ERP_TEST_BACKEND === "supabase" ? withLocalFixture : withIsolatedPostgres;
await fixture(async ({ sql, as, users, result, scalar }) => {
  const value = async (query) => scalar(await sql(query));
  const json = async (role, query) => JSON.parse(scalar(await as(role, query)));
  const unit = await value(`select base_unit_id from public.materials where id='${material}'`);
  const location = await value(`select id from public.inventory_locations where project_site_id='${site}'`);
  const source = await value(`select id from public.inventory_locations where warehouse_id='${warehouse}'`);
  const sibling = randomUUID();
  await sql(`delete from public.project_assignments where user_id in ('${users.engineer}','${users.foreman}');
    update public.project_sites set engineer_id='${users.engineer}',foreman_id='${users.foreman}' where id='${site}';
    insert into public.project_sites(id,project_id,name,address,created_by,updated_by)
    values('${sibling}','${project}','Other site','Different physical site','${users.admin}','${users.admin}');`);
  await check("dashboard counts match visible projects for every role and deny anonymous access", async () => {
    await assert.rejects(sql("select * from public.get_dashboard_project_counts()"), /Authentication required/);
    for (const role of ["admin", "finance", "engineer", "foreman", "warehouse_staff"]) {
      const actual = await json(role, "select row_to_json(c) from public.get_dashboard_project_counts() c");
      const expected = await json(role, `select row_to_json(c) from (
        select count(*) as total,count(*) filter (where status='active') as active,
          count(*) filter (where status='on_hold') as on_hold
          from public.projects where archived_at is null) c`);
      assert.deepEqual(actual, expected, role);
    }
  });
  await check("site assignments agree across database, web and mobile capabilities", async () => {
    for (const role of ["engineer", "foreman"]) {
      const permitted = await json(role, `select row_to_json(c) from public.get_project_site_capabilities('${project}','${site}') c`);
      assert.equal(permitted.can_read, true);
      assert.equal(permitted.can_review, role === "engineer");
      assert.equal(permitted.can_record, role === "foreman");
      const reviewerSites = await json(role, `select to_json(public.get_project_review_sites('${project}'))`);
      assert.deepEqual(reviewerSites, role === "engineer" ? [site] : []);
      const denied = await json(role, `select row_to_json(c) from public.get_project_site_capabilities('${project}','${sibling}') c`);
      assert.deepEqual(denied, { can_read: false, can_review: false, can_record: false });
      const mobile = await json(role, `select json_agg(row_to_json(p)) from public.get_mobile_projects('', '${project}',0,20) p`);
      assert(mobile.some((p) => JSON.stringify(p).includes(site)));
      assert(!mobile.some((p) => JSON.stringify(p).includes(sibling)));
    }
  });
  await check("equipment uses free-text types without categories and retains request, custody and rate safeguards", async () => {
    const assetLocation = await value(`select id from public.asset_locations where inventory_location_id='${source}'`);
    const save = (id = "null", type = "Portable mixer / concrete", status = "available") => `select public.save_equipment_with_sku(
      ${id},'EQ-SIMPLE','Site mixer','',null,'Test brand','Mixer',current_date,'company_owned','${status}',
      '${assetLocation}','','${type}','MIX-123',1000,'MIXER-01')`;
    for (const role of ["finance","engineer","foreman","warehouse_staff"]) await assert.rejects(as(role, save()), /not authorized/);
    const equipment = result(await as("admin", save()));
    assert.equal(await value(`select category_id is null from public.assets where id='${equipment}'`), "t");
    assert.equal(await value(`select equipment_type from public.equipment_details where asset_id='${equipment}'`), "Portable mixer / concrete");
    assert.equal(await value(`select sku from public.equipment_details where asset_id='${equipment}'`), "MIXER-01");
    await assert.rejects(as("admin", "select * from public.asset_categories"), /permission denied/);
    await assert.rejects(as("admin", save(`'${equipment}'`, " ")), /invalid equipment/);
    await assert.rejects(as("admin", save(`'${equipment}'`, "Mixer", "assigned")), /workflow-managed/);
    const loan = result(await as("foreman", `select public.submit_equipment_request('${equipment}','${project}','${site}',current_date,current_date+7,'Mix concrete at site')`));
    await as("admin", `select public.decide_equipment_request('${loan}',true,null); select public.checkout_equipment_request('${loan}')`);
    await assert.rejects(as("admin", save(`'${equipment}'`)), /return the equipment/);
    await as("admin", `select public.return_equipment_request('${loan}',false,'Returned in good condition')`);
    await as("admin", save(`'${equipment}'`, "Site concrete mixer"));
    assert.equal(await value(`select acquisition_cost from public.equipment_details where asset_id='${equipment}'`), "1000.00");
    assert.equal(await value(`select status from public.assets where id='${equipment}'`), "available");
  });
  await check("simple vehicle entry generates codes, permits free-text types and preserves tracking safeguards", async () => {
    const assetLocation = await value(`select id from public.asset_locations where inventory_location_id='${source}'`);
    const save = (id = "null", name = "Site delivery van", type = "6-wheel concrete mixer", plate = "SIM 9876", status = "available", target = `'${assetLocation}'`) =>
      `select public.save_vehicle(${id},'','${name}','${type}','${plate}',${target},'company_owned','${status}','Roadworthy')`;
    for (const role of ["finance", "engineer", "foreman", "warehouse_staff"]) await assert.rejects(as(role, save()), /not authorized/);
    const vehicle = result(await as("admin", save()));
    const details = await json("admin", `select row_to_json(v) from (
      select a.code,a.category_id,a.brand,a.model,a.acquisition_date,v.vehicle_type,v.manufacture_year
      from public.assets a join public.vehicle_details v on v.asset_id=a.id where a.id='${vehicle}'
    ) v`);
    assert.match(details.code, /^VEH-\d{4,}$/);
    assert.equal(details.vehicle_type, "6-wheel concrete mixer");
    for (const field of ["category_id", "brand", "model", "acquisition_date", "manufacture_year"]) assert.equal(details[field], null);
    await assert.rejects(as("admin", save()), /duplicate key/);
    await assert.rejects(as("admin", save("null", "Invalid truck", "", "SIM 9877")), /invalid vehicle/);
    await assert.rejects(as("admin", save("null", "Invalid truck", "Van", "SIM 9877", "assigned")), /invalid vehicle/);
    await assert.rejects(as("admin", save("null", "Invalid truck", "Van", "SIM 9877", "available", "null")), /location is unavailable/);
    assert.equal(await value(`select to_regprocedure('public.save_asset_category(uuid,public.asset_kind,text,text)') is null`), "t");
    await sql(`begin; select set_config('request.jwt.claim.sub','${users.admin}',true);
      update public.assets set brand='Legacy brand',model='Legacy model',acquisition_date=current_date where id='${vehicle}';
      update public.vehicle_details set manufacture_year=2024,current_mileage=12000 where asset_id='${vehicle}'; commit;`);
    await as("admin", save(`'${vehicle}'`, "Updated delivery van", "Pickup / service van"));
    assert.equal(await value(`select brand from public.assets where id='${vehicle}'`), "Legacy brand");
    assert.equal(await value(`select manufacture_year from public.vehicle_details where asset_id='${vehicle}'`), "2024");
    assert.equal(await value(`select current_mileage from public.vehicle_details where asset_id='${vehicle}'`), "12000.00");
    const loan = result(await as("engineer", `select public.submit_equipment_request('${vehicle}','${project}','${site}',current_date,current_date+7,'Transport project materials')`));
    await as("admin", `select public.decide_equipment_request('${loan}',true,null); select public.checkout_equipment_request('${loan}')`);
    await assert.rejects(as("admin", save(`'${vehicle}'`)), /return the vehicle/);
    assert.equal(await value(`select status from public.assets where id='${vehicle}'`), "assigned");
    await as("admin", `select public.return_equipment_request('${loan}',false,'Returned in good condition')`);
    await as("admin", save(`'${vehicle}'`, "Returned van", "Service van"));
    assert.equal(await value(`select count(*) from public.asset_events where asset_id='${vehicle}' and event_type='registered'`), "1");
    assert.equal(await value(`select count(*) from public.asset_events where asset_id='${vehicle}' and event_type='details_updated'`), "2");
  });
  await check("inventory lists zero-stock catalog materials and enforces location and status filters", async () => {
    const category = await value(`select category_id from public.materials where id='${material}'`);
    const empty = result(await as("admin", `select public.save_material(null,'MAT-UNSTOCKED','Unstocked Test Material',null,'${category}','${unit}','consumable',5,true)`));
    const inactive = result(await as("admin", `select public.save_material(null,'MAT-INACTIVE','Inactive Test Material',null,'${category}','${unit}','consumable',0,false)`));
    const row = await json("admin", `select row_to_json(m) from public.list_inventory_materials('Unstocked Test Material','${source}','${category}','active',false,0,24) m`);
    assert.equal(row.material_id, empty);
    assert.equal(Number(row.quantity_on_hand), 0);
    assert.equal(Number(row.available_quantity), 0);
    assert.equal(row.balance_id, null);
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('Unstocked Test Material','${source}',null,'active',true,0,24)`)), "1");
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('Inactive Test Material','${source}',null,'active',false,0,24)`)), "0");
    assert.equal(scalar(await as("admin", `select material_id from public.list_inventory_materials('Inactive Test Material','${source}',null,'all',false,0,24)`)), inactive);
    assert.equal(scalar(await as("warehouse_staff", `select material_id from public.list_inventory_materials('Unstocked Test Material','${source}',null,'active',false,0,24)`)), empty);
    assert.equal(scalar(await as("foreman", `select material_id from public.list_inventory_materials('Unstocked Test Material','${location}',null,'active',false,0,24)`)), empty);
    await assert.rejects(as("foreman", `select * from public.list_inventory_materials('','${source}',null,'active',false,0,24)`), /Inventory location is not available/);
  });
  await check("assigned-site documents and storage metadata are readable without projectwide assignment", async () => {
    const doc = randomUUID();
    await as("admin", `insert into public.project_documents(id,project_id,category,file_name,content_type,file_size,storage_path,uploaded_by)
      values('${doc}','${project}','initial','Plan.pdf','application/pdf',100,'${project}/${doc}','${users.admin}')`);
    await as("admin", `insert into storage.objects(bucket_id,name) values('erp-project-documents','${project}/${doc}')`);
    for (const role of ["engineer", "foreman"]) {
      assert.equal(scalar(await as(role, `select count(*) from public.project_documents where id='${doc}'`)), "1");
      assert.equal(scalar(await as(role, `select count(*) from storage.objects where name='${project}/${doc}'`)), "1");
    }
    for (const role of ["warehouse_staff", "finance"]) assert.equal(scalar(await as(role, `select count(*) from public.project_documents where id='${doc}'`)), "0");
  });
  await check("site Engineer independently reviews a daily report and records approved progress", async () => {
    const report = result(await as("foreman", `select public.save_daily_report('${randomUUID()}','${project}','${site}',current_date,'Sunny','Concrete preparation','Work completed',null,null,null,true)`));
    await assert.rejects(as("foreman", `select public.review_daily_report('${report}','approve',null)`), /independent/);
    await as("engineer", `select public.review_daily_report('${report}','approve',null)`);
    await as("engineer", `select public.record_project_progress('${report}',10,'Initial work complete')`);
    assert.equal(await value(`select count(*) from public.project_progress_entries where daily_report_id='${report}'`), "1");
    await as("engineer", `select public.save_project_material_plan_line('${project}','${site}','${warehouse}','${material}',20,current_date+7,'Planned work')`);
    await assert.rejects(as("engineer", `select public.save_project_material_plan_line('${project}','${sibling}','${warehouse}','${material}',20,current_date+7,'Other site work')`), /authorized/);
  });
  const request = result(await as("foreman", `select public.submit_material_request('${randomUUID()}','${project}','${site}','${warehouse}',current_date+7,'Workflow material test','[{"materialId":"${material}","quantity":"20"}]')`));
  const line = await value(`select id from public.material_request_lines where request_id='${request}'`);
  const decisionKey = randomUUID();
  await check("Engineer approval retries commit one reservation", async () => {
    const command = `select public.decide_material_request('${decisionKey}','${request}','{"${line}":"20"}',null)`;
    await Promise.all([as("engineer", command), as("engineer", command)]);
    assert.equal(await value(`select remaining_quantity from public.material_request_reservations where request_line_id='${line}'`), "20.0000");
    await assert.rejects(as("engineer", `select public.decide_material_request('${decisionKey}','${request}','{"${line}":"19"}',null)`), /idempotency/);
  });
  const dispatch = (key) => `select public.dispatch_approved_request_line_with_manifest('${key}','${line}',20,current_date,'Test dispatch',null,'External truck','Test Driver','TRIP-1')`;
  let transfer;
  await check("two competing warehouse releases commit once without overselling", async () => {
    const attempts = await Promise.allSettled([as("warehouse_staff", dispatch(randomUUID())), as("warehouse_staff", dispatch(randomUUID()))]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((r) => r.status === "rejected").length, 1);
    transfer = result(attempts.find((r) => r.status === "fulfilled").value);
    assert.equal(await value(`select reserved_quantity from public.inventory_balances where material_id='${material}' and inventory_location_id='${source}'`), "0.0000");
  });
  const item = await value(`select id from public.inventory_transfer_items where transfer_id='${transfer}'`);
  const receive = (key, quantity) => `select public.receive_request_transfer_with_inspection('${key}','${item}',${quantity},current_date,'Checked delivery','accepted',null)`;
  await check("all five roles enforce receiver scope and the legacy inspection bypass is closed", async () => {
    for (const role of ["warehouse_staff", "finance"]) await assert.rejects(as(role, receive(randomUUID(), 1)), /not authorized/);
    await assert.rejects(as("foreman", `select public.receive_request_transfer('${randomUUID()}','${item}',1,current_date,null)`), /permission denied/);
    await sql(`update public.project_sites set foreman_id=null where id='${site}';
      update public.project_sites set foreman_id='${users.foreman}' where id='${sibling}'`);
    await assert.rejects(as("foreman", receive(randomUUID(), 1)), /not authorized for receiving site/);
    await sql(`update public.project_sites set foreman_id='${users.foreman}' where id='${site}';
      update public.project_sites set foreman_id=null where id='${sibling}'`);
    await assert.rejects(as("admin", `select public.receive_request_transfer_with_inspection('${randomUUID()}','${item}',1,current_date,null,null,null)`), /acceptance note/);
  });
  let receipt;
  await check("partial inspected receipt with simultaneous retry posts one acceptance and one movement", async () => {
    const key = randomUUID(); const results = await Promise.all([as("foreman", receive(key, 8)), as("foreman", receive(key, 8))]);
    receipt = result(results[0]); assert.equal(result(results[1]), receipt);
    assert.equal(await value(`select received_quantity from public.inventory_transfer_items where id='${item}'`), "8.0000");
    assert.equal(await value(`select count(*) from public.material_delivery_acceptances where inventory_transaction_id='${receipt}'`), "1");
    await assert.rejects(as("foreman", receive(key, 7)), /idempotency/);
    await as("engineer", receive(randomUUID(), 12));
    assert.equal(await value(`select status from public.inventory_transfers where id='${transfer}'`), "received");
  });
  const consume = (key, quantity) => `select public.consume_site_material('${key}','${material}','${location}','${project}',${quantity},'${unit}','USE-1',current_date,'Actual use')`;
  let use;
  await check("concurrent consumption cannot spend the same stock twice and project cost posts once", async () => {
    const attempts = await Promise.allSettled([as("foreman", consume(randomUUID(), 20)), as("foreman", consume(randomUUID(), 20))]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    use = result(attempts.find((r) => r.status === "fulfilled").value);
    assert.equal((await json("finance", `select row_to_json(s) from public.get_project_management_summary('${project}') s`)).material_cost, 2000);
    await assert.rejects(as("admin", `select public.reverse_inventory_transaction('${randomUUID()}','${receipt}','Incorrect count')`), /used or reserved/);
  });
  const reverse = (key, tx, reason = "Incorrect quantity") => `select public.reverse_inventory_transaction('${key}','${tx}','${reason}')`;
  await check("Admin consumption correction restores exact batch and costs; retries and changed payloads are checked", async () => {
    for (const role of ["engineer", "foreman", "warehouse_staff", "finance"]) await assert.rejects(as(role, reverse(randomUUID(), use)), /administrator/);
    const key = randomUUID(); const results = await Promise.all([as("admin", reverse(key, use)), as("admin", reverse(key, use))]);
    assert.equal(result(results[0]), result(results[1]));
    await assert.rejects(as("admin", reverse(key, use, "Different reason")), /idempotency/);
    assert.equal((await json("finance", `select row_to_json(s) from public.get_project_management_summary('${project}') s`)).material_cost, 0);
    assert.equal(await value(`select quantity_on_hand from public.inventory_balances where material_id='${material}' and inventory_location_id='${location}'`), "20.0000");
  });
  await check("receipt correction reopens transit, preserves original inspection and allows a corrected partial receipt", async () => {
    await as("admin", reverse(randomUUID(), receipt));
    assert.equal(await value(`select received_quantity from public.inventory_transfer_items where id='${item}'`), "12.0000");
    assert.equal(await value(`select remaining_value from public.inventory_cost_layers where transfer_item_id='${item}' and remaining_quantity>0`), "800.00");
    assert.equal(await value(`select status from public.inventory_transfers where id='${transfer}'`), "partially_received");
    assert.equal(await value(`select count(*) from public.material_delivery_acceptances where inventory_transaction_id='${receipt}'`), "1");
    await as("foreman", receive(randomUUID(), 6));
    assert.equal(await value(`select received_quantity from public.inventory_transfer_items where id='${item}'`), "18.0000");
    await as("foreman", receive(randomUUID(), 2));
  });
  await check("Finance can read attendance costs but cannot post stock or issue a material decision", async () => {
    const assignment = await value(`select a.id from public.employee_project_assignments a join public.employees e on e.id=a.employee_id where e.code='EMP-001' and a.project_id='${project}' limit 1`);
    const key = randomUUID();
    const attendance = `select public.post_project_attendance('${key}','${assignment}',current_date-1,'present',8,'daily',1,'Actual full day')`;
    const posted = await Promise.all([as("foreman", attendance), as("foreman", attendance)]);
    assert.equal(result(posted[0]), result(posted[1]));
    const rows = await json("finance", `select json_agg(row_to_json(a)) from public.project_attendance a where a.id='${result(posted[0])}'`);
    assert.equal(rows[0].cost_total, 750);
    assert.equal((await json("finance", `select row_to_json(s) from public.get_project_management_summary('${project}') s`)).labor_cost, 750);
    assert.equal(scalar(await as("foreman", `select count(*) from public.project_attendance where id='${result(posted[0])}'`)), "0");
    const redacted = await json("foreman", `select json_agg(row_to_json(a)) from public.get_project_attendance_operations('${project}',0,20) a`);
    assert(redacted.some((a) => a.id === result(posted[0]))); assert(!JSON.stringify(redacted).includes("cost_total"));
    await assert.rejects(as("finance", consume(randomUUID(), 1)), /not authorized/);
    await assert.rejects(as("finance", `select public.decide_material_request('${randomUUID()}','${request}','{"${line}":"20"}',null)`), /approval required/);
    for (const role of ["engineer", "foreman", "warehouse_staff"]) await assert.rejects(as(role, `select * from public.get_project_management_summary('${project}')`), /authorized/);
  });
  await check("billing and collection reconcile, reject changed retries and enforce remaining contract value", async () => {
    const key = randomUUID();
    const command = `select public.issue_client_invoice('${key}','${project}','Progress claim',current_date,current_date+30,1000)`;
    const invoices = await Promise.all([as("finance", command), as("finance", command)]);
    const invoice = result(invoices[0]); assert.equal(result(invoices[1]), invoice);
    const payKey = randomUUID(); const pay = `select public.record_client_payment('${payKey}','${invoice}',600,current_date,'PAY-1')`;
    await Promise.all([as("finance", pay), as("finance", pay)]);
    const summary = await json("finance", `select row_to_json(s) from public.get_project_management_summary('${project}') s`);
    assert.equal(summary.invoiced_amount, 1000); assert.equal(summary.cash_received, 600);
    await assert.rejects(as("finance", `select public.record_client_payment('${randomUUID()}','${invoice}',500,current_date,'OVERPAY')`), /exceed|remaining/i);
    await assert.rejects(as("foreman", command), /authorized/);
    const remaining = summary.contract_amount - summary.invoiced_amount;
    await assert.rejects(as("finance", `select public.issue_client_invoice('${randomUUID()}','${project}','Excess claim',current_date,current_date+30,${remaining + 1})`), /exceeds/);
    const claims = await Promise.allSettled([1, 2].map(() => as("finance", `select public.issue_client_invoice('${randomUUID()}','${project}','Final claim',current_date,current_date+30,${remaining})`)));
    assert.equal(claims.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(claims.filter((r) => r.status === "rejected").length, 1);
    const collections = await Promise.allSettled([1, 2].map(() => as("finance", `select public.record_client_payment('${randomUUID()}','${invoice}',400,current_date,'FINAL-PAY')`)));
    assert.equal(collections.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(collections.filter((r) => r.status === "rejected").length, 1);
  });
  const supplier = randomUUID(), category = randomUUID(), catalog = randomUUID();
  await sql(`begin; select set_config('request.jwt.claim.sub','${users.admin}',true); insert into public.supplier_categories(id,name,created_by,updated_by)
    values('${category}','Test supplier category','${users.admin}','${users.admin}');
    insert into public.suppliers(id,code,supplier_name,business_name,category_id,contact_person,contact_number,email_address,business_address,city,province,payment_terms,created_by,updated_by)
    values('${supplier}','TEST-SUP','Test Hardware','Test Hardware Co','${category}','Test Contact','09123456789','supplier@erp-test.local','Test address','Cebu','Cebu','Cash','${users.admin}','${users.admin}');
    insert into public.supplier_materials(id,supplier_id,material_id,supplier_material_code,unit_of_measure_id,minimum_order_quantity,created_by,updated_by)
    values('${catalog}','${supplier}','${material}','TEST-CEMENT','${unit}',1,'${users.admin}','${users.admin}');
    insert into public.supplier_prices(supplier_material_id,unit_price,effective_start_date,recorded_by)
    values('${catalog}',250,current_date,'${users.admin}'); commit;`);
  const issue = (key) => `select public.issue_purchase_order('${key}','${supplier}','${warehouse}',current_date,current_date+7,'Test purchase','[{"materialId":"${material}","quantity":"100","unitPrice":"250"}]')`;
  await check("supplier categories are retired without losing existing suppliers or their historical links", async () => {
    assert.equal(await value(`select to_regprocedure('public.save_supplier_category(uuid,text,text)') is null`), "t");
    assert.equal(await value(`select to_regprocedure('public.archive_supplier_category(uuid)') is null`), "t");
    await assert.rejects(as("admin", "select * from public.supplier_categories"), /permission denied/);
    const save = (categoryId) => `select public.save_supplier('${supplier}','','Test Hardware',null,${categoryId},null,'09123456789',null,'Test address',null,null,null,'Cash','active',null)`;
    await assert.rejects(as("admin", save(`'${category}'`)), /categories have been retired/);
    await as("admin", save("null"));
    assert.equal(await value(`select category_id from public.suppliers where id='${supplier}'`), category);
    assert.equal(scalar(await as("finance", `select count(*) from public.suppliers where id='${supplier}'`)), "1");
  });
  const quoteLines = `[{"materialId":"${material}","quantity":"100","unitPrice":"250"}]`;
  const quoteKey = randomUUID();
  const quoteCommand = (key, price = 250) => `select public.record_supplier_quotation('${key}','${supplier}','TEST-Q-1',current_date,current_date+7,'Initial written offer','[{"materialId":"${material}","quantity":"100","unitPrice":"${price}"}]')`;
  let quote;
  await check("supplier quotation is immutable, comparable and restricted to Admin write access", async () => {
    await assert.rejects(as("finance", quoteCommand(randomUUID())), /Only Admin/);
    const results = await Promise.all([as("admin", quoteCommand(quoteKey)), as("admin", quoteCommand(quoteKey))]);
    quote = result(results[0]); assert.equal(result(results[1]), quote);
    await assert.rejects(as("admin", quoteCommand(quoteKey, 260)), /Idempotency key/);
    assert.equal(await value(`select total::text from public.supplier_quotations where id='${quote}'`), "25000.00");
    assert.equal(scalar(await as("finance", `select count(*) from public.supplier_quotations where id='${quote}'`)), "1");
    assert.equal(scalar(await as("foreman", `select count(*) from public.supplier_quotations where id='${quote}'`)), "0");
    assert.equal(scalar(await as("finance", `select count(*) from public.list_supplier_quotation_lines('TEST-Q-1','${material}',0,20)`)), "1");
    const otherSupplier = result(await as("admin", "select public.save_supplier(null,'','Comparison Hardware',null,null,null,'09171234568',null,'Danao, Cebu',null,null,null,null,'active',null)"));
    const cheaperQuote = result(await as("admin", `select public.record_supplier_quotation('${randomUUID()}','${otherSupplier}','TEST-Q-2',current_date,current_date+7,null,'[{"materialId":"${material}","quantity":"100","unitPrice":"240"}]')`));
    assert.equal(scalar(await as("finance", `select quotation_id from public.list_supplier_quotation_lines('TEST-Q-','${material}',0,20) limit 1`)), cheaperQuote);
    assert.equal(scalar(await as("finance", `select count(*) from public.list_supplier_quotation_lines('TEST-Q-','${material}',1,1)`)), "1");
  });
  const poKey = randomUUID();
  const procure = (key, requestId = request, quoteId = quote, lines = quoteLines, targetWarehouse = warehouse) =>
    `select public.submit_procurement_purchase('${key}','${supplier}','${targetWarehouse}',current_date,current_date+7,'Test purchase','${lines}','${requestId}','${quoteId}')`;
  const po = (await json("admin", procure(poKey))).id;
  const poLine = await value(`select id from public.purchase_order_lines where purchase_order_id='${po}'`);
  const purchaseReceive = (key, quantity) => `select public.receive_purchase_order_line('${key}','${poLine}',${quantity},null,'TEST-DR',current_date,null)`;
  const inspect = (key, delivered, accepted, ref = "TEST-DR", note = "null") =>
    `select public.inspect_purchase_delivery('${key}','${poLine}',${delivered},${accepted},'${ref}',current_date,${note})`;
  await check("linked request and quotation match supplier, warehouse, material and exact offered price", async () => {
    assert.equal(await value(`select material_request_id::text || ':' || supplier_quotation_id::text from public.purchase_procurement_context where idempotency_key='${poKey}'`), `${request}:${quote}`);
    assert.equal((await json("admin", procure(poKey))).id, po);
    await assert.rejects(as("admin", procure(poKey, randomUUID())), /different sourcing/);
    await assert.rejects(as("admin", procure(randomUUID(), request, quote, `[{"materialId":"${material}","quantity":"100","unitPrice":"251"}]`)), /match the selected quotation/);
    await assert.rejects(as("admin", procure(randomUUID(), request, quote, quoteLines, randomUUID())), /warehouse/);
    const pendingRequest = result(await as("foreman", `select public.submit_material_request('${randomUUID()}','${project}','${site}','${warehouse}',current_date+7,'Pending procurement test','[{"materialId":"${material}","quantity":"1"}]')`));
    await assert.rejects(as("admin", procure(randomUUID(), pendingRequest, quote)), /requires Engineer approval/);
    await assert.rejects(as("finance", procure(randomUUID())), /Only Admin/);
    assert.equal(scalar(await as("foreman", `select count(*) from public.purchase_procurement_context where idempotency_key='${poKey}'`)), "0");
  });
  let purchaseTx;
  await check("simple purchasing: three-field supplier, typed prices become the latest supplier price, history stays immutable", async () => {
    assert.equal(await value(`select supplier_price_id is not null from public.purchase_order_lines where id='${poLine}'`), "t");
    const vic = result(await as("admin", "select public.save_supplier(null,'','VIC Hardware',null,null,null,'09171234567',null,'Borbon, Cebu',null,null,null,null,'active',null)"));
    assert.match(await value(`select code from public.suppliers where id='${vic}'`), /^SUP-\d{4}$/);
    await assert.rejects(as("finance", "select public.save_supplier(null,'','Other',null,null,null,'09171234567',null,'Cebu',null,null,null,null,'active',null)"), /not authorized/);
    await assert.rejects(as("admin", "select public.save_supplier(null,'','No Address',null,null,null,'09171234567',null,'',null,null,null,null,'active',null)"), /invalid supplier/);
    const order = (date, price, lines = `[{"materialId":"${material}","quantity":"1000","unitPrice":"${price}"}]`) =>
      `select public.issue_purchase_order('${randomUUID()}','${vic}','${warehouse}',${date},null,null,'${lines}')`;
    const approvedOrder = async (date, price) => {
      const key = randomUUID();
      const payload = `[{"materialId":"${material}","quantity":"1000","unitPrice":"${price}"}]`;
      const response = JSON.parse(scalar(await as("admin",
        `select public.submit_purchase_order('${key}','${vic}','${warehouse}',${date},null,null,'${payload}')`)));
      assert.equal(response.kind, "pending");
      assert.equal(await value(`select count(*) from public.purchase_orders where idempotency_key='${key}'`), "0");
      return result(await as("admin", `select public.decide_purchase_owner_approval('${response.id}',true,null)`));
    };
    const first = await approvedOrder("current_date - 10", 100);
    const prices = () => value(`select string_agg(unit_price::text || '@' || effective_start_date::text || '-' || coalesce(effective_end_date::text, 'open'), ',' order by effective_start_date)
      from public.supplier_prices p join public.supplier_materials m on m.id = p.supplier_material_id where m.supplier_id = '${vic}'`);
    assert.equal(await prices(), `100.00@${await value("select (current_date - 10)::text")}-open`);
    await approvedOrder("current_date", 120);
    assert.equal(await prices(), `100.00@${await value("select (current_date - 10)::text")}-${await value("select (current_date - 1)::text")},120.00@${await value("select current_date::text")}-open`);
    const history = await prices();
    const backdated = await approvedOrder("current_date - 5", 110);
    const sameDay = await approvedOrder("current_date", 130);
    assert.equal(await prices(), history);
    assert.equal(await value(`select unit_price::text || ':' || (supplier_price_id is null)::text from public.purchase_order_lines where purchase_order_id='${backdated}'`), "110.00:true");
    assert.equal(await value(`select unit_price::text || ':' || (supplier_price_id is null)::text from public.purchase_order_lines where purchase_order_id='${sameDay}'`), "130.00:true");
    assert.equal(await value(`select count(*) from public.supplier_materials where supplier_id='${vic}'`), "1");
    assert.equal(await value(`select (expected_on is null and purpose is null)::text from public.purchase_orders where id='${first}'`), "true");
    assert.equal(Number(scalar(await as("finance", `select order_total from public.get_purchase_order_payment_summaries(array['${first}']::uuid[])`))), 100000);
    await assert.rejects(as("admin", order("current_date", 100, `[{"materialId":"${material}","quantity":"1","unitPrice":"100"},{"materialId":"${material}","quantity":"2","unitPrice":"100"}]`)), /each material once/);
    await assert.rejects(as("admin", order("current_date", 0)), /unit price/);
    await assert.rejects(as("foreman", order("current_date", 100)), /administrator/);
  });
  await check("PHP 50,000 issues automatically; higher purchases wait for audited Admin approval", async () => {
    const exactKey = randomUUID();
    const exactLines = `[{"materialId":"${material}","quantity":"200","unitPrice":"250"}]`;
    const submit = (key, lines) => `select public.submit_procurement_purchase('${key}','${supplier}','${warehouse}',current_date,null,null,'${lines}',null,null)`;
    const exact = JSON.parse(scalar(await as("admin", submit(exactKey, exactLines))));
    assert.equal(exact.kind, "issued");
    assert.equal(await value(`select status from public.purchase_orders where id='${exact.id}'`), "issued");
    const highKey = randomUUID();
    const highLines = `[{"materialId":"${material}","quantity":"201","unitPrice":"260"}]`;
    const currentPrice = () => value(`select unit_price::text from public.supplier_prices where supplier_material_id='${catalog}' and effective_end_date is null order by id desc limit 1`);
    const priceBefore = await currentPrice();
    const pending = JSON.parse(scalar(await as("admin", submit(highKey, highLines))));
    assert.equal(pending.kind, "pending");
    assert.equal(await value(`select order_total::text from public.purchase_approval_requests where id='${pending.id}'`), "52260.00");
    assert.equal(await value(`select count(*) from public.purchase_orders where idempotency_key='${highKey}'`), "0");
    assert.equal(await currentPrice(), priceBefore);
    await assert.rejects(as("admin", `select public.issue_purchase_order('${highKey}','${supplier}','${warehouse}',current_date,null,null,'${highLines}')`), /Owner approval is required/);
    await assert.rejects(as("finance", submit(randomUUID(), highLines)), /Only Admin/);
    await assert.rejects(as("finance", `select public.decide_purchase_owner_approval('${pending.id}',true,null)`), /administrator/);
    assert.deepEqual(JSON.parse(scalar(await as("admin", submit(highKey, highLines)))), pending);
    await assert.rejects(as("admin", submit(highKey, exactLines)), /Idempotency key/);
    const decisions = await Promise.all([
      as("admin", `select public.decide_purchase_owner_approval('${pending.id}',true,'Owner reviewed price')`),
      as("admin", `select public.decide_purchase_owner_approval('${pending.id}',true,'Owner reviewed price')`),
    ]);
    const approved = result(decisions[0]);
    assert.equal(result(decisions[1]), approved);
    assert.equal(await value(`select purchase_order_id::text from public.purchase_approval_requests where id='${pending.id}'`), approved);
    assert.equal(await currentPrice(), priceBefore);
    assert.equal(await value(`select unit_price::text from public.purchase_order_lines where purchase_order_id='${approved}'`), "260.00");
    assert.equal(result(await as("admin", `select public.decide_purchase_owner_approval('${pending.id}',true,'Owner reviewed price')`)), approved);
    const rejectedKey = randomUUID();
    const rejected = JSON.parse(scalar(await as("admin", submit(rejectedKey, highLines))));
    await as("admin", `select public.decide_purchase_owner_approval('${rejected.id}',false,'Price exceeds plan')`);
    assert.equal(await value(`select count(*) from public.purchase_orders where idempotency_key='${rejectedKey}'`), "0");
    await assert.rejects(as("admin", `select public.decide_purchase_owner_approval('${rejected.id}',true,null)`), /already decided/);
    const linkedQuote = result(await as("admin", `select public.record_supplier_quotation('${randomUUID()}','${supplier}','TEST-Q-HIGH',current_date,current_date+7,null,'${highLines}')`));
    const linkedKey = randomUUID();
    const linked = JSON.parse(scalar(await as("admin", `select public.submit_procurement_purchase('${linkedKey}','${supplier}','${warehouse}',current_date,null,null,'${highLines}','${request}','${linkedQuote}')`)));
    assert.equal(linked.kind, "pending");
    assert.equal(await value(`select material_request_id::text || ':' || supplier_quotation_id::text from public.purchase_procurement_context where idempotency_key='${linkedKey}'`), `${request}:${linkedQuote}`);
    const linkedOrder = result(await as("admin", `select public.decide_purchase_owner_approval('${linked.id}',true,'Verified request and quotation')`));
    assert.equal(await value(`select idempotency_key::text from public.purchase_orders where id='${linkedOrder}'`), linkedKey);
  });
  await check("supplier inspection records partial acceptance; uninspected receipt is denied", async () => {
    await assert.rejects(as("warehouse_staff", purchaseReceive(randomUUID(), 40)), /Accepted delivery inspection/);
    await assert.rejects(as("finance", inspect(randomUUID(), 45, 40, "TEST-DR", "'Five bags damaged'")), /Only Admin or assigned/);
    const key = randomUUID();
    const attempts = await Promise.all([as("warehouse_staff", inspect(key, 45, 40, "TEST-DR", "'Five bags damaged'")), as("warehouse_staff", inspect(key, 45, 40, "TEST-DR", "'Five bags damaged'"))]);
    assert.equal(result(attempts[0]), result(attempts[1]));
    await assert.rejects(as("warehouse_staff", inspect(key, 45, 41, "TEST-DR", "'Four bags damaged'")), /Idempotency key/);
    assert.equal(await value(`select accepted_quantity::text || ':' || quality_note from public.purchase_delivery_inspections where id='${result(attempts[0])}'`), "40.0000:Five bags damaged");
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "0.0000");
    assert.equal(scalar(await as("warehouse_staff", `select count(*) from public.get_open_purchase_inspections(array['${poLine}']::uuid[])`)), "1");
    assert.equal(scalar(await as("finance", `select count(*) from public.get_open_purchase_inspections(array['${poLine}']::uuid[])`)), "0");
    await assert.rejects(as("warehouse_staff", inspect(randomUUID(), 101, 101, "TOO-MUCH")), /remaining purchase order quantity/);
    await as("warehouse_staff", inspect(randomUUID(), 5, 0, "REJECTED-DR", "'All damaged'"));
    await assert.rejects(as("warehouse_staff", `select public.receive_purchase_order_line('${randomUUID()}','${poLine}',5,null,'REJECTED-DR',current_date,null)`), /Accepted delivery inspection/);
  });
  await check("warehouse PO receipt retries post one cost snapshot and partial delivery", async () => {
    const key = randomUUID(); const posted = await Promise.all([as("warehouse_staff", purchaseReceive(key, 40)), as("warehouse_staff", purchaseReceive(key, 40))]);
    assert.equal(result(posted[0]), result(posted[1]));
    purchaseTx = await value(`select inventory_transaction_id from public.purchase_order_receipts where idempotency_key='${key}'`);
    assert.equal(await value(`select cost_total from public.inventory_transactions where id='${purchaseTx}'`), "10000.00");
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "40.0000");
    assert.equal(await value(`select inspection_id is not null from public.purchase_order_receipts where idempotency_key='${key}'`), "t");
    assert.equal(scalar(await as("warehouse_staff", `select count(*) from public.get_open_purchase_inspections(array['${poLine}']::uuid[])`)), "0");
    await assert.rejects(as("finance", purchaseReceive(randomUUID(), 1)), /assigned|administrator/i);
    await assert.rejects(as("warehouse_staff", `select public.receive_purchase_order_line('${randomUUID()}','${poLine}',1,200,'BAD-PRICE',current_date,'Discount')`), /administrator/);
  });
  await check("Admin PO receipt correction reverses exact batch, reopens order and supports replacement with the same delivery reference", async () => {
    const attempts = await Promise.allSettled([as("admin", reverse(randomUUID(), purchaseTx)), as("admin", reverse(randomUUID(), purchaseTx))]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await value(`select status from public.purchase_orders where id='${po}'`), "issued");
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "0.0000");
    await as("warehouse_staff", inspect(randomUUID(), 35, 35));
    await as("warehouse_staff", purchaseReceive(randomUUID(), 35));
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "35.0000");
    assert.equal(await value(`select count(*) from public.purchase_order_receipts where purchase_order_line_id='${poLine}'`), "2");
    await assert.rejects(as("warehouse_staff", purchaseReceive(randomUUID(), 5)), /delivery reference|Accepted delivery inspection/);
    assert.equal(await value(`select cost_total from public.inventory_transactions where id='${purchaseTx}'`), "10000.00");
  });
  await check("used receipt batch cannot be replaced by unrelated stock with enough overall quantity", async () => {
    const replacement = await value(`select inventory_transaction_id from public.purchase_order_receipts where purchase_order_line_id='${poLine}' order by created_at desc limit 1`);
    await as("admin", `select public.post_stock_out('${randomUUID()}','${material}','${source}',1,'${unit}','USED-BATCH',current_date,null,'Test use')`);
    assert(Number(await value(`select available_quantity from public.inventory_balances where material_id='${material}' and inventory_location_id='${source}'`)) > 35);
    await assert.rejects(as("admin", reverse(randomUUID(), replacement)), /original receipt batch has been used/);
  });
  await check("partial approvals and dispatch retries preserve reservations; returned batches preserve project cost", async () => {
    const partial = result(await as("foreman", `select public.submit_material_request('${randomUUID()}','${project}','${site}','${warehouse}',current_date+7,'Partial delivery test','[{"materialId":"${material}","quantity":"10"}]')`));
    const partialLine = await value(`select id from public.material_request_lines where request_id='${partial}'`);
    await as("engineer", `select public.decide_material_request('${randomUUID()}','${partial}','{"${partialLine}":"8"}','Only eight required')`);
    assert.equal(await value(`select status from public.material_requests where id='${partial}'`), "partially_approved");
    const key = randomUUID();
    const release = (releaseKey, qty) => `select public.dispatch_approved_request_line_with_manifest('${releaseKey}','${partialLine}',${qty},current_date,'Partial release',null,'Test truck','Test Driver','PARTIAL-TRIP')`;
    const first = await Promise.all([as("warehouse_staff", release(key, 3)), as("warehouse_staff", release(key, 3))]);
    assert.equal(result(first[0]), result(first[1]));
    assert.equal(await value(`select remaining_quantity from public.material_request_reservations where request_line_id='${partialLine}'`), "5.0000");
    await assert.rejects(as("warehouse_staff", release(key, 2)), /idempotency/);
    const second = result(await as("warehouse_staff", release(randomUUID(), 5)));
    for (const transferId of [result(first[0]), second]) {
      const transferItem = await value(`select id from public.inventory_transfer_items where transfer_id='${transferId}'`);
      const amount = await value(`select dispatched_quantity from public.inventory_transfer_items where id='${transferItem}'`);
      await as("foreman", `select public.receive_request_transfer_with_inspection('${randomUUID()}','${transferItem}',${amount},current_date,'Checked partial delivery','accepted',null)`);
    }
    const used = result(await as("foreman", consume(randomUUID(), 2)));
    assert.equal(await value(`select cost_total from public.inventory_transactions where id='${used}'`), "500.00");
    await as("admin", reverse(randomUUID(), used));
    const returned = result(await as("admin", `select public.dispatch_inventory_transfer('${randomUUID()}','${material}','${location}','${source}',5,'${unit}','RETURN-1',current_date,'Unused material returned')`));
    const returnedItem = await value(`select id from public.inventory_transfer_items where transfer_id='${returned}'`);
    const returnKey = randomUUID();
    const receiveReturn = (qty) => `select public.receive_inventory_transfer('${returnKey}','${returnedItem}',${qty},current_date,'Checked return')`;
    await Promise.all([as("warehouse_staff", receiveReturn(5)), as("warehouse_staff", receiveReturn(5))]);
    await assert.rejects(as("warehouse_staff", receiveReturn(4)), /idempotency/);
    assert.equal(await value(`select received_total_cost from public.inventory_transfer_items where id='${returnedItem}'`), "1250.00");
    assert.equal((await json("finance", `select row_to_json(s) from public.get_project_management_summary('${project}') s`)).material_cost, 0);
  });
  await check("searchable billing projects and expected deliveries remain accessible beyond 500 records", async () => {
    await as("admin", `insert into public.projects(code,name,client_name,address,city_province,start_date,target_completion_date,contract_amount,initial_budget,status,created_by,updated_by)
      select 'PAGED-'||lpad(n::text,4,'0'),'Paged project '||n,'Test Client','Test address','Cebu',current_date,current_date+30,1000,900,'active','${users.admin}','${users.admin}' from generate_series(1,505) n;
      select public.issue_purchase_order(gen_random_uuid(),'${supplier}','${warehouse}',current_date,current_date+7,'Paged delivery test','[{"materialId":"${material}","quantity":"100","unitPrice":"250"}]') from generate_series(1,505)`);
    const projects = await json("finance", "select json_agg(row_to_json(p)) from public.get_billable_projects('',500,20) p");
    assert(projects.length > 0); assert(projects[0].total_count > 500);
    const searched = await json("finance", "select json_agg(row_to_json(p)) from public.get_billable_projects('PAGED-0505',0,20) p");
    assert.equal(searched[0].code, "PAGED-0505");
    const deliveries = await json("warehouse_staff", "select json_agg(row_to_json(p)) from public.get_warehouse_receivable_po_lines('',500,20) p");
    assert(deliveries.length > 0); assert(deliveries[0].total_count > 500);
    assert.equal(scalar(await as("warehouse_staff", `select count(*) from public.get_warehouse_receivable_po_lines('${deliveries.at(-1).po_number}',0,20)`)), "1");
    assert.equal(scalar(await as("finance", "select count(*) from public.get_billable_projects('%_',0,20)")), "0");
    await assert.rejects(as("foreman", "select * from public.get_warehouse_receivable_po_lines('',0,20)"), /authorized/);
    await assert.rejects(as("warehouse_staff", "select * from public.get_billable_projects('',0,20)"), /authorized/);
  });
  await check("vehicle choices page beyond 500 and exclude transport outside the warehouse operator's scope", async () => {
    await sql(`begin; select set_config('request.jwt.claim.sub','${users.admin}',true);
      with inserted as (
        insert into public.assets(code,name,asset_kind,category_id,brand,model,acquisition_date,ownership_type,status,current_location_id,created_by,updated_by)
        select 'PAGED-V-'||lpad(n::text,4,'0'),'Test fleet vehicle '||n,'vehicle','80000000-0000-0000-0000-000000000003','Test Brand','Test Model',current_date,'company_owned','available',
        (select id from public.asset_locations where inventory_location_id='${source}'),'${users.admin}','${users.admin}' from generate_series(1,505) n returning id,code
      ) insert into public.vehicle_details(asset_id,vehicle_type,plate_number,manufacture_year,current_mileage) select id,'Truck',code,2026,0 from inserted;
      commit;`);
    const choices = await json("warehouse_staff", "select json_agg(row_to_json(v)) from public.get_delivery_vehicle_choices('',500,20) v");
    assert(choices.length > 0); assert(choices[0].total_count > 500);
    const last = await json("warehouse_staff", "select json_agg(row_to_json(v)) from public.get_delivery_vehicle_choices('PAGED-V-0505',0,20) v");
    assert.equal(last.length, 1);
    await sql(`update public.assets set current_location_id='81000000-0000-0000-0000-000000000001' where id='${last[0].id}'`);
    assert.equal(scalar(await as("warehouse_staff", "select count(*) from public.get_delivery_vehicle_choices('PAGED-V-0505',0,20)")), "0");
    assert.equal(scalar(await as("admin", "select count(*) from public.get_delivery_vehicle_choices('PAGED-V-0505',0,20)")), "1");
  });
  await check("disabled or onboarding accounts cannot reuse commands or stale assignments", async () => {
    await sql(`update public.profiles set onboarding_required=true where id='${users.engineer}'`);
    assert.equal((await json("engineer", `select row_to_json(c) from public.get_project_site_capabilities('${project}','${site}') c`)).can_read, false);
    await assert.rejects(as("engineer", receive(randomUUID(), 1)), /authorized/);
    await sql(`update public.profiles set onboarding_required=false where id='${users.engineer}';
      update public.profiles set is_active=false where id='${users.warehouse_staff}'`);
    await assert.rejects(as("warehouse_staff", purchaseReceive(randomUUID(), 1)), /assigned/);
    await sql(`update public.profiles set is_active=true where id='${users.warehouse_staff}'`);
  });
  await check("supplier payments: postdated check and cash up to the PO balance, retries post once, only Admin voids", async () => {
    const stockBeforePayment = await value(`select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.inventory_balances b`);
    const movementsBeforePayment = await value("select count(*) from public.inventory_transactions");
    const total = Number(await value(`select sum(round(ordered_quantity * unit_price, 2)) from public.purchase_order_lines where purchase_order_id='${po}'`));
    const pay = (key, method, amount, bank = "null", check = "null", date = "current_date") => `select public.record_supplier_payment('${key}','${po}','${method}',${bank},${check},${amount},${date},null)`;
    const checkKey = randomUUID(); const first = total - 5000;
    const posted = await Promise.all([as("finance", pay(checkKey, "check", first, "'Metrobank'", "'123456'", "current_date + 30")), as("finance", pay(checkKey, "check", first, "'Metrobank'", "'123456'", "current_date + 30"))]);
    assert.equal(result(posted[0]), result(posted[1]));
    assert.equal(await value(`select count(*) from public.supplier_payments where purchase_order_id='${po}'`), "1");
    await assert.rejects(as("finance", pay(checkKey, "check", first - 1, "'Metrobank'", "'123456'")), /idempotency/i);
    await assert.rejects(as("finance", pay(randomUUID(), "check", 100)), /bank and check number/);
    await assert.rejects(as("finance", pay(randomUUID(), "cash", 5000.01)), /exceeds the purchase order balance/);
    for (const role of ["warehouse_staff", "engineer", "foreman"]) await assert.rejects(as(role, pay(randomUUID(), "cash", 1)), /Admin or Finance/);
    const cash = result(await as("admin", pay(randomUUID(), "cash", 5000)));
    assert.equal(Number(scalar(await as("finance", `select balance from public.get_purchase_order_payment_summaries(array['${po}']::uuid[])`))), 0);
    await assert.rejects(as("finance", `select public.void_supplier_payment('${cash}','Wrong amount')`), /administrator/);
    await as("admin", `select public.void_supplier_payment('${cash}','Wrong amount')`);
    await as("admin", `select public.void_supplier_payment('${cash}','Wrong amount')`);
    assert.equal(Number(scalar(await as("finance", `select balance from public.get_purchase_order_payment_summaries(array['${po}']::uuid[])`))), 5000);
    assert.equal(scalar(await as("finance", `select count(*) from public.supplier_payments where supplier_id=(select supplier_id from public.purchase_orders where id='${po}')`)), "2");
    assert.equal(scalar(await as("warehouse_staff", "select count(*) from public.supplier_payments")), "0");
    await assert.rejects(as("finance", "update public.supplier_payments set amount = 1"), /permission denied/);
    assert.equal(await value(`select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.inventory_balances b`), stockBeforePayment, "payments and voids do not add received stock twice");
    assert.equal(await value("select count(*) from public.inventory_transactions"), movementsBeforePayment);
  });
  await check("Finance reads purchasing, stock value and movement costs without write access; other roles stay cost-blind", async () => {
    const count = async (role, query) => Number(scalar(await as(role, `select count(*) from (${query}) visible`)));
    for (const query of [`select 1 from public.purchase_orders where id='${po}'`, `select 1 from public.purchase_order_lines where id='${poLine}'`,
      `select 1 from public.purchase_order_receipts where purchase_order_line_id='${poLine}'`, "select 1 from public.suppliers", "select 1 from public.supplier_prices",
      "select 1 from public.warehouses", "select 1 from public.inventory_locations", "select 1 from public.inventory_balances",
      "select 1 from public.inventory_valuations where total_value is not null", "select 1 from public.inventory_transactions"]) {
      assert.ok(await count("finance", query) > 0, `Finance should read: ${query}`);
    }
    await as("finance", `select * from public.get_project_material_cost('${project}')`);
    assert.equal(scalar(await as("finance", `select cost_total from public.get_inventory_transaction_costs(array['${purchaseTx}']::uuid[])`)), "10000.00");
    assert.equal(scalar(await as("admin", `select cost_total from public.get_inventory_transaction_costs(array['${purchaseTx}']::uuid[])`)), "10000.00");
    await assert.rejects(as("finance", "select cost_total from public.inventory_transactions limit 1"), /permission denied/);
    for (const role of ["engineer", "foreman", "warehouse_staff"]) {
      await assert.rejects(as(role, `select * from public.get_inventory_transaction_costs(array['${purchaseTx}']::uuid[])`), /not authorized/);
      assert.equal(await count(role, "select 1 from public.supplier_prices"), 0);
      assert.equal(await count(role, "select 1 from public.inventory_valuations"), 0);
    }
    assert.equal(await count("warehouse_staff", "select 1 from public.purchase_orders"), 0);
    await assert.rejects(as("finance", issue(randomUUID())), /administrator|authorized|permission/i);
    await assert.rejects(as("finance", purchaseReceive(randomUUID(), 1)), /assigned|administrator/i);
    await assert.rejects(as("finance", `update public.purchase_orders set purpose='Changed by Finance' where id='${po}'`), /permission denied/);
    await assert.rejects(as("finance", "update public.supplier_prices set unit_price = unit_price + 1"), /permission denied/);
    await assert.rejects(as("finance", "update public.inventory_valuations set total_value = total_value + 1"), /permission denied/);
    await assert.rejects(as("finance", `select public.post_stock_out('${randomUUID()}','${material}','${source}',1,'${unit}','FIN-OUT',current_date,null,'Finance attempt')`), /authorized|administrator|permission/i);
  });
  await check("site staff: Admin assigns Engineer and Foreman, wrong roles are refused, site staff cannot reassign", async () => {
    const staff = () => value(`select coalesce(engineer_id::text,'-') || '/' || coalesce(foreman_id::text,'-') from public.project_sites where id='${sibling}'`);
    await as("admin", `update public.project_sites set engineer_id='${users.engineer}', foreman_id='${users.foreman}', updated_by='${users.admin}' where id='${sibling}'`);
    assert.equal(await staff(), `${users.engineer}/${users.foreman}`);
    await assert.rejects(as("admin", `update public.project_sites set foreman_id='${users.engineer}', updated_by='${users.admin}' where id='${sibling}'`), /foreman|role/i);
    await as("foreman", `update public.project_sites set foreman_id=null, updated_by='${users.foreman}' where id='${sibling}'`);
    assert.equal(await staff(), `${users.engineer}/${users.foreman}`);
    await as("admin", `update public.project_sites set engineer_id=null, foreman_id=null, updated_by='${users.admin}' where id='${sibling}'`);
    assert.equal(await staff(), "-/-");
  });
  await check("no duplicate names: suppliers, materials of the same unit and warehouses are refused ignoring case and spaces", async () => {
    await as("admin", "select public.save_supplier(null,'','City Hardware',null,null,null,'09171234567',null,'Cebu City',null,null,null,null,'active',null)");
    await assert.rejects(as("admin", "select public.save_supplier(null,'','  city   HARDWARE ',null,null,null,'09171234567',null,'Cebu City',null,null,null,null,'active',null)"), /suppliers_name_unique/);
    const materialName = await value(`select name from public.materials where id='${material}'`);
    await assert.rejects(sql(`insert into public.materials(code,name,category_id,base_unit_id,created_by,updated_by)
      select 'DUP-CHECK', upper(name), category_id, base_unit_id, created_by, updated_by from public.materials where id='${material}'`), /materials_name_unit_unique/);
    const warehouseName = await value(`select name from public.warehouses where id='${warehouse}'`);
    await assert.rejects(sql(`insert into public.warehouses(code,name,address,created_by,updated_by)
      select 'WH-DUP', lower(name), address, created_by, updated_by from public.warehouses where id='${warehouse}'`), /warehouses_name_unique/);
    assert.ok(materialName && warehouseName);
  });
  await check("site purchase: Engineer buys at a hardware store with a receipt photo; Admin or Finance approves; stock lands at the site once", async () => {
    const photo = async (role, key) => as(role, `insert into storage.objects(bucket_id,name) values('erp-site-purchase-receipts','${users[role]}/${key}/receipt.webp')`);
    const submit = (key, supplier, receipt, paid = "own_money", newName = "Ace Hardware", qty = 10, price = 260) =>
      `select public.submit_site_purchase('${key}','${project}','${site}',${supplier},${supplier === "null" ? `'${newName}','Mandaue City','09170001111'` : "null,null,null"},'${receipt}',current_date,'${paid}',null,'[{"materialId":"${material}","quantity":"${qty}","unitPrice":"${price}"}]')`;
    const onHand = async () => Number(await value(`select quantity_on_hand from public.inventory_balances where material_id='${material}' and inventory_location_id='${location}'`));
    const before = await onHand();

    const key = randomUUID(); await photo("engineer", key);
    const purchase = result(await as("engineer", submit(key, "null", "OR-1001")));
    assert.equal(result(await as("engineer", submit(key, "null", "OR-1001"))), purchase, "retry returns the same purchase");
    const ace = await value(`select supplier_id from public.site_purchases where id='${purchase}'`);
    assert.equal(await value("select count(*) from public.suppliers where lower(supplier_name)='ace hardware'"), "1");

    const noPhoto = randomUUID();
    await assert.rejects(as("engineer", submit(noPhoto, `'${ace}'`, "OR-1002")), /receipt photo is required/);
    const dup = randomUUID(); await photo("engineer", dup);
    await assert.rejects(as("engineer", submit(dup, `'${ace}'`, "or-1001")), /site_purchases_receipt_unique/);
    const sameName = randomUUID(); await photo("engineer", sameName);
    const second = result(await as("engineer", submit(sameName, "null", "OR-1003", "company_cash", "  ACE hardware ", 5, 270)));
    assert.equal(await value(`select supplier_id from public.site_purchases where id='${second}'`), ace, "typing the same store reuses it");
    await assert.rejects(as("foreman", submit(randomUUID(), `'${ace}'`, "OR-1004")), /Only an Engineer/);
    await assert.rejects(as("warehouse_staff", submit(randomUUID(), `'${ace}'`, "OR-1005")), /Only an Engineer/);
    await assert.rejects(as("engineer", `select public.submit_site_purchase('${randomUUID()}','${project}','${sibling}','${ace}',null,null,null,'OR-1006',current_date,'company_cash',null,'[{"materialId":"${material}","quantity":"1","unitPrice":"1"}]')`), /Not the Engineer/);

    assert.equal(await onHand(), before, "no stock before approval");
    await assert.rejects(as("engineer", `select public.approve_site_purchase('${purchase}')`), /Admin or Finance/);
    await Promise.all([as("finance", `select public.approve_site_purchase('${purchase}')`), as("finance", `select public.approve_site_purchase('${purchase}')`)]);
    assert.equal(await onHand(), before + 10, "approved once, posted once");
    const mobileStock = await json("engineer", `select row_to_json(m) from public.list_inventory_materials('Portland Cement','${location}',null,'active',false,0,20) m where m.material_id='${material}'`);
    assert.equal(Number(mobileStock.quantity_on_hand), before + 10, "the mobile site inventory reads the posted balance");
    assert.equal(scalar(await as("engineer", `select status from public.site_purchases where id='${purchase}'`)), "approved", "the Engineer can see the approval");
    assert.equal(Number(scalar(await as("foreman", `select quantity_on_hand from public.list_inventory_materials('Portland Cement','${location}',null,'active',false,0,20) where material_id='${material}'`))), before + 10);
    assert.equal(await value(`select cost_total from public.inventory_transactions t join public.site_purchase_lines l on l.inventory_transaction_id = t.id where l.site_purchase_id='${purchase}'`), "2600.00");
    assert.equal(await value(`select count(*) from public.inventory_cost_layers where inventory_location_id='${location}' and material_id='${material}' and unit_cost=260 and remaining_quantity>0`), "1");
    assert.equal(await value(`select p.unit_price from public.supplier_prices p join public.supplier_materials m on m.id=p.supplier_material_id where m.supplier_id='${ace}' and p.effective_end_date is null`), "260.00");
    await assert.rejects(as("admin", `select public.reject_site_purchase('${purchase}','Too late')`), /cannot be rejected/);

    await as("admin", `select public.reject_site_purchase('${second}','Wrong project')`);
    assert.equal(await onHand(), before + 10, "a rejected purchase adds no stock");
    await assert.rejects(as("finance", `select public.mark_site_purchase_reimbursed('${second}',current_date,'PCV-1')`), /own money/);
    await assert.rejects(as("engineer", `select public.mark_site_purchase_reimbursed('${purchase}',current_date,'PCV-1')`), /Admin or Finance/);
    await as("finance", `select public.mark_site_purchase_reimbursed('${purchase}',current_date,'PCV-0001')`);
    assert.equal(await value(`select reimbursement_reference from public.site_purchases where id='${purchase}'`), "PCV-0001");

    assert.equal(scalar(await as("engineer", "select count(*) from public.site_purchases")), "2");
    assert.equal(scalar(await as("warehouse_staff", "select count(*) from public.site_purchases")), "0");
    assert.equal(scalar(await as("engineer", "select count(*) from public.get_site_purchase_suppliers()")) !== "0", true);
    await assert.rejects(as("foreman", "select * from public.get_site_purchase_suppliers()"), /not authorized/);
  });
  await check("price batches and stock-in movements show the store they came from", async () => {
    const siteBatchStore = scalar(await as("finance", `select supplier_name from public.get_material_cost_batches('${material}') where location_id='${location}' and unit_cost=260 limit 1`));
    assert.equal(siteBatchStore, "Ace Hardware");
    const tx = await value(`select l.inventory_transaction_id from public.site_purchase_lines l join public.site_purchases p on p.id=l.site_purchase_id where p.status='approved' limit 1`);
    assert.equal(scalar(await as("admin", `select supplier_name from public.get_inventory_transaction_costs(array['${tx}']::uuid[])`)), "Ace Hardware");
    assert.equal(scalar(await as("finance", `select supplier_name from public.get_inventory_transaction_costs(array['${purchaseTx}']::uuid[])`)), "Test Hardware");
    await assert.rejects(as("engineer", `select * from public.get_material_cost_batches('${material}')`), /not authorized/);
  });
  await check("purchasing by supplier: one list of purchase-order and site-purchase items with delivery and payment stages", async () => {
    const stage = async (search, where) => scalar(await as("finance", `select coalesce(max(delivery_stage || '/' || payment_stage), 'none') from public.get_purchase_lines('${search}', 0, 100) where ${where}`));
    const poNumber = await value(`select po_number from public.purchase_orders where id='${po}'`);
    assert.equal(await stage(poNumber, `purchase_id='${po}'`), "partly_received/partly_paid");
    assert.equal(await stage("ace hardware", "source='site_purchase' and payment_stage='paid'"), "received/paid");
    assert.equal(await stage("ace hardware", "source='site_purchase' and delivery_stage='rejected'"), "rejected/none");
    assert.equal(scalar(await as("admin", "select count(*) from public.get_purchase_lines('ace hardware', 0, 100)")) !== "0", true);
    const lines = Number(scalar(await as("finance", "select count(*) from public.get_purchase_lines('', 0, 100) where delivery_stage not in ('cancelled','rejected')")));
    const summary = scalar(await as("finance", "select item_count || '|' || received_count from public.get_purchase_summary()")).split("|").map(Number);
    assert.ok(summary[0] >= Math.min(lines, 100) && summary[1] >= 1);
    await assert.rejects(as("finance", "select * from public.get_purchase_lines('', 0, 500)"), /invalid page/);
    for (const role of ["engineer", "foreman", "warehouse_staff"]) await assert.rejects(as(role, "select * from public.get_purchase_summary()"), /not authorized/);
  });
  await check("out-of-stock report links supplier purchase, partial receipt and Engineer-reviewed site delivery", async () => {
    const unstockedMaterial = await value("select id from public.materials where code='MAT-UNSTOCKED'");
    const noStockReport = result(await as("foreman", `select public.submit_material_sourcing_request('${randomUUID()}','${project}','${site}','${warehouse}','Unstocked Test Material','bag',1,current_date+7,'Required but not received')`));
    await assert.rejects(as("admin", `select public.create_sourcing_material_request('${randomUUID()}','${noStockReport}','${unstockedMaterial}',1,'No warehouse stock')`), /Receive this quantity/);
    const report = result(await as("foreman", `select public.submit_material_sourcing_request('${randomUUID()}','${project}','${site}','${warehouse}','Cement','bag',7,current_date+7,'Needed for site work')`));
    const key = randomUUID();
    const lines = `[{"materialId":"${material}","quantity":"7","unitPrice":"260"}]`;
    const sourcePurchase = (idempotencyKey = key, targetWarehouse = warehouse, targetMaterial = material) =>
      `select public.submit_sourcing_purchase('${idempotencyKey}','${supplier}','${targetWarehouse}',current_date,null,'Site shortage','${lines}',null,'${report}','${targetMaterial}')`;
    await assert.rejects(as("finance", sourcePurchase()), /Only Admin/);
    await assert.rejects(as("admin", sourcePurchase(randomUUID(),randomUUID())), /warehouse/);
    await assert.rejects(as("admin", sourcePurchase(randomUUID(),warehouse,randomUUID())), /chosen shortage material/);
    const purchase = await json("admin", sourcePurchase());
    assert.equal(purchase.kind, "issued");
    assert.equal((await json("admin", sourcePurchase())).id, purchase.id);
    assert.equal(await value(`select material_sourcing_request_id::text || ':' || sourcing_material_id::text from public.purchase_procurement_context where idempotency_key='${key}'`), `${report}:${material}`);
    await assert.rejects(as("admin", sourcePurchase(key,warehouse,randomUUID())), /different shortage sourcing/);
    const costlyReport = result(await as("engineer", `select public.submit_material_sourcing_request('${randomUUID()}','${project}','${site}','${warehouse}','Cement','bag',1,current_date+7,'Expensive urgent shortage')`));
    const costlyKey = randomUUID();
    const costlyLines = `[{"materialId":"${material}","quantity":"1","unitPrice":"50001"}]`;
    const costlyCommand = `select public.submit_sourcing_purchase('${costlyKey}','${supplier}','${warehouse}',current_date,null,null,'${costlyLines}',null,'${costlyReport}','${material}')`;
    const costly = await json("admin", costlyCommand);
    assert.equal(costly.kind, "pending");
    assert.equal(await value(`select material_sourcing_request_id from public.purchase_procurement_context where idempotency_key='${costlyKey}'`), costlyReport);
    assert.equal((await json("admin", costlyCommand)).id, costly.id);
    await as("admin", `select public.decide_purchase_owner_approval('${costly.id}',false,'Price not acceptable')`);
    const poLine = await value(`select id from public.purchase_order_lines where purchase_order_id='${purchase.id}'`);
    await as("warehouse_staff", `select public.inspect_purchase_delivery('${randomUUID()}','${poLine}',5,5,'SHORTAGE-DELIVERY-1',current_date,null)`);
    await as("warehouse_staff", `select public.receive_purchase_order_line('${randomUUID()}','${poLine}',5,null,'SHORTAGE-DELIVERY-1',current_date,null)`);
    const siteKey = randomUUID();
    const createRequest = (k = siteKey, amount = 4) => `select public.create_sourcing_material_request('${k}','${report}','${material}',${amount},'First site delivery')`;
    await assert.rejects(as("finance", createRequest()), /Only Admin/);
    const siteRequest = result(await as("admin", createRequest()));
    assert.equal(result(await as("admin", createRequest())), siteRequest);
    await assert.rejects(as("admin", createRequest(siteKey,3)), /different site request details/);
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${report}'`), "submitted");
    await assert.rejects(as("admin", `select public.resolve_material_sourcing_request('${report}','dismissed',null,'No longer needed')`), /cannot be dismissed/);
    const requestLine = await value(`select id from public.material_request_lines where request_id='${siteRequest}'`);
    await as("engineer", `select public.decide_material_request('${randomUUID()}','${siteRequest}','{"${requestLine}":"4"}',null)`);
    const transfer = result(await as("warehouse_staff", `select public.dispatch_approved_request_line_with_manifest('${randomUUID()}','${requestLine}',4,current_date,'Shortage delivery',null,'External truck','Site Driver','SHORTAGE-TRIP-1')`));
    const transferItem = await value(`select id from public.inventory_transfer_items where transfer_id='${transfer}'`);
    await as("foreman", `select public.receive_request_transfer_with_inspection('${randomUUID()}','${transferItem}',4,current_date,'Accepted at site','accepted',null)`);
    assert.equal(await value(`select received_quantity from public.inventory_transfer_items where id='${transferItem}'`), "4.0000");
    await as("warehouse_staff", `select public.inspect_purchase_delivery('${randomUUID()}','${poLine}',2,2,'SHORTAGE-DELIVERY-2',current_date,null)`);
    await as("warehouse_staff", `select public.receive_purchase_order_line('${randomUUID()}','${poLine}',2,null,'SHORTAGE-DELIVERY-2',current_date,null)`);
    await as("admin", `select public.create_sourcing_material_request('${randomUUID()}','${report}','${material}',3,'Final site request')`);
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${report}'`), "resolved");
    assert.equal(await value(`select sum(quantity)::text from public.material_sourcing_request_links where material_sourcing_request_id='${report}'`), "7.0000");
    await assert.rejects(as("admin", createRequest(randomUUID(),1)), /unavailable/);
    const replacementReport = result(await as("foreman", `select public.submit_material_sourcing_request('${randomUUID()}','${project}','${site}','${warehouse}','Cement','bag',1,current_date+7,'Replacement needed at site')`));
    const rejectedRequest = result(await as("admin", `select public.create_sourcing_material_request('${randomUUID()}','${replacementReport}','${material}',1,'First proposal')`));
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${replacementReport}'`), "resolved");
    const rejectedLine = await value(`select id from public.material_request_lines where request_id='${rejectedRequest}'`);
    await as("engineer", `select public.decide_material_request('${randomUUID()}','${rejectedRequest}','{"${rejectedLine}":"0"}','Wrong site requirement')`);
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${replacementReport}'`), "submitted");
    const replacement = result(await as("admin", `select public.create_sourcing_material_request('${randomUUID()}','${replacementReport}','${material}',1,'Corrected proposal')`));
    assert.notEqual(replacement, rejectedRequest);
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${replacementReport}'`), "resolved");
    const partialReport = result(await as("foreman", `select public.submit_material_sourcing_request('${randomUUID()}','${project}','${site}','${warehouse}','Cement','bag',3,current_date+7,'Partial approval needed')`));
    const partialRequest = result(await as("admin", `select public.create_sourcing_material_request('${randomUUID()}','${partialReport}','${material}',3,'Initial requested amount')`));
    const partialLine = await value(`select id from public.material_request_lines where request_id='${partialRequest}'`);
    await as("engineer", `select public.decide_material_request('${randomUUID()}','${partialRequest}','{"${partialLine}":"2"}','Only two needed now')`);
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${partialReport}'`), "submitted");
    await as("admin", `select public.create_sourcing_material_request('${randomUUID()}','${partialReport}','${material}',1,'Remaining site need')`);
    assert.equal(await value(`select status from public.material_sourcing_requests where id='${partialReport}'`), "resolved");
  });
  await check("all-location consumable totals preserve role scope, zero-stock materials and single-location balances", async () => {
    const unassignedWarehouse = randomUUID();
    await sql(`insert into public.warehouses(id,code,name,address,created_by,updated_by)
      values('${unassignedWarehouse}','WH-HIDDEN','Other Test Warehouse','Different warehouse','${users.admin}','${users.admin}')`);
    const other = await value(`select id from public.inventory_locations where warehouse_id='${unassignedWarehouse}'`);
    await sql(`select private.post_valued_stock_in_core('${users.admin}','${material}','${other}',999,'${unit}',9990,'OTHER-WAREHOUSE-STOCK',current_date,null)`);
    for (const role of ["admin", "finance", "engineer", "foreman", "warehouse_staff"]) {
      const totals = await json(role, `select row_to_json(t) from (
        select coalesce(sum(quantity_on_hand),0) as on_hand,coalesce(sum(reserved_quantity),0) as reserved,
          coalesce(sum(available_quantity),0) as available from public.inventory_balances where material_id='${material}') t`);
      const row = await json(role, `select row_to_json(m) from public.list_inventory_materials('',null,null,'active',false,0,500) m where material_id='${material}'`);
      assert.equal(Number(row.quantity_on_hand), Number(totals.on_hand), role);
      assert.equal(Number(row.reserved_quantity), Number(totals.reserved), role);
      assert.equal(Number(row.available_quantity), Number(totals.available), role);
      assert.equal(row.balance_id, null);
    }
    assert.equal(scalar(await as("foreman", `select count(*) from public.inventory_balances where inventory_location_id='${other}'`)), "0");
    const siteStock = Number(await value(`select quantity_on_hand from public.inventory_balances where material_id='${material}' and inventory_location_id='${location}'`));
    assert.equal(Number(scalar(await as("foreman", `select quantity_on_hand from public.list_inventory_materials('',null,null,'active',false,0,500) where material_id='${material}'`))), siteStock);
    assert.equal(scalar(await as("admin", `select quantity_on_hand from public.list_inventory_materials('Unstocked Test Material',null,null,'active',true,0,24)`)), "0");
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('',null,null,'active',false,0,500) where material_kind<>'consumable'`)), "0");
    await assert.rejects(as("foreman", `select * from public.list_inventory_materials('','${other}',null,'active',false,0,24)`), /Inventory location is not available/);
  });
  await check("warehouse and site summaries separate balances, reservations, low-stock filters and role access", async () => {
    const category = await value(`select category_id from public.materials where id='${material}'`);
    const siteOnly = result(await as("admin", `select public.save_material(null,'MAT-SITE-ONLY','Site-only stock','', '${category}','${unit}','consumable',2,true)`));
    await sql(`select private.post_valued_stock_in_core('${users.admin}','${siteOnly}','${source}',7,'${unit}',70,'SITE-ONLY-RECEIPT',current_date,null)`);
    const siteRequest = result(await as("foreman", `select public.submit_material_request('${randomUUID()}','${project}','${site}','${warehouse}',current_date,'Move all stock to site','[{"materialId":"${siteOnly}","quantity":"7"}]')`));
    const requestLine = await value(`select id from public.material_request_lines where request_id='${siteRequest}'`);
    await as("engineer", `select public.decide_material_request('${randomUUID()}','${siteRequest}','{"${requestLine}":"7"}',null)`);
    const transfer = result(await as("warehouse_staff", `select public.dispatch_approved_request_line_with_manifest('${randomUUID()}','${requestLine}',7,current_date,'Scope test delivery',null,'External truck','Test Driver','SCOPE-TRIP-1')`));
    const item = await value(`select id from public.inventory_transfer_items where transfer_id='${transfer}'`);
    await as("foreman", `select public.receive_request_transfer_with_inspection('${randomUUID()}','${item}',7,current_date,'Checked scope test stock','accepted',null)`);
    for (const role of ["admin", "finance", "engineer", "foreman", "warehouse_staff"]) {
      for (const kind of ["warehouse", "project_site"]) {
        const totals = await json(role, `select row_to_json(t) from (
          select coalesce(sum(b.quantity_on_hand),0) as on_hand,coalesce(sum(b.reserved_quantity),0) as reserved,
            coalesce(sum(b.available_quantity),0) as available
          from public.inventory_balances b join public.inventory_locations l on l.id=b.inventory_location_id
          where b.material_id='${material}' and l.location_type::text='${kind}') t`);
        const row = await json(role, `select row_to_json(m) from public.list_inventory_materials('',null,null,'active',false,0,500,'${kind}') m where material_id='${material}'`);
        assert.equal(Number(row.quantity_on_hand), Number(totals.on_hand), `${role}: ${kind} on hand`);
        assert.equal(Number(row.reserved_quantity), Number(totals.reserved), `${role}: ${kind} reserved`);
        assert.equal(Number(row.available_quantity), Number(totals.available), `${role}: ${kind} available`);
        assert.equal(row.balance_id, null);
      }
    }
    assert.equal(Number(scalar(await as("admin", `select quantity_on_hand from public.list_inventory_materials('Site-only stock',null,null,'active',false,0,24,'warehouse')`))), 0);
    assert.equal(Number(scalar(await as("admin", `select quantity_on_hand from public.list_inventory_materials('Site-only stock',null,null,'active',false,0,24,'project_site')`))), 7);
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('Site-only stock',null,null,'active',true,0,24,'warehouse')`)), "1");
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('Site-only stock',null,null,'active',true,0,24,'project_site')`)), "0");
    assert.equal(scalar(await as("warehouse_staff", `select quantity_on_hand from public.list_inventory_materials('Site-only stock',null,null,'active',false,0,24,'project_site')`)), "0");
    await assert.rejects(as("admin", "select * from public.list_inventory_materials('',null,null,'active',false,0,24,'invalid')"), /Invalid inventory catalog filters/);
    await assert.rejects(as("admin", "select * from public.list_inventory_materials('',null,null,'active',false,0,24,null)"), /Invalid inventory catalog filters/);
    await assert.rejects(as("foreman", `select * from public.list_inventory_materials('','${source}',null,'active',false,0,24,'warehouse')`), /Inventory location is not available/);
    assert.equal(await value("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_inventory_materials'"), "1");
  });
  await check("inventory catalog pagination keeps materials beyond 500 reachable", async () => {
    const category = await value(`select category_id from public.materials where id='${material}'`);
    await sql(`insert into public.materials(code,name,category_id,base_unit_id,material_kind,minimum_stock_level,is_active,created_by,updated_by)
      select 'MAT-PAGE-' || lpad(g::text,4,'0'), 'Paged material ' || lpad(g::text,4,'0'),
        '${category}','${unit}','consumable',0,true,'${users.admin}','${users.admin}'
      from generate_series(1,505) g`);
    const count = Number(scalar(await as("admin", `select max(total_count) from public.list_inventory_materials('Paged material','${source}',null,'active',false,500,24)`)));
    assert.equal(count, 505);
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('Paged material','${source}',null,'active',false,500,24)`)), "5");
    assert.equal(scalar(await as("admin", `select count(*) from public.list_inventory_materials('Paged material',null,null,'active',false,500,24,'warehouse')`)), "5");
    const firstSiteRow = await json("engineer", `select row_to_json(m) from public.list_inventory_materials('','${location}',null,'active',false,0,1) m`);
    assert.ok(Number(firstSiteRow.quantity_on_hand) > 0, "stocked site materials appear before zero-stock catalog entries");
    assert.equal(scalar(await sql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='site_purchases'")), "1");
  });
  await check("all balances, valuations and batches reconcile after corrections", async () => {
    assert.equal(await value("select count(*) from public.inventory_balances where available_quantity<0 or quantity_on_hand<0"), "0");
    assert.equal(await value(`select count(*) from public.inventory_balances b join public.inventory_valuations v using(material_id,inventory_location_id)
      where b.quantity_on_hand<>v.quantity_on_hand`), "0");
    assert.equal(await value(`select count(*) from public.inventory_balances b where b.quantity_on_hand<>(
      select coalesce(sum(case when t.destination_location_id=b.inventory_location_id and t.transfer_phase is distinct from 'dispatch' then t.quantity else 0 end
        -case when t.source_location_id=b.inventory_location_id and t.transfer_phase is distinct from 'receipt' then t.quantity else 0 end),0)
      from public.inventory_transactions t where t.material_id=b.material_id)`), "0");
    await sql(`do $$ declare r record; begin for r in select material_id,inventory_location_id from public.inventory_valuations loop
      perform private.assert_location_cost_layers(r.material_id,r.inventory_location_id); end loop;
      for r in select id from public.inventory_transfer_items loop perform private.assert_transit_cost_layers(r.id); end loop; end $$;`);
    await assert.rejects(as("admin", `update public.inventory_corrections set reason='Rewrite history'`), /permission denied/);
  });
  console.log(`\n${checks} real PostgreSQL workflow checks passed across all five roles.`);
});
