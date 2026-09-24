import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key || key.startsWith("replace-with")) {
  throw new Error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the local Supabase values before running this test.");
}

const makeClient = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const first = makeClient();
const second = makeClient();
const credentials = { email: "warehouse@nognog.local", password: "Warehouse123!" };
const [firstAuth, secondAuth] = await Promise.all([
  first.auth.signInWithPassword(credentials),
  second.auth.signInWithPassword(credentials),
]);

if (firstAuth.error || secondAuth.error) {
  throw new Error(`Unable to authenticate the warehouse fixture: ${firstAuth.error?.message ?? secondAuth.error?.message}`);
}

const [{ data: material, error: materialError }, { data: location, error: locationError }] = await Promise.all([
  first.from("materials").select("id,base_unit_id").eq("code", "MAT-CEMENT").single(),
  first.from("inventory_locations").select("id,warehouses!inner(code)").eq("warehouses.code", "WH-MAIN").single(),
]);

if (materialError || locationError || !material || !location) {
  throw new Error(`Seeded inventory fixture is unavailable: ${materialError?.message ?? locationError?.message}`);
}

const { data: before, error: beforeError } = await first
  .from("inventory_balances")
  .select("available_quantity")
  .eq("material_id", material.id)
  .eq("inventory_location_id", location.id)
  .single();

if (beforeError || !before || Number(before.available_quantity) <= 0) {
  throw new Error("The concurrency test requires a positive seeded cement balance. Run npm run supabase:reset first.");
}

const quantity = String(before.available_quantity);
const today = new Date().toISOString().slice(0, 10);
const attempt = (client, reference) => client.rpc("post_stock_out", {
  p_idempotency_key: crypto.randomUUID(),
  p_material_id: material.id,
  p_source_location_id: location.id,
  p_quantity: quantity,
  p_unit_id: material.base_unit_id,
  p_reference_document: reference,
  p_transaction_date: today,
  p_project_id: null,
  p_remarks: "Automated row-lock concurrency verification",
});

const runId = crypto.randomUUID().slice(0, 8);
const results = await Promise.all([
  attempt(first, `CONCURRENCY-A-${runId}`),
  attempt(second, `CONCURRENCY-B-${runId}`),
]);
const successful = results.filter((result) => !result.error);
const rejected = results.filter((result) => result.error);

if (successful.length !== 1 || rejected.length !== 1) {
  throw new Error(`Expected one commit and one rejection; received ${successful.length} commits and ${rejected.length} rejections.`);
}

const { data: after, error: afterError } = await first
  .from("inventory_balances")
  .select("available_quantity")
  .eq("material_id", material.id)
  .eq("inventory_location_id", location.id)
  .single();

if (afterError || Number(after?.available_quantity) !== 0) {
  throw new Error(`Expected an available balance of 0 after the winning release; received ${after?.available_quantity ?? "unavailable"}.`);
}

console.log("PASS: concurrent stock-outs serialized; one committed and one was rejected without negative inventory.");
