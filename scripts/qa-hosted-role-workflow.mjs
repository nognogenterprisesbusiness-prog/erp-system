import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Opt-in staging acceptance checks: no service key, schema changes, resets or deletes.
const password = process.env.QA_ACCOUNT_PASSWORD;
const marker = "QA-20260927";
const requestId = "030942b6-e17b-4021-98b2-455a0e32bd64";
const reportId = "5b4063f3-2ebf-4b41-b6dd-12112e552dcb";
if (!password || !process.argv.includes("--confirmed-staging")) {
  throw new Error("Set QA_ACCOUNT_PASSWORD and explicitly pass --confirmed-staging. This script posts labeled staging records.");
}
const clients = {};
const results = [];
const record = async (name, run) => {
  try { const evidence = await run(); results.push({ name, status: "PASS", evidence }); }
  catch (error) { results.push({ name, status: "FAIL", error: error.message }); }
  console.log(JSON.stringify(results.at(-1)));
};
const call = async (role, name, args) => {
  const result = await clients[role].rpc(name, args);
  if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
};
const rows = async (role, table, query = (q) => q) => {
  const result = await query(clients[role].from(table).select("*"));
  if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
};
const selectedRows = async (role, table, columns, query = (q) => q) => {
  const result = await query(clients[role].from(table).select(columns));
  if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
};
const denied = async (role, name, args) => {
  const result = await clients[role].rpc(name, args);
  assert.equal(result.error?.code, "42501", JSON.stringify(result.error));
  return result.error.message;
};
const purchaseReceiptCheck = async (order, profit) => {
  const po = (await rows("admin", "purchase_orders", q => q.eq("id", order)))[0];
  assert.ok(po?.purpose.startsWith(marker), "Purchase target must be test-owned");
  const line = (await rows("admin", "purchase_order_lines", q => q.eq("purchase_order_id", order)))[0];
  assert.equal(Number(line.received_quantity), 0, "This posting test requires an unreceived QA order");
  const location = (await rows("admin", "inventory_locations", q => q.eq("warehouse_id", po.warehouse_id)))[0];
  const balance = async () => (await rows("admin", "inventory_balances", q => q.eq("material_id", line.material_id).eq("inventory_location_id", location.id)))[0];
  const before = await balance();
  const beforeCost = Number((await profit())[0].material_cost);
  const args = { p_idempotency_key: randomUUID(), p_line_id: line.id, p_quantity: 1, p_goods_total_cost: Number(line.unit_price),
    p_delivery_reference: `${marker}-${randomUUID().slice(0, 8)}`, p_received_on: "2026-09-27", p_cost_variance_reason: null };
  const id = await call("admin", "receive_purchase_order_line", args);
  assert.equal(await call("admin", "receive_purchase_order_line", args), id);
  assert.equal((await rows("admin", "purchase_orders", q => q.eq("id", order)))[0].status, "partially_received");
  const excess = await clients.admin.rpc("receive_purchase_order_line", { ...args, p_idempotency_key: randomUUID(), p_quantity: 2, p_goods_total_cost: 2 * Number(line.unit_price) });
  assert.ok(excess.error, "Over receipt unexpectedly succeeded");
  await call("admin", "receive_purchase_order_line", { ...args, p_idempotency_key: randomUUID(), p_delivery_reference: `${marker}-${randomUUID().slice(0, 8)}` });
  assert.equal(Number((await balance()).quantity_on_hand), Number(before?.quantity_on_hand ?? 0) + 2);
  assert.equal((await rows("admin", "purchase_orders", q => q.eq("id", order)))[0].status, "received");
  const receipts = await rows("admin", "purchase_order_receipts", q => q.eq("purchase_order_id", order));
  assert.equal(receipts.reduce((sum, r) => sum + Number(r.goods_total_cost), 0), 2 * Number(line.unit_price));
  assert.equal(Number((await profit())[0].material_cost), beforeCost);
  return { order, quantityAdded: 2, goodsValue: 2 * Number(line.unit_price), expenseNotPostedBeforeConsumption: true, excess: excess.error.message };
};
try {
  for (const role of ["admin", "engineer", "foreman", "warehouse"]) {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await c.auth.signInWithPassword({ email: `${role}@nognog.local`, password });
    if (login.error) throw new Error(`${role} sign-in failed: ${login.error.message}`);
    clients[role] = c;
  }
  const request = (await rows("admin", "material_requests", q => q.eq("id", requestId)))[0];
  assert.ok(request?.purpose.startsWith(marker), "Staging target must contain the exact QA marker before any write.");
  const project = request.project_id;
  const site = request.project_site_id;
  const assignments = await rows("admin", "employee_project_assignments", q => q.eq("project_id", project).eq("status", "active"));
  const employee = (await rows("admin", "employees", q => q.eq("code", "EMP-003")))[0];
  const assignment = assignments.find(a => a.employee_id === employee.id);
  const profit = () => call("admin", "get_project_profitability", { p_project_id: project });
  const baseline = (await profit())[0];
  if (process.argv.includes("--repair-only")) {
    const itemId = "8dc69d57-fdaa-43a2-8b1f-fcd27d8d1c47";
    const item = (await selectedRows("admin", "inventory_transfer_items", "id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity", q => q.eq("id", itemId)))[0];
    const dispatch = (await rows("admin", "material_request_dispatches", q => q.eq("transfer_item_id", itemId)))[0];
    const line = dispatch && (await rows("admin", "material_request_lines", q => q.eq("id", dispatch.request_line_id)))[0];
    const transfer = item && (await rows("admin", "inventory_transfers", q => q.eq("id", item.transfer_id)))[0];
    assert.ok(item && transfer && line?.request_id === requestId && transfer.transfer_number === "TRF-00000001",
      "The recorded QA request/transfer does not match the guarded staging fixture.");
    assert.equal(transfer.destination_location_id, (await rows("admin", "inventory_locations", q => q.eq("project_site_id", site)))[0]?.id,
      "The staged transfer destination differs from the request site.");

    await record("Approved request visible only to assigned Warehouse role", async () => {
      assert.equal((await rows("warehouse", "material_requests", q => q.eq("id", requestId))).length, 1);
      const context = await call("warehouse", "get_material_request_context", { p_request_ids: [requestId] });
      assert.equal(context.length, 1);
      assert.equal(context[0].project_id, project);
      assert.equal(context[0].site_id, site);
      assert.equal((await rows("warehouse", "projects", q => q.eq("id", project))).length, 0,
        "Warehouse gained direct project access");
      assert.equal((await call("foreman", "get_material_request_context", { p_request_ids: [randomUUID()] })).length, 0);
      await assert.rejects(clients.warehouse.rpc("get_material_request_context", { p_request_ids: Array(21).fill(requestId) }).then(r => {
        if (r.error) throw new Error(r.error.code);
        throw new Error("Oversized context query unexpectedly succeeded");
      }));
      return { request: requestId, projectFinancialRows: 0, unauthorizedContext: "hidden", maxPage: 20 };
    });
    await record("Admin valuation access and non-Admin financial denial", async () => {
      const value = (await rows("admin", "inventory_valuations", q => q.eq("material_id", item.material_id).eq("inventory_location_id", transfer.source_location_id)))[0];
      assert.ok(value, "Admin could not read the source warehouse valuation");
      await denied("foreman", "get_project_profitability", { p_project_id: project });
      return { siteQuantity: value.quantity_on_hand, siteValue: value.total_value, ForemanProfitability: "denied" };
    });

    const approvedVarianceRows = await selectedRows("admin", "inventory_transfer_variances", "quantity,approved_at", q => q.eq("transfer_item_id", itemId));
    const varianceQuantity = approvedVarianceRows.filter(row => row.approved_at).reduce((sum, row) => sum + Number(row.quantity), 0);
    let remaining = Number(item.dispatched_quantity) - Number(item.received_quantity) - varianceQuantity;
    let receiptId = null;
    if (remaining > 0) {
      const args = { p_idempotency_key: randomUUID(), p_transfer_item_id: itemId, p_quantity: remaining,
        p_transaction_date: "2026-09-27", p_remarks: `${marker} repair QA receipt` };
      receiptId = await call("foreman", "receive_request_transfer", args);
      assert.equal(await call("foreman", "receive_request_transfer", args), receiptId, "Receipt retry posted twice");
    }
    const afterReceipt = (await selectedRows("admin", "inventory_transfer_items", "id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity", q => q.eq("id", itemId)))[0];
    assert.equal(Number(afterReceipt.received_quantity) + varianceQuantity, Number(afterReceipt.dispatched_quantity));
    assert.equal((await rows("admin", "inventory_transfers", q => q.eq("id", transfer.id)))[0].status, "received");
    const siteLocation = transfer.destination_location_id;
    const materialId = item.material_id;
    const unitId = item.unit_of_measure_id;
    const reference = `${marker} repair site consumption`;
    let consumption = (await selectedRows("admin", "inventory_transactions", "id,quantity,transaction_type,reference_document,project_id", q => q.eq("reference_document", reference).eq("project_id", project)))[0];
    if (!consumption) {
      const consumeArgs = { p_idempotency_key: randomUUID(), p_material_id: materialId, p_site_location_id: siteLocation,
        p_project_id: project, p_quantity: 6, p_unit_id: unitId, p_reference_document: reference,
        p_transaction_date: "2026-09-27", p_remarks: `${marker} six bags used for material-cost QA` };
      const id = await call("foreman", "consume_site_material", consumeArgs);
      assert.equal(await call("foreman", "consume_site_material", consumeArgs), id, "Consumption retry posted twice");
      consumption = (await selectedRows("admin", "inventory_transactions", "id,quantity,transaction_type,reference_document,project_id", q => q.eq("id", id)))[0];
    }
    assert.equal(Number(consumption.quantity), 6, "Existing QA consumption has an unexpected quantity");
    assert.equal(consumption.transaction_type, "MATERIAL_CONSUMPTION");
    const scopedPurpose = `${marker} repair QA receipt-role request`;
    let scopedRequest = (await rows("admin", "material_requests", q => q.eq("purpose", scopedPurpose)))[0];
    if (!scopedRequest) {
      const id = await call("foreman", "submit_material_request", { p_idempotency_key: randomUUID(), p_project_id: project,
        p_project_site_id: site, p_source_warehouse_id: request.source_warehouse_id, p_required_date: "2026-09-27",
        p_purpose: scopedPurpose, p_lines: [{ materialId, quantity: "2" }] });
      scopedRequest = (await rows("admin", "material_requests", q => q.eq("id", id)))[0];
    }
    assert.ok(scopedRequest?.purpose === scopedPurpose, "Could not find the dedicated QA receipt authorization request");
    const scopedLine = (await rows("admin", "material_request_lines", q => q.eq("request_id", scopedRequest.id)))[0];
    assert.equal(Number(scopedLine.requested_quantity), 2);
    if (["submitted", "partially_approved"].includes(scopedRequest.status)) {
      await call("engineer", "decide_material_request", { p_idempotency_key: randomUUID(), p_request_id: scopedRequest.id,
        p_decisions: { [scopedLine.id]: "2" }, p_reason: `${marker} authorized role check` });
      scopedRequest = (await rows("admin", "material_requests", q => q.eq("id", scopedRequest.id)))[0];
    }
    const scopedDispatch = (await rows("admin", "material_request_dispatches", q => q.eq("request_line_id", scopedLine.id)))[0];
    let scopedItem = scopedDispatch && (await selectedRows("admin", "inventory_transfer_items", "id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity", q => q.eq("id", scopedDispatch.transfer_item_id)))[0];
    if (!scopedItem) {
      const id = await call("warehouse", "dispatch_approved_request_line", { p_idempotency_key: randomUUID(),
        p_request_line_id: scopedLine.id, p_quantity: 2, p_transaction_date: "2026-09-27",
        p_remarks: `${marker} role-scoped site delivery` });
      scopedItem = (await selectedRows("admin", "inventory_transfer_items", "id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity", q => q.eq("transfer_id", id)))[0];
    }
    assert.equal(Number(scopedItem.dispatched_quantity), 2);
    if (Number(scopedItem.received_quantity) < 2) {
      await record("Warehouse cannot receive a transfer bound to a project site", async () => {
        const deniedReceipt = await clients.warehouse.rpc("receive_request_transfer", { p_idempotency_key: randomUUID(),
          p_transfer_item_id: scopedItem.id, p_quantity: 1, p_transaction_date: "2026-09-27", p_remarks: `${marker} denied role check` });
        assert.equal(deniedReceipt.error?.code, "42501", JSON.stringify(deniedReceipt.error));
        return { code: deniedReceipt.error.code, noStockPosting: true };
      });
      const remainingScoped = 2 - Number(scopedItem.received_quantity);
      const scopedReceipt = { p_idempotency_key: randomUUID(), p_transfer_item_id: scopedItem.id,
        p_quantity: remainingScoped, p_transaction_date: "2026-09-27", p_remarks: `${marker} foreman site receipt` };
      const scopedReceiptId = await call("foreman", "receive_request_transfer", scopedReceipt);
      assert.equal(await call("foreman", "receive_request_transfer", scopedReceipt), scopedReceiptId);
      const scopedConsume = { p_idempotency_key: randomUUID(), p_material_id: materialId, p_site_location_id: siteLocation,
        p_project_id: project, p_quantity: 2, p_unit_id: unitId, p_reference_document: `${marker} repair QA scoped consumption`,
        p_transaction_date: "2026-09-27", p_remarks: `${marker} two bags used after role check` };
      const consumed = await call("foreman", "consume_site_material", scopedConsume);
      assert.equal(await call("foreman", "consume_site_material", scopedConsume), consumed);
    }
    const siteBalance = (await rows("admin", "inventory_balances", q => q.eq("material_id", materialId).eq("inventory_location_id", siteLocation)))[0];
    const siteValue = (await rows("admin", "inventory_valuations", q => q.eq("material_id", materialId).eq("inventory_location_id", siteLocation)))[0];
    assert.ok(siteBalance && siteValue);
    assert.equal(Number(siteBalance.quantity_on_hand), Number(siteValue.quantity_on_hand));
    const materialCosts = await call("admin", "get_project_material_cost", { p_project_id: project });
    const materialCost = materialCosts.filter(row => row.material_id === materialId);
    assert.ok(materialCost.some(row => Number(row.quantity) >= 6 && Number(row.cost_total) > 0),
      "Posted consumption did not appear in the project's material cost");
    await record("Foreman receipt, costing, remaining site stock and valuation reconciliation", async () => ({
      request: requestId, receipt: receiptId ?? "already received", dispatched: item.dispatched_quantity,
      received: afterReceipt.received_quantity, consumed: consumption.quantity,
      remainingSiteQuantity: siteBalance.quantity_on_hand, siteInventoryValue: siteValue.total_value,
      projectMaterialCost: materialCost,
    }));
    await record("Material consumption links to the matching daily report without double costing", async () => {
      const report = (await selectedRows("admin", "daily_reports", "id,project_id,project_site_id,report_date", q => q.eq("id", reportId)))[0];
      assert.ok(report, "QA daily report not found");
      assert.equal(report.project_id, project);
      assert.equal(report.project_site_id, site);
      assert.equal(report.report_date, "2026-09-27", "QA consumption date does not match the report date");
      const beforeLinks = await rows("admin", "daily_report_resource_links", q => q.eq("report_id", reportId));
      const beforeCost = (await profit())[0].total_posted_cost;
      await call("foreman", "attach_daily_report_resource", { p_report_id: reportId, p_kind: "material", p_resource_id: consumption.id });
      await call("foreman", "attach_daily_report_resource", { p_report_id: reportId, p_kind: "material", p_resource_id: consumption.id });
      const afterLinks = await rows("admin", "daily_report_resource_links", q => q.eq("report_id", reportId));
      assert.equal(afterLinks.length, beforeLinks.length + (beforeLinks.some(row => row.transaction_id === consumption.id) ? 0 : 1));
      assert.ok(afterLinks.some(row => row.transaction_id === consumption.id));
      assert.equal((await profit())[0].total_posted_cost, beforeCost, "Daily-report link duplicated project cost");
      return { report: reportId, consumption: consumption.id, linkedOnce: true, projectCostUnchanged: true };
    });

    await record("Generic transfer receipt enum handling and value preservation", async () => {
      const sourceLocation = (await rows("admin", "inventory_locations", q => q.eq("id", transfer.source_location_id)))[0];
      const warehouseLocation = sourceLocation?.warehouse_id ? sourceLocation : null;
      assert.ok(warehouseLocation, "Recorded source warehouse location not found");
      const sourceBefore = (await rows("admin", "inventory_balances", q => q.eq("material_id", materialId).eq("inventory_location_id", siteLocation)))[0];
      assert.ok(Number(sourceBefore.quantity_on_hand) >= 2, "Insufficient remaining site stock for the labeled 2-bag return check");
      const warehouseBefore = (await rows("admin", "inventory_balances", q => q.eq("material_id", materialId).eq("inventory_location_id", warehouseLocation.id)))[0];
      const balancesBefore = Number(sourceBefore.quantity_on_hand) + Number(warehouseBefore?.quantity_on_hand ?? 0);
      const valuesBefore = await rows("admin", "inventory_valuations", q => q.eq("material_id", materialId).in("inventory_location_id", [siteLocation, warehouseLocation.id]));
      const valueTotalBefore = valuesBefore.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0);
      let returnTransfer = (await rows("admin", "inventory_transfers", q => q.eq("external_reference", `${marker} return check`)))[0];
      if (!returnTransfer) {
        const newTransfer = await call("admin", "dispatch_inventory_transfer", { p_idempotency_key: randomUUID(),
          p_material_id: materialId, p_source_location_id: siteLocation, p_destination_location_id: warehouseLocation.id,
          p_quantity: 2, p_unit_id: unitId, p_external_reference: `${marker} return check`,
          p_transaction_date: "2026-09-27", p_remarks: `${marker} enum repair QA` });
        returnTransfer = (await rows("admin", "inventory_transfers", q => q.eq("id", newTransfer)))[0];
      }
      assert.ok(returnTransfer, "Could not create or resolve the QA return transfer");
      const returnItem = (await selectedRows("admin", "inventory_transfer_items", "id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity", q => q.eq("transfer_id", returnTransfer.id)))[0];
      assert.ok(returnItem && Number(returnItem.dispatched_quantity) === 2, "QA return transfer does not match its 2-bag test quantity");
      let received = "already received";
      if (Number(returnItem.received_quantity) < Number(returnItem.dispatched_quantity)) {
        const returnVariances = await selectedRows("admin", "inventory_transfer_variances", "quantity,approved_at", q => q.eq("transfer_item_id", returnItem.id));
        const returnVarianceQuantity = returnVariances.filter(row => row.approved_at).reduce((sum, row) => sum + Number(row.quantity), 0);
        const quantity = Number(returnItem.dispatched_quantity) - Number(returnItem.received_quantity) - returnVarianceQuantity;
        const receiveArgs = { p_idempotency_key: randomUUID(), p_transfer_item_id: returnItem.id,
          p_quantity: quantity, p_transaction_date: "2026-09-27", p_remarks: `${marker} return receipt` };
        received = await call("warehouse", "receive_inventory_transfer", receiveArgs);
        assert.equal(await call("warehouse", "receive_inventory_transfer", receiveArgs), received);
      }
      assert.equal((await rows("admin", "inventory_transfers", q => q.eq("id", returnTransfer.id)))[0].status, "received");
      const balances = await rows("admin", "inventory_balances", q => q.eq("material_id", materialId).in("inventory_location_id", [siteLocation, warehouseLocation.id]));
      const values = await rows("admin", "inventory_valuations", q => q.eq("material_id", materialId).in("inventory_location_id", [siteLocation, warehouseLocation.id]));
      const balanceTotal = balances.reduce((sum, row) => sum + Number(row.quantity_on_hand), 0);
      const valueTotal = values.reduce((sum, row) => sum + Number(row.total_value ?? 0), 0);
      assert.equal(balanceTotal, balancesBefore, "Site-to-warehouse return changed total quantity");
      assert.equal(valueTotal.toFixed(2), valueTotalBefore.toFixed(2), "Site-to-warehouse return changed total stock value");
      return { transfer: returnTransfer.id, received, status: "received", warehouseSiteQuantity: balanceTotal, combinedValue: valueTotal };
    });
  } else if (process.argv.includes("--negative-only")) {
    const absent = { p_idempotency_key: randomUUID(), p_assignment_id: assignment.id, p_work_date: "2026-09-23",
      p_status: "absent", p_hours: 0, p_rate_type: null, p_day_fraction: null, p_note: `${marker} denied input QA` };
    for (const role of ["engineer", "warehouse"]) await record(`${role} attendance mutation denied`, () => denied(role, "post_project_attendance", absent));
    await record("attendance before assignment start denied", async () => {
      const r = await clients.foreman.rpc("post_project_attendance", { ...absent, p_work_date: "1900-01-01" });
      assert.equal(r.error?.code, "22023");
      return r.error.message;
    });
    await record("missing employee assignment denied", async () => {
      const r = await clients.foreman.rpc("post_project_attendance", { ...absent, p_assignment_id: randomUUID() });
      assert.equal(r.error?.code, "22023");
      return r.error.message;
    });
    await record("Foreman costing basis changes denied", () => denied("foreman", "set_employee_attendance_basis", { p_employee_id: employee.id, p_rate_type: "hourly" }));
    await record("report resource paging stable, counted and wage-free", async () => {
      const args = { p_report_id: reportId, p_linked: true, p_offset: 0, p_limit: 1 };
      const first = await call("foreman", "list_daily_report_resources", args);
      const second = await call("foreman", "list_daily_report_resources", { ...args, p_offset: 1 });
      const all = await call("foreman", "list_daily_report_resources", { ...args, p_limit: 100 });
      assert.equal(first.length, 1); assert.equal(second.length, 1);
      assert.notEqual(first[0].resource_id, second[0].resource_id);
      assert.equal(Number(first[0].total_count), all.length);
      assert.deepEqual([first[0].resource_id, second[0].resource_id], all.slice(0, 2).map(r => r.resource_id));
      assert.ok(all.every(r => r.cost == null));
      return { total: all.length, pageSize: 1, stableOrder: true, costsHidden: true };
    });
    await record("invalid report pagination denied", async () => {
      const r = await clients.foreman.rpc("list_daily_report_resources", { p_report_id: reportId, p_linked: true, p_offset: -1, p_limit: 100 });
      assert.ok(r.error);
      return r.error.message;
    });
    await record("attendance reference picker pagination and cross-project denial", async () => {
      const args = { p_project_id: project, p_search: "", p_offset: 0, p_limit: 1 };
      const page = await call("foreman", "search_attendance_assignment_choices", args);
      const next = await call("foreman", "search_attendance_assignment_choices", { ...args, p_offset: 1 });
      assert.equal(page.length, 1); assert.equal(next.length, 1);
      assert.notEqual(page[0].id, next[0].id);
      assert.ok(Number(page[0].total_count) >= 2);
      await denied("foreman", "search_attendance_assignment_choices", { ...args, p_project_id: "20000000-0000-0000-0000-000000000003" });
      return { total: page[0].total_count, pageSize: 1, crossProject: "denied" };
    });
    await record("Warehouse approved request visibility recheck", async () => {
      assert.equal((await rows("warehouse", "material_requests", q => q.eq("id", requestId))).length, 1);
      return "Visible";
    });
  } else if (process.argv.includes("--receipt-existing")) {
    const order = "99cdcb2c-2781-41eb-8fe8-e589f3f3f9fa";
    const po = (await rows("admin", "purchase_orders", q => q.eq("id", order)))[0];
    assert.ok(po?.purpose.startsWith(marker), "Purchase target must be test-owned");
    const line = (await rows("admin", "purchase_order_lines", q => q.eq("purchase_order_id", order)))[0];
    const location = (await rows("admin", "inventory_locations", q => q.eq("warehouse_id", po.warehouse_id)))[0];
    await record("Admin partial purchase receipt and inventory quantity reconciliation", () => purchaseReceiptCheck(order, profit));
    await record("Admin inventory valuation SELECT access", async () => {
      const value = (await rows("admin", "inventory_valuations", q => q.eq("material_id", line.material_id).eq("inventory_location_id", location.id)))[0];
      assert.ok(value);
      return { quantity: value.quantity_on_hand, value: value.total_value };
    });
    await record("Admin attendance Realtime and Foreman financial privacy", async () => {
      const events = { admin: [], foreman: [] };
      const channels = [];
      let attendance;
      try {
        for (const role of ["admin", "foreman"]) {
          const channel = clients[role].channel(`qa-${randomUUID()}`).on("postgres_changes", {
            event: "INSERT", schema: "public", table: "project_attendance", filter: `project_id=eq.${project}`
          }, payload => events[role].push(payload.new));
          channels.push({ role, channel });
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${role} subscription timed out`)), 15000);
            channel.subscribe(status => {
              if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
              else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(new Error(status)); }
            });
          });
        }
        const basis = await call("admin", "get_attendance_rate_basis", { p_employee_id: employee.id, p_work_date: "2026-09-24" });
        attendance = await call("foreman", "post_project_attendance", { p_idempotency_key: randomUUID(), p_assignment_id: assignment.id,
          p_work_date: "2026-09-24", p_status: "present", p_hours: 8, p_rate_type: basis,
          p_day_fraction: basis === "daily" ? 1 : null, p_note: `${marker} realtime attendance test` });
        const deadline = Date.now() + 10000;
        while (!events.admin.some(e => e.id === attendance) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
        assert.ok(events.admin.some(e => e.id === attendance), "Admin received no attendance event");
        // Allow the same replication batch time to reach both clients.
        await new Promise(resolve => setTimeout(resolve, 1500));
        assert.equal(events.foreman.filter(e => e.id === attendance).length, 0);
        return { attendance, adminEvent: true, foremanCostLeak: false };
      } finally {
        for (const { role, channel } of channels) await clients[role].removeChannel(channel);
        if (attendance) {
          await call("admin", "reverse_project_attendance", { p_idempotency_key: randomUUID(), p_attendance_id: attendance, p_reason: `${marker} realtime test correction` });
          assert.equal((await profit())[0].total_posted_cost, baseline.total_posted_cost);
        }
      }
    });
  } else if (process.argv.includes("--extended-only")) {
    const material = (await rows("admin", "materials", q => q.eq("id", "60000000-0000-0000-0000-000000000001")))[0];
    const warehouseLocation = (await rows("admin", "inventory_locations", q => q.eq("warehouse_id", request.source_warehouse_id)))[0];
    let category = (await rows("admin", "supplier_categories", q => q.is("archived_at", null)))[0];
    if (!category) category = { id: await call("admin", "save_supplier_category", {
      p_id: null, p_name: `${marker} test materials`, p_description: "Staging QA only" }) };
    assert.ok(material && warehouseLocation && category, "Required staging reference records missing");
    let supplier, catalog, order, price;
    await record("isolated supplier and historical price versions", async () => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      supplier = await call("admin", "save_supplier", {
        p_id: null, p_code: `QA-${suffix}`, p_supplier_name: `${marker} test supplier ${suffix}`,
        p_business_name: `${marker} staging only`, p_category_id: category.id,
        p_contact_person: "QA Test Contact", p_contact_number: "09000000000", p_email_address: "qa@example.invalid",
        p_business_address: "Staging test address", p_city: "Cebu City", p_province: "Cebu",
        p_tax_identification_number: null, p_payment_terms: "Test only", p_status: "active", p_remarks: `${marker} no real purchase`
      });
      catalog = await call("admin", "save_supplier_material", { p_id: null, p_supplier_id: supplier,
        p_material_id: material.id, p_supplier_material_code: "QA-CEMENT", p_unit_id: material.base_unit_id,
        p_minimum_order_quantity: 1, p_lead_time_days: 1, p_availability_status: "available" });
      price = await call("admin", "post_supplier_price", { p_supplier_material_id: catalog, p_unit_price: 100,
        p_effective_start_date: "2026-09-26", p_effective_end_date: "2026-09-26", p_currency: "PHP" });
      await call("admin", "post_supplier_price", { p_supplier_material_id: catalog, p_unit_price: 120,
        p_effective_start_date: "2026-09-27", p_effective_end_date: null, p_currency: "PHP" });
      const prices = await rows("admin", "supplier_prices", q => q.eq("supplier_material_id", catalog).order("effective_start_date"));
      assert.deepEqual(prices.map(p => Number(p.unit_price)), [100, 120]);
      return { supplier, catalog, prices: [100, 120] };
    });
    if (catalog) {
      const orderArgs = { p_idempotency_key: randomUUID(), p_supplier_id: supplier, p_warehouse_id: warehouseLocation.warehouse_id,
        p_ordered_on: "2026-09-26", p_expected_on: "2026-09-27", p_purpose: `${marker} purchase receipt QA only`,
        p_lines: [{ supplierMaterialId: catalog, quantity: 2 }] };
      await record("purchase uses historical price and retries safely", async () => {
        order = await call("admin", "issue_purchase_order", orderArgs);
        assert.equal(await call("admin", "issue_purchase_order", orderArgs), order);
        const line = (await rows("admin", "purchase_order_lines", q => q.eq("purchase_order_id", order)))[0];
        assert.equal(Number(line.unit_price), 100);
        assert.equal(line.supplier_price_id, price);
        return { order, line: line.id, price: line.unit_price };
      });
      await record("Foreman purchase issue denied", () => denied("foreman", "issue_purchase_order", { ...orderArgs, p_idempotency_key: randomUUID() }));
    }
    if (order) {
      await record("partial purchase receipts, retries, inventory quantity/value", () => purchaseReceiptCheck(order, profit));
    }
    await record("equipment report link has no duplicated cost; unauthorized/mismatched links denied", async () => {
      const usage = (await rows("admin", "project_equipment_usage", q => q.eq("id", "434a344a-95c6-4489-8850-bbede1dc21e1")))[0];
      assert.ok(usage);
      const before = (await profit())[0].total_posted_cost;
      await call("foreman", "attach_daily_report_resource", { p_report_id: reportId, p_kind: "equipment", p_resource_id: usage.id });
      assert.equal((await profit())[0].total_posted_cost, before);
      const operational = await call("foreman", "list_daily_report_resources", { p_report_id: reportId, p_linked: true, p_offset: 0, p_limit: 20 });
      assert.ok(operational.some(r => r.resource_id === usage.id && Number(r.quantity) === 2));
      assert.ok(operational.every(r => r.cost == null), "Foreman must not receive financial snapshots");
      await denied("warehouse", "attach_daily_report_resource", { p_report_id: reportId, p_kind: "equipment", p_resource_id: usage.id });
      const mismatch = (await rows("admin", "project_attendance", q => q.eq("project_id", project).eq("work_date", "2026-09-26")))[0];
      const badLink = await clients.foreman.rpc("attach_daily_report_resource", { p_report_id: reportId, p_kind: "attendance", p_resource_id: mismatch.id });
      assert.ok(badLink.error);
      return { linked: operational.length, costUnchanged: before, mismatch: badLink.error.message };
    });
    await record("daily report submission and independent Engineer review", async () => {
      const report = (await rows("foreman", "daily_reports", q => q.eq("id", reportId)))[0];
      if (report.status === "draft") await call("foreman", "save_daily_report", {
        p_id: report.id, p_project_id: project, p_project_site_id: site, p_report_date: report.report_date,
        p_weather_conditions: report.weather_conditions, p_work_description: report.work_description,
        p_accomplishments: report.accomplishments, p_issues_encountered: report.issues_encountered,
        p_site_observations: report.site_observations, p_general_remarks: report.general_remarks, p_submit: true });
      await denied("foreman", "review_daily_report", { p_report_id: reportId, p_action: "approve", p_note: `${marker} self review denied` });
      await call("engineer", "review_daily_report", { p_report_id: reportId, p_action: "approve", p_note: `${marker} independent QA review` });
      assert.equal((await rows("admin", "daily_reports", q => q.eq("id", reportId)))[0].status, "approved");
      return { report: reportId, status: "approved" };
    });
    await record("Realtime delivers report invalidation across roles", async () => {
      let resolveEvent;
      const event = new Promise(resolve => { resolveEvent = resolve; });
      const channel = clients.engineer.channel(`qa-${randomUUID()}`).on("postgres_changes",
        { event: "INSERT", schema: "public", table: "daily_reports", filter: `project_id=eq.${project}` }, payload => resolveEvent(payload.new.id));
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Realtime subscribe timed out")), 15000);
          channel.subscribe(status => { if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); reject(new Error(status)); } });
        });
        const id = randomUUID();
        await call("foreman", "save_daily_report", { p_id: id, p_project_id: project, p_project_site_id: site, p_report_date: "2026-09-26",
          p_weather_conditions: null, p_work_description: `${marker} realtime draft`, p_accomplishments: "Realtime delivery test",
          p_issues_encountered: null, p_site_observations: null, p_general_remarks: `${marker} test-owned draft`, p_submit: false });
        let timer;
        try { assert.equal(await Promise.race([event, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("No realtime INSERT delivered within 15 seconds")), 15000); })]), id); }
        finally { clearTimeout(timer); }
        return { inserted: id, deliveredTo: "assigned engineer" };
      } finally { await clients.engineer.removeChannel(channel); }
    });
  } else {
  await record("four-role authentication and role identity", async () => {
    const observed = {};
    for (const role of Object.keys(clients)) {
      const { data } = await clients[role].auth.getUser();
      observed[role] = (await rows(role, "user_roles", q => q.eq("user_id", data.user.id))).map(r => r.role);
    }
    for (const role of Object.keys(observed)) assert.ok(observed[role].includes(role === "warehouse" ? "warehouse_staff" : role));
    return observed;
  });
  await record("warehouse can read approved source-warehouse request", async () => {
    assert.equal((await rows("warehouse", "material_requests", q => q.eq("id", requestId))).length, 1);
    return "Approved request visible";
  });
  await record("foreman cross-project RLS denial", async () => {
    assert.equal((await rows("foreman", "projects", q => q.eq("id", "20000000-0000-0000-0000-000000000003"))).length, 0);
    return "Unassigned project returned no rows";
  });
  for (const role of ["engineer", "foreman", "warehouse"]) {
    await record(`${role} profitability denied`, () => denied(role, "get_project_profitability", { p_project_id: project }));
    await record(`${role} wage mutation denied`, () => denied(role, "post_labor_rate", { p_employee_id: employee.id, p_rate_type: "daily", p_rate_amount: 999, p_effective_start_date: "2026-09-27", p_effective_end_date: null }));
    await record(`${role} labor snapshots hidden by RLS`, async () => {
      assert.equal((await rows(role, "project_attendance", q => q.eq("project_id", project))).length, 0);
      return "Financial attendance table exposes no rows";
    });
  }
  await record("full-day / half-day cost and report-link reconciliation", async () => {
    const entries = (await rows("admin", "project_attendance", q => q.eq("project_id", project).eq("work_date", "2026-09-27"))).filter(r => r.note?.startsWith(marker));
    assert.ok(entries.some(r => Number(r.cost_total) === 750 && Number(r.billable_units) === 1));
    assert.ok(entries.some(r => Number(r.cost_total) === 350 && Number(r.billable_units) === 0.5));
    assert.equal(Number(baseline.labor_cost), 1100);
    const links = await rows("admin", "daily_report_resource_links", q => q.eq("report_id", reportId));
    assert.ok(links.length >= 2);
    const before = (await profit())[0].total_posted_cost;
    for (const entry of entries) await call("foreman", "attach_daily_report_resource", { p_report_id: reportId, p_kind: "attendance", p_resource_id: entry.id });
    assert.equal((await rows("admin", "daily_report_resource_links", q => q.eq("report_id", reportId))).length, links.length);
    assert.equal((await profit())[0].total_posted_cost, before);
    return { labor: before, links: 2, duplicateLinks: "idempotent" };
  });
  const rateBasis = await call("admin", "get_attendance_rate_basis", { p_employee_id: employee.id, p_work_date: "2026-09-26" });
  const attendanceArgs = { p_idempotency_key: randomUUID(), p_assignment_id: assignment.id, p_work_date: "2026-09-26", p_status: "present", p_hours: 8, p_rate_type: rateBasis, p_day_fraction: rateBasis === "daily" ? 1 : null, p_note: `${marker} concurrency/retry attendance` };
  let attendanceId;
  await record("foreman concurrent attendance / duplicate / retry", async () => {
    const responses = await Promise.all([clients.foreman.rpc("post_project_attendance", attendanceArgs), clients.foreman.rpc("post_project_attendance", { ...attendanceArgs, p_idempotency_key: randomUUID() })]);
    assert.equal(responses.filter(r => !r.error).length, 1, JSON.stringify(responses.map(r => r.error)));
    attendanceId = responses.find(r => !r.error).data;
    const entry = (await rows("admin", "project_attendance", q => q.eq("id", attendanceId)))[0];
    const retryArgs = { ...attendanceArgs, p_idempotency_key: entry.idempotency_key };
    assert.equal(await call("foreman", "post_project_attendance", retryArgs), attendanceId);
    return { id: attendanceId, cost: entry.cost_total, successes: 1, failures: 1 };
  });
  await record("attendance 25-hour input denied", async () => {
    const r = await clients.foreman.rpc("post_project_attendance", { ...attendanceArgs, p_idempotency_key: randomUUID(), p_work_date: "2026-09-25", p_hours: 25 });
    assert.ok(r.error, "25-hour attendance unexpectedly posted");
    return { code: r.error.code, message: r.error.message };
  });
  if (attendanceId) {
    await record("foreman attendance reversal denied", () => denied("foreman", "reverse_project_attendance", { p_idempotency_key: randomUUID(), p_attendance_id: attendanceId, p_reason: `${marker} denial test` }));
    await record("admin attendance reversal restores cost", async () => {
      await call("admin", "reverse_project_attendance", { p_idempotency_key: randomUUID(), p_attendance_id: attendanceId, p_reason: `${marker} concurrency test correction` });
      assert.equal(Number((await profit())[0].labor_cost), 1100);
      return "Labor restored to 1100; posted history preserved";
    });
  }
  await record("equipment handover, Foreman hours, snapshot cost, return", async () => {
    const asset = (await rows("admin", "assets", q => q.eq("code", "EQ-EXC-001")))[0];
    assert.equal(asset.status, "available", "Do not move an asset already in custody");
    const existingRates = await rows("admin", "equipment_hour_rates", q => q.eq("asset_id", asset.id).order("effective_start_date", { ascending: false }));
    let rate = existingRates.find(r => r.effective_start_date <= "2026-09-27" && (!r.effective_end_date || r.effective_end_date >= "2026-09-27"));
    if (!rate) {
      await call("admin", "set_equipment_hour_rate", { p_asset_id: asset.id, p_hourly_rate: 200, p_effective_start_date: "2026-09-27" });
      rate = { hourly_rate: 200 };
    }
    const custody = await call("foreman", "submit_equipment_request", { p_asset_id: asset.id, p_project_id: project, p_project_site_id: site, p_needed_on: "2026-09-27", p_expected_return_on: "2026-09-28", p_purpose: `${marker} equipment custody and hours` });
    await call("admin", "decide_equipment_request", { p_id: custody, p_approve: true, p_note: `${marker} approval` });
    await call("admin", "checkout_equipment_request", { p_id: custody });
    try {
      const args = { p_idempotency_key: randomUUID(), p_project_id: project, p_asset_id: asset.id, p_use_date: "2026-09-27", p_hours: 2, p_work_note: `${marker} Foreman equipment hours` };
      const usage = await call("foreman", "post_project_equipment_usage", args);
      assert.equal(await call("foreman", "post_project_equipment_usage", args), usage);
      const entry = (await rows("admin", "project_equipment_usage", q => q.eq("id", usage)))[0];
      assert.equal(Number(entry.cost_total), 2 * Number(rate.hourly_rate));
      assert.equal(entry.project_site_id, site);
      await denied("foreman", "set_equipment_hour_rate", { p_asset_id: asset.id, p_hourly_rate: 999, p_effective_start_date: "2026-09-28" });
      return { request: custody, usage, hours: 2, cost: entry.cost_total, site: entry.project_site_id };
    } finally {
      await call("admin", "return_equipment_request", { p_id: custody, p_needs_maintenance: false, p_note: `${marker} QA returned in original condition` });
      const returned = (await rows("admin", "assets", q => q.eq("id", asset.id)))[0];
      assert.equal(returned.current_location_id, asset.current_location_id);
      assert.equal(returned.status, "available");
    }
  });
  await record("invoice / partial payment / retries / overpayment", async () => {
    const invoiceArgs = { p_idempotency_key: randomUUID(), p_project_id: project, p_description: `${marker} staging invoice test`, p_issued_on: "2026-09-27", p_due_on: "2026-10-27", p_amount: 1000 };
    const invoice = await call("admin", "issue_client_invoice", invoiceArgs);
    assert.equal(await call("admin", "issue_client_invoice", invoiceArgs), invoice);
    const payArgs = { p_idempotency_key: randomUUID(), p_invoice_id: invoice, p_amount: 400, p_paid_on: "2026-09-27", p_reference: `${marker}-${randomUUID().slice(0, 8)}` };
    const payment = await call("admin", "record_client_payment", payArgs);
    assert.equal(await call("admin", "record_client_payment", payArgs), payment);
    const over = await clients.admin.rpc("record_client_payment", { ...payArgs, p_idempotency_key: randomUUID(), p_amount: 601, p_reference: `${marker}-overpayment` });
    assert.ok(over.error);
    const p = (await profit())[0];
    assert.equal(Number(p.invoiced_amount), Number(baseline.invoiced_amount) + 1000);
    assert.equal(Number(p.cash_received), Number(baseline.cash_received) + 400);
    assert.equal(Number(p.receivables), Number(baseline.receivables) + 600);
    return { invoice, payment, invoiced: p.invoiced_amount, collected: p.cash_received, outstanding: p.receivables, overpayment: over.error.message };
  });
  }
} finally {
  for (const c of Object.values(clients)) { await c.removeAllChannels(); await c.auth.signOut(); }
  console.log(JSON.stringify({ summary: { passed: results.filter(r => r.status === "PASS").length, failed: results.filter(r => r.status === "FAIL").length } }));
  if (results.some(r => r.status === "FAIL")) process.exitCode = 1;
}
