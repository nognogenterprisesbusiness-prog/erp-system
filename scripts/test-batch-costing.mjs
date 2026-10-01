// Runs the newest-batch-first costing migration on an in-memory PostgreSQL (PGlite).
// It loads the previous average-cost trigger first, posts stock, then applies the
// migration twice and checks every costing path against exact peso amounts.
// No Docker, network database or company data is used.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const MIG = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const valuationSql = fs.readFileSync(MIG + "20260924200000_verified_inventory_valuation.sql", "utf8");
const varianceSql = fs.readFileSync(MIG + "20260924201000_transfer_variance_approval.sql", "utf8");
const newSql = fs.readFileSync(MIG + "20261001100000_latest_batch_costing.sql", "utf8");
const cut = (text, start, end) => { const a = text.indexOf(start); const b = text.indexOf(end, a); assert(a >= 0 && b > a, start); return text.slice(a, b + end.length); };
const oldTrigger = cut(valuationSql, "create function private.post_inventory_valuation()", "for each row execute function private.post_inventory_valuation();");
const oldFinalize = cut(varianceSql, "create function private.finalize_transfer_receipt_cost", "end; $$;");

const db = new PGlite();
await db.exec(fs.readFileSync(new URL("./batch-costing-fixture.sql", import.meta.url), "utf8"));
await db.exec(oldTrigger);
await db.exec(oldFinalize);

const one = async (sql) => { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : undefined; };
const num = async (sql) => Number(await one(sql));
const fails = async (sql, pattern) => { await assert.rejects(db.exec(sql), pattern); };
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("✔", name); };

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const [W, S, W2] = [U(901), U(902), U(903)];
await db.exec(`
  insert into public.warehouses values ('${U(1)}','Main warehouse'), ('${U(3)}','North warehouse');
  insert into public.projects values ('${U(10)}');
  insert into public.project_sites values ('${U(2)}','${U(10)}','Site A');
  insert into public.inventory_locations (id, location_type, warehouse_id) values ('${W}','warehouse','${U(1)}'), ('${W2}','warehouse','${U(3)}');
  insert into public.inventory_locations (id, location_type, project_site_id) values ('${S}','project_site','${U(2)}');
  insert into public.materials select ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000b1' from generate_series(1, 20) g;`);
const M = (n) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const cost = (tx) => num(`select cost_total from public.inventory_transactions where id = '${tx}'`);
const val = (m, loc) => db.query(`select quantity_on_hand::numeric q, total_value::numeric v from public.inventory_valuations where material_id='${m}' and inventory_location_id='${loc}'`).then((r) => r.rows[0] && { q: Number(r.rows[0].q), v: Number(r.rows[0].v) });
const layers = (m, loc) => db.query(`select batch_number::int b, remaining_quantity::numeric q, remaining_value::numeric v, unit_cost::numeric u from public.inventory_cost_layers where material_id='${m}' and inventory_location_id='${loc}' and remaining_quantity > 0 order by (batch_number=0), batch_date desc, batch_number desc`).then((r) => r.rows.map((x) => ({ b: x.b, q: Number(x.q), v: Number(x.v), u: Number(x.u) })));

// ---------- Before migration: weighted-average costing ----------
await one(`select t_stock_in('${M(1)}','${W}',100,10000)`);   // 100 @ 100
await one(`select t_stock_in('${M(1)}','${W}',100,14000)`);   // 100 @ 140 -> average 120
const legacyOut = await one(`select t_out('${M(1)}','${W}',10,'STOCK_OUT')`);
const legacyItem = await one(`select t_dispatch('${M(1)}','${W}','${S}',40)`);
await one(`select t_receive('${legacyItem}',10)`);
const legacyDispatchForReversal = await one(`select t_dispatch('${M(1)}','${W}','${S}',5)`);
// Unvalued opening stock and unvalued legacy transit (pre-valuation data).
await db.exec(`insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values ('${M(5)}','${W}',50);
  insert into public.inventory_valuations (material_id, inventory_location_id, quantity_on_hand, total_value) values ('${M(5)}','${W}',50,null);
  insert into public.inventory_transfers (id, transfer_number, source_location_id, destination_location_id) values ('${U(77)}','TR-OLD','${W}','${S}');
  insert into public.inventory_transfer_items (id, transfer_id, material_id, unit_of_measure_id, dispatched_quantity) values ('${U(78)}','${U(77)}','${M(6)}','00000000-0000-0000-0000-0000000000b1',20);`);

