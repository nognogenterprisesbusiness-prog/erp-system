// Runs the Warehouse Staff purchase-receipt rule on an in-memory PostgreSQL (PGlite):
// scoped warehouse, PO price only, no price columns, retries and Admin cost changes.
// Stock-in without a purchase order stays Admin-only.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const MIG = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const read = (f) => fs.readFileSync(MIG + f, "utf8");
const cut = (text, start, end) => { const a = text.indexOf(start); const b = text.indexOf(end, a); assert(a >= 0 && b > a, start); return text.slice(a, b + end.length); };
const db = new PGlite();
await db.exec(fs.readFileSync(new URL("./batch-costing-fixture.sql", import.meta.url), "utf8"));
const ADMIN = "00000000-0000-0000-0000-0000000000aa", STAFF = "00000000-0000-0000-0000-0000000000bb";
await db.exec(`
  create or replace function auth.uid() returns uuid language sql stable as $$ select current_setting('test.uid')::uuid $$;
  create or replace function private.has_any_role(r public.app_role[]) returns boolean language sql stable as $$ select current_setting('test.role')::public.app_role = any(r) $$;
  create or replace function private.can_manage_inventory() returns boolean language sql stable as $$ select current_setting('test.role') = 'admin' $$;
  create function private.can_manage_warehouses() returns boolean language sql stable as $$ select current_setting('test.role') = 'admin' $$;
  create table public.warehouse_assignments (warehouse_id uuid, user_id uuid, status text);
  create function private.can_access_warehouse(target uuid) returns boolean language sql stable as $$
    select private.can_manage_warehouses() or exists (select 1 from public.warehouse_assignments where warehouse_id = target and user_id = auth.uid() and status = 'active') $$;
  create function private.validate_inventory_material(m uuid, u uuid) returns void language plpgsql as $$ begin end $$;
  insert into public.profiles values ('${STAFF}');
  alter table public.units_of_measure add column symbol text default 'bag';
  alter table public.materials add column code text default 'CEM', add column name text default 'Cement';
  create table public.suppliers (id uuid primary key, supplier_name text);
  create table public.purchase_orders (id uuid primary key, po_number text, supplier_id uuid, supplier_name text, warehouse_id uuid, ordered_on date, expected_on date, status text, updated_at timestamptz);
  create table public.purchase_order_lines (id uuid primary key, purchase_order_id uuid, material_id uuid, unit_of_measure_id uuid, ordered_quantity numeric(20,4), received_quantity numeric(20,4) default 0, unit_price numeric(18,2));
  create table public.purchase_order_receipts (id uuid primary key, purchase_order_id uuid, purchase_order_line_id uuid, inventory_transaction_id uuid, quantity numeric, goods_total_cost numeric(18,2), expected_total_cost numeric(18,2), cost_variance_reason text, delivery_reference text, received_on date, received_by uuid, idempotency_key uuid unique, command_payload jsonb);`);
