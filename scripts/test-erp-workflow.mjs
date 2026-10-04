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
  const po = result(await as("admin", issue(randomUUID())));
  const poLine = await value(`select id from public.purchase_order_lines where purchase_order_id='${po}'`);
  const purchaseReceive = (key, quantity) => `select public.receive_purchase_order_line('${key}','${poLine}',${quantity},null,'TEST-DR',current_date,null)`;
  let purchaseTx;
  await check("simple purchasing: three-field supplier, typed prices become the latest supplier price, history stays immutable", async () => {
    assert.equal(await value(`select supplier_price_id is not null from public.purchase_order_lines where id='${poLine}'`), "t");
    const vic = result(await as("admin", "select public.save_supplier(null,'','VIC Hardware',null,null,null,'09171234567',null,'Borbon, Cebu',null,null,null,null,'active',null)"));
    assert.match(await value(`select code from public.suppliers where id='${vic}'`), /^SUP-\d{4}$/);
    await assert.rejects(as("finance", "select public.save_supplier(null,'','Other',null,null,null,'09171234567',null,'Cebu',null,null,null,null,'active',null)"), /not authorized/);
    await assert.rejects(as("admin", "select public.save_supplier(null,'','No Address',null,null,null,'09171234567',null,'',null,null,null,null,'active',null)"), /invalid supplier/);
    const order = (date, price, lines = `[{"materialId":"${material}","quantity":"1000","unitPrice":"${price}"}]`) =>
      `select public.issue_purchase_order('${randomUUID()}','${vic}','${warehouse}',${date},null,null,'${lines}')`;
    const first = result(await as("admin", order("current_date - 10", 100)));
    const prices = () => value(`select string_agg(unit_price::text || '@' || effective_start_date::text || '-' || coalesce(effective_end_date::text, 'open'), ',' order by effective_start_date)
      from public.supplier_prices p join public.supplier_materials m on m.id = p.supplier_material_id where m.supplier_id = '${vic}'`);
    assert.equal(await prices(), `100.00@${await value("select (current_date - 10)::text")}-open`);
    await as("admin", order("current_date", 120));
    assert.equal(await prices(), `100.00@${await value("select (current_date - 10)::text")}-${await value("select (current_date - 1)::text")},120.00@${await value("select current_date::text")}-open`);
    const history = await prices();
    const backdated = result(await as("admin", order("current_date - 5", 110)));
    const sameDay = result(await as("admin", order("current_date", 130)));
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
  await check("warehouse PO receipt retries post one cost snapshot and partial delivery", async () => {
    const key = randomUUID(); const posted = await Promise.all([as("warehouse_staff", purchaseReceive(key, 40)), as("warehouse_staff", purchaseReceive(key, 40))]);
    assert.equal(result(posted[0]), result(posted[1]));
    purchaseTx = await value(`select inventory_transaction_id from public.purchase_order_receipts where idempotency_key='${key}'`);
    assert.equal(await value(`select cost_total from public.inventory_transactions where id='${purchaseTx}'`), "10000.00");
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "40.0000");
    await assert.rejects(as("finance", purchaseReceive(randomUUID(), 1)), /assigned|administrator/i);
    await assert.rejects(as("warehouse_staff", `select public.receive_purchase_order_line('${randomUUID()}','${poLine}',1,200,'BAD-PRICE',current_date,'Discount')`), /administrator/);
  });
  await check("Admin PO receipt correction reverses exact batch, reopens order and supports replacement with the same delivery reference", async () => {
    const attempts = await Promise.allSettled([as("admin", reverse(randomUUID(), purchaseTx)), as("admin", reverse(randomUUID(), purchaseTx))]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await value(`select status from public.purchase_orders where id='${po}'`), "issued");
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "0.0000");
    await as("warehouse_staff", purchaseReceive(randomUUID(), 35));
    assert.equal(await value(`select received_quantity from public.purchase_order_lines where id='${poLine}'`), "35.0000");
    assert.equal(await value(`select count(*) from public.purchase_order_receipts where purchase_order_line_id='${poLine}'`), "2");
    await assert.rejects(as("warehouse_staff", purchaseReceive(randomUUID(), 5)), /delivery reference/);
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
      ) insert into public.vehicle_details(asset_id,plate_number,manufacture_year,current_mileage) select id,code,2026,0 from inserted;
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