await check("old trigger: average cost 120/unit on legacy stock-out", async () => assert.equal(await cost(legacyOut), 1200));

// ---------- Apply the migration twice (rerun safety) ----------
await db.exec(newSql);
await db.exec(newSql);

await check("backfill: warehouse carried forward as batch 0 at the old average", async () => {
  const w = await val(M(1), W);
  assert.deepEqual(await layers(M(1), W), [{ b: 0, q: w.q, v: w.v, u: 120 }]);
  assert.deepEqual(await layers(M(1), S), [{ b: 0, q: 10, v: 1200, u: 120 }]);
});
await check("backfill: in-transit remainder carried forward, no duplicates after rerun", async () => {
  assert.equal(await num(`select count(*) from public.inventory_cost_layers where transfer_item_id='${legacyItem}'`), 1);
  assert.equal(await num(`select remaining_quantity from public.inventory_cost_layers where transfer_item_id='${legacyItem}'`), 30);
  assert.equal(await num(`select remaining_value from public.inventory_cost_layers where transfer_item_id='${legacyItem}'`), 3600);
});

// ---------- Client example 1: 1,000 @ 100 then 1,000 @ 200 ----------
await one(`select t_stock_in('${M(2)}','${W}',1000,100000)`);
await one(`select t_stock_in('${M(2)}','${W}',1000,200000)`);
await check("warehouse stock-out uses the newest (PHP 200) batch first", async () => {
  const tx = await one(`select t_out('${M(2)}','${W}',300,'STOCK_OUT')`);
  assert.equal(await cost(tx), 60000);
  assert.deepEqual((await layers(M(2), W)).map((l) => [l.u, l.q]), [[200, 700], [100, 1000]]);
});
await check("crossing batches: 900 pcs = 700 @ 200 + 200 @ 100", async () => {
  const tx = await one(`select t_out('${M(2)}','${W}',900,'STOCK_OUT')`);
  assert.equal(await cost(tx), 140000 + 20000);
  assert.deepEqual((await layers(M(2), W)).map((l) => [l.u, l.q]), [[100, 800]]);
  assert.deepEqual(await val(M(2), W), { q: 800, v: 80000 });
});

// ---------- Client example 2: 1,000 @ 100 then 2,000 @ 150, through site use ----------
await one(`select t_stock_in('${M(3)}','${W}',1000,100000)`);
await one(`select t_stock_in('${M(3)}','${W}',2000,300000)`);
let item3;
await check("dispatch 2,500 to site = 2,000 @ 150 + 500 @ 100; batches travel with it", async () => {
  item3 = await one(`select t_dispatch('${M(3)}','${W}','${S}',2500)`);
  assert.equal(await num(`select dispatched_total_cost from public.inventory_transfer_items where id='${item3}'`), 350000);
  assert.deepEqual((await layers(M(3), W)).map((l) => [l.u, l.q]), [[100, 500]]);
});
await check("partial receipt brings the newest batch first", async () => {
  const tx = await one(`select t_receive('${item3}',1000)`);
  assert.equal(await cost(tx), 150000);
});
await check("transit loss takes the next newest batch", async () => {
  const id = await one(`select public.approve_transfer_variance('${U(500)}','${item3}',100,'Broken bags')`);
  assert.equal(await num(`select cost_total from public.inventory_transfer_variances where id='${id}'`), 15000);
  assert.equal(await one(`select public.approve_transfer_variance('${U(500)}','${item3}',100,'Broken bags')`), id, "idempotent retry");
});
await check("final receipt reconciles transit to zero with no remainder", async () => {
  const tx = await one(`select t_receive('${item3}',1400)`);
  assert.equal(await cost(tx), 900 * 150 + 500 * 100);
  assert.equal(await num(`select coalesce(sum(remaining_value),0) + coalesce(sum(remaining_quantity),0) from public.inventory_cost_layers where transfer_item_id='${item3}'`), 0);
  assert.deepEqual((await layers(M(3), S)).map((l) => [l.u, l.q]), [[150, 1900], [100, 500]]);
});
await check("site consumption charges PHP 150 until that batch is used up, then PHP 100", async () => {
  const a = await one(`select t_out('${M(3)}','${S}',1000,'MATERIAL_CONSUMPTION')`);
  assert.equal(await cost(a), 150000);
  assert.equal(await num(`select cost_unit from public.inventory_transactions where id='${a}'`), 150);
  const b = await one(`select t_out('${M(3)}','${S}',1000,'MATERIAL_CONSUMPTION')`);
  assert.equal(await cost(b), 900 * 150 + 100 * 100);
  assert.deepEqual(await val(M(3), S), { q: 400, v: 40000 });
});
await check("a newer purchase does not change costs already posted", async () => {
  const before = await num(`select sum(cost_total) from public.inventory_transactions where material_id='${M(3)}' and transaction_type='MATERIAL_CONSUMPTION'`);
  await one(`select t_stock_in('${M(3)}','${W}',100,50000)`);
  assert.equal(await num(`select sum(cost_total) from public.inventory_transactions where material_id='${M(3)}' and transaction_type='MATERIAL_CONSUMPTION'`), before);
});

