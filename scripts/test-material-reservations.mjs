import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("This integration test runs only against local Supabase. Set local SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
}

async function signIn(email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}

const [admin, foreman, manager, warehouse, worker] = await Promise.all([
  signIn("admin@nognog.local", "Admin123!"),
  signIn("foreman@nognog.local", "Foreman123!"),
  signIn("manager@nognog.local", "Manager123!"),
  signIn("warehouse@nognog.local", "Warehouse123!"),
  signIn("worker@nognog.local", "Worker123!"),
]);

const projectId = "20000000-0000-0000-0000-000000000001";
const siteId = "40000000-0000-0000-0000-000000000001";
const warehouseId = "30000000-0000-0000-0000-000000000001";
const materialId = "60000000-0000-0000-0000-000000000001";
const { data: location, error: locationError } = await admin.from("inventory_locations").select("id").eq("warehouse_id", warehouseId).single();
if (locationError) throw locationError;

async function balance() {
  const { data, error } = await admin.from("inventory_balances")
    .select("quantity_on_hand,reserved_quantity,available_quantity")
    .eq("inventory_location_id", location.id).eq("material_id", materialId).single();
  if (error) throw error;
  return data;
}

async function request(quantity) {
  const id = await rpc(foreman, "submit_material_request", {
    p_idempotency_key: crypto.randomUUID(), p_project_id: projectId, p_project_site_id: siteId,
    p_source_warehouse_id: warehouseId, p_required_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    p_purpose: "Reservation integration test", p_lines: [{ materialId, quantity: String(quantity) }],
  });
  const { data: line, error } = await foreman.from("material_request_lines").select("id").eq("request_id", id).single();
  if (error) throw error;
  return { id, lineId: line.id };
}

const before = await balance();
assert.ok(before.available_quantity >= 20, "Reset the local database before this integration test.");
const first = await request(20);
const decisionKey = crypto.randomUUID();
await rpc(manager, "decide_material_request", {
  p_idempotency_key: decisionKey, p_request_id: first.id,
  p_decisions: { [first.lineId]: "20" }, p_reason: null,
});
await rpc(manager, "decide_material_request", {
  p_idempotency_key: decisionKey, p_request_id: first.id,
  p_decisions: { [first.lineId]: "20" }, p_reason: null,
});
const reserved = await balance();
assert.equal(Number(reserved.quantity_on_hand), Number(before.quantity_on_hand));
assert.equal(Number(reserved.reserved_quantity), Number(before.reserved_quantity) + 20);
assert.equal(Number(reserved.available_quantity), Number(before.available_quantity) - 20);

const excess = await request(Number(reserved.available_quantity) + 1);
const shortage = await manager.rpc("decide_material_request", {
  p_idempotency_key: crypto.randomUUID(), p_request_id: excess.id,
  p_decisions: { [excess.lineId]: String(Number(reserved.available_quantity) + 1) }, p_reason: null,
});
assert.ok(shortage.error, "Approval must reject quantities above unallocated available stock.");
assert.deepEqual(await balance(), reserved, "Failed approval must leave stock unchanged.");

const { error: unauthorizedDecision } = await worker.rpc("decide_material_request", {
  p_idempotency_key: crypto.randomUUID(), p_request_id: excess.id,
  p_decisions: { [excess.lineId]: "1" }, p_reason: "Unauthorized test",
});
assert.ok(unauthorizedDecision, "Workers must not approve material requests.");

const today = new Date().toISOString().slice(0, 10);
const transferId = await rpc(warehouse, "dispatch_approved_request_line", {
  p_idempotency_key: crypto.randomUUID(), p_request_line_id: first.lineId,
  p_quantity: "8", p_transaction_date: today, p_remarks: "Reservation integration test dispatch",
});
assert.ok(transferId);
const afterDispatch = await balance();
assert.equal(Number(afterDispatch.quantity_on_hand), Number(before.quantity_on_hand) - 8);
assert.equal(Number(afterDispatch.reserved_quantity), Number(before.reserved_quantity) + 12);
assert.equal(Number(afterDispatch.available_quantity), Number(before.available_quantity) - 20);

const { error: lateCancel } = await foreman.rpc("cancel_material_request", {
  p_idempotency_key: crypto.randomUUID(), p_request_id: first.id, p_reason: "Cannot cancel after dispatch",
});
assert.ok(lateCancel, "Dispatched requests must not release their remaining reservation by cancellation.");

const second = await request(5);
await rpc(manager, "decide_material_request", {
  p_idempotency_key: crypto.randomUUID(), p_request_id: second.id,
  p_decisions: { [second.lineId]: "5" }, p_reason: null,
});
const cancelKey = crypto.randomUUID();
const cancelArgs = { p_idempotency_key: cancelKey, p_request_id: second.id, p_reason: "Site demand changed before dispatch" };
await rpc(foreman, "cancel_material_request", cancelArgs);
await rpc(foreman, "cancel_material_request", cancelArgs);
assert.deepEqual(await balance(), afterDispatch, "Cancellation and duplicate retry must release the reservation exactly once.");

const { data: events, error: eventError } = await admin.from("material_request_reservation_events")
  .select("event_type,quantity,reservation_id").in("event_type", ["reserved", "dispatched", "released"]);
if (eventError) throw eventError;
assert.ok(events.some((event) => event.event_type === "dispatched" && Number(event.quantity) === 8));
assert.ok(events.some((event) => event.event_type === "released" && Number(event.quantity) === 5));

console.log("PASS: approval reservation, shortage denial, dispatch, cancellation, idempotency, role denial, and stock reconciliation.");