await db.exec(cut(read("20260924200000_verified_inventory_valuation.sql"), "create function private.post_valued_stock_in_core(", "end; $$;"));
await db.exec(cut(read("20260924200000_verified_inventory_valuation.sql"), "create function public.post_valued_stock_in(", "end; $$;"));
await db.exec(read("20261001100000_latest_batch_costing.sql"));
// Trigger from the original migration (the batch migration replaces only its function).
await db.exec(`create trigger inventory_transaction_value_before_insert before insert on public.inventory_transactions for each row execute function private.post_inventory_valuation();`);
await db.exec(read("20261001110000_warehouse_purchase_receipts.sql"));
await db.exec(read("20261001130000_fix_receivable_po_supplier_name.sql"));

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
  insert into public.warehouses values ('${U(1)}','Main'), ('${U(3)}','North');
  insert into public.inventory_locations (id, location_type, warehouse_id) values ('${U(901)}','warehouse','${U(1)}'), ('${U(903)}','warehouse','${U(3)}');
  insert into public.materials (id, base_unit_id) values ('${U(101)}','00000000-0000-0000-0000-0000000000b1');
  insert into public.suppliers values ('${U(50)}','Hardware Co');
  insert into public.purchase_orders values ('${U(60)}','PO-1','${U(50)}','Hardware Co','${U(1)}','2026-09-30','2026-10-02','issued',now()), ('${U(61)}','PO-2','${U(50)}','Hardware Co','${U(3)}','2026-09-30','2026-10-02','issued',now());
  insert into public.purchase_order_lines values ('${U(70)}','${U(60)}','${U(101)}','00000000-0000-0000-0000-0000000000b1',100,0,250), ('${U(71)}','${U(61)}','${U(101)}','00000000-0000-0000-0000-0000000000b1',10,0,300);
  insert into public.warehouse_assignments values ('${U(1)}','${STAFF}','active');`);
const as = async (role, uid, sql) => { await db.exec(`select set_config('test.role','${role}',false), set_config('test.uid','${uid}',false)`); return db.query(sql); };
const recv = (key, line, qty, cost = "null", reason = "null") => `select public.receive_purchase_order_line('${U(key)}','${U(line)}',${qty},${cost},'DR-${key}','2026-10-01',${reason}) id`;
let n = 0; const ok = (name) => console.log("✔", name, ++n);

const list = await as("warehouse_staff", STAFF, `select po_number, supplier_name, remaining_quantity::numeric r from public.get_warehouse_receivable_po_lines()`);
assert.equal(list.rows[0]?.supplier_name, "Hardware Co");
assert.deepEqual(list.rows.map((r) => r.po_number), ["PO-1"]); assert.equal(Object.keys(list.rows[0]).some((k) => /price|cost|total/.test(k)), false); ok("staff sees only their warehouse's deliveries, with no price columns");

await as("warehouse_staff", STAFF, recv(800, 70, 40));
const tx = await db.query(`select cost_total::numeric c, responsible_user_id u from public.inventory_transactions where transaction_type='STOCK_IN'`);
assert.equal(Number(tx.rows[0].c), 10000); assert.equal(tx.rows[0].u, STAFF); ok("staff receipt posts stock at the PO price (40 × 250 = 10,000)");
const layer = await db.query(`select unit_cost::numeric u, remaining_quantity::numeric q from public.inventory_cost_layers where inventory_location_id='${U(901)}'`);
assert.deepEqual([Number(layer.rows[0].u), Number(layer.rows[0].q)], [250, 40]); ok("receipt creates a priced batch");
assert.equal((await db.query(`select status from public.purchase_orders where id='${U(60)}'`)).rows[0].status, "partially_received"); ok("PO becomes partially received");
assert.equal((await as("warehouse_staff", STAFF, recv(800, 70, 40))).rows.length, 1); assert.equal(Number((await db.query(`select count(*) c from public.purchase_order_receipts`)).rows[0].c), 1); ok("retry with the same key does not double-post");

await assert.rejects(as("warehouse_staff", STAFF, recv(801, 70, 10, 2000, "'cheaper'")), /Only an administrator can change the received cost/); ok("staff cannot change the cost");
await assert.rejects(as("warehouse_staff", STAFF, recv(802, 71, 5)), /Not assigned/); ok("staff cannot receive into another warehouse");
await assert.rejects(as("foreman", U(5), recv(803, 70, 5)), /Only an administrator or warehouse staff/); ok("other roles are refused");
await assert.rejects(as("warehouse_staff", STAFF, recv(804, 70, 61)), /exceeds ordered quantity/); ok("cannot receive more than ordered");

await as("admin", ADMIN, recv(805, 71, 10, 2900, "'Supplier discount'"));
assert.equal(Number((await db.query(`select goods_total_cost::numeric c from public.purchase_order_receipts where idempotency_key='${U(805)}'`)).rows[0].c), 2900); ok("admin can still receive at a changed cost with a reason");
await as("admin", ADMIN, recv(806, 70, 60));
assert.equal((await db.query(`select status from public.purchase_orders where id='${U(60)}'`)).rows[0].status, "received"); ok("admin receipt at PO price (null cost) completes the order");
await assert.rejects(as("warehouse_staff", STAFF, `select public.post_valued_stock_in('${U(900)}','${U(101)}','${U(901)}',5,'00000000-0000-0000-0000-0000000000b1',1000,'DR-900','2026-10-01','No PO')`), /not authorized for destination warehouse/); ok("staff cannot add stock without an Admin-issued purchase order");
console.log(`\n${n} checks passed`);