// ---------- Reversals ----------
await check("reversing a consumption restores the exact batches it used", async () => {
  await one(`select t_stock_in('${M(4)}','${S}',10,1000)`);  // 10 @ 100 (direct to site for the test)
  await one(`select t_stock_in('${M(4)}','${S}',10,3000)`);  // 10 @ 300
  const use = await one(`select t_out('${M(4)}','${S}',15,'MATERIAL_CONSUMPTION')`);
  assert.equal(await cost(use), 3000 + 500);
  const rev = await one(`select t_reverse('${use}')`);
  assert.equal(await cost(rev), 3500);
  assert.deepEqual((await layers(M(4), S)).map((l) => [l.u, l.q, l.v]), [[300, 10, 3000], [100, 10, 1000]]);
});
await check("cancelling a dispatch in transit returns its batches and clears transit", async () => {
  await one(`select t_stock_in('${M(7)}','${W}',10,1000)`);
  await one(`select t_stock_in('${M(7)}','${W}',10,2000)`);
  const item = await one(`select t_dispatch('${M(7)}','${W}','${S}',15)`);
  const dispatchTx = await one(`select id from public.inventory_transactions where transfer_item_id='${item}' and transfer_phase='dispatch'`);
  await one(`select t_reverse('${dispatchTx}')`);
  assert.equal(await num(`select count(*) from public.inventory_cost_layers where transfer_item_id='${item}'`), 0);
  assert.deepEqual((await layers(M(7), W)).map((l) => [l.u, l.q, l.v]), [[200, 10, 2000], [100, 10, 1000]]);
});
await check("reversing a pre-migration stock-out returns it as batch 0 at its old cost", async () => {
  const rev = await one(`select t_reverse('${legacyOut}')`);
  assert.equal(await cost(rev), 1200);
  const w = await val(M(1), W);
  const l = await layers(M(1), W);
  assert.equal(l.length, 1); assert.equal(l[0].b, 0); assert.equal(l[0].q, w.q); assert.equal(l[0].v, w.v);
});
await check("cancelling a pre-migration dispatch restores its average cost", async () => {
  const tx = await one(`select id from public.inventory_transactions where transfer_item_id='${legacyDispatchForReversal}' and transfer_phase='dispatch'`);
  const rev = await one(`select t_reverse('${tx}')`);
  assert.equal(await cost(rev), 600);
});
await check("receiving the remaining pre-migration transit uses its carried value", async () => {
  const tx = await one(`select t_receive('${legacyItem}',30)`);
  assert.equal(await cost(tx), 3600);
});

// ---------- Rounding, ordering, legacy opening ----------
await check("thirds of a peso add back to exactly PHP 100.00", async () => {
  await one(`select t_stock_in('${M(8)}','${W}',3,100)`);
  const a = await cost(await one(`select t_out('${M(8)}','${W}',1,'STOCK_OUT')`));
  const b = await cost(await one(`select t_out('${M(8)}','${W}',1,'STOCK_OUT')`));
  const c = await cost(await one(`select t_out('${M(8)}','${W}',1,'STOCK_OUT')`));
  assert.equal(Math.round((a + b + c) * 100), 10000); assert.ok([a, b, c].every((x) => x === 33.33 || x === 33.34));
  assert.deepEqual(await val(M(8), W), { q: 0, v: 0 });
});
await check("a backdated purchase entered later is not treated as the newest", async () => {
  await one(`select t_stock_in('${M(9)}','${W}',10,2000,'2026-09-30')`); // 10 @ 200, dated 30 Sep
  await one(`select t_stock_in('${M(9)}','${W}',10,1000,'2026-09-01')`); // 10 @ 100, entered late, dated 1 Sep
  assert.equal(await cost(await one(`select t_out('${M(9)}','${W}',10,'STOCK_OUT')`)), 2000);
});
await check("new purchases are used before carried-forward batch 0", async () => {
  await one(`select t_stock_in('${M(1)}','${W}',10,5000)`); // 10 @ 500
  assert.equal(await cost(await one(`select t_out('${M(1)}','${W}',12,'STOCK_OUT')`)), 5000 + 240);
});
await check("verifying an opening value creates its batch 0", async () => {
  await db.exec(`update public.inventory_valuations set total_value = 2500 where material_id='${M(5)}' and inventory_location_id='${W}'`);
  assert.deepEqual(await layers(M(5), W), [{ b: 0, q: 50, v: 2500, u: 50 }]);
  assert.equal(await cost(await one(`select t_out('${M(5)}','${W}',5,'STOCK_OUT')`)), 250);
});
await check("verifying a legacy transit value creates its transit batch", async () => {
  await db.exec(`update public.inventory_transfer_items set dispatched_total_cost = 2000 where id='${U(78)}'`);
  assert.equal(await num(`select remaining_value from public.inventory_cost_layers where transfer_item_id='${U(78)}'`), 2000);
});
await check("stock with no priced batch is still rejected", async () => {
  await db.exec(`insert into public.inventory_balances (material_id, inventory_location_id, quantity_on_hand) values ('${M(11)}','${W}',5);
    insert into public.inventory_valuations (material_id, inventory_location_id, quantity_on_hand, total_value) values ('${M(11)}','${W}',5,null);`);
  await fails(`select t_out('${M(11)}','${W}',1,'STOCK_OUT')`, /no verified value/);
});
await check("drift between batches and valuation is caught, not posted", async () => {
  await one(`select t_stock_in('${M(12)}','${W}',10,1000)`);
  await db.exec(`update public.inventory_valuations set total_value = total_value + 1 where material_id='${M(12)}' and inventory_location_id='${W}'`);
  await fails(`select t_out('${M(12)}','${W}',1,'STOCK_OUT')`, /do not reconcile/);
});
await check("every location's batches equal its valuation total", async () => {
  const bad = await db.query(`select v.material_id, v.inventory_location_id from public.inventory_valuations v
    left join lateral (select coalesce(sum(remaining_quantity),0) q, coalesce(sum(remaining_value),0) s from public.inventory_cost_layers l
      where l.material_id=v.material_id and l.inventory_location_id=v.inventory_location_id) l on true
    where v.total_value is not null and v.material_id <> '${M(12)}' and (l.q <> v.quantity_on_hand or l.s <> v.total_value)`);
  assert.deepEqual(bad.rows, []);
});
await check("batch report lists batches in the order they will be used", async () => {
  const r = await db.query(`select location_name, unit_cost::numeric u, remaining_quantity::numeric q, use_order::int o from public.get_material_cost_batches('${M(4)}')`);
  assert.deepEqual(r.rows.map((x) => [x.location_name, Number(x.u), Number(x.q), x.o]), [["Site A", 300, 10, 1], ["Site A", 100, 10, 2]]);
});

console.log(`\n${passed} scenarios passed`);
