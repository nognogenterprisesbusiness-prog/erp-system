import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { materialInputSchema, type MaterialInput } from "@nognog/domain";
import type { Database } from "@/types/database";
import { saveMaterialCatalog } from "./save-catalog";

const id = "61234567-89ab-4cde-8123-456789abcdef";
const input: MaterialInput = { code: "MAT-CEMENT", name: "Cement", description: "", baseUnitId: id, materialKind: "consumable", minimumStockLevel: "5", isActive: "true" };
const missing = { data: null, error: { code: "PGRST202" } };

function client(rpcs: { data: string | null; error: { code: string } | null }[], reads: unknown[] = []) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const mock = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return rpcs.shift(); },
    from: () => { const query = { select: () => query, eq: () => query, is: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: reads.shift() ?? null, error: null }) }; return query; } };
  return { api: mock as unknown as SupabaseClient<Database>, calls };
}

test("material entry requires its name and unit without a client category", () => {
  const parsed = materialInputSchema.parse({ ...input, categoryId: id });
  assert.equal("categoryId" in parsed, false);
  assert.equal(materialInputSchema.safeParse({ ...input, baseUnitId: "" }).success, false);
});

test("a migrated database saves directly without category reads or setup", async () => {
  const c = client([{ data: id, error: null }]);
  assert.equal((await saveMaterialCatalog(c.api, input)).data, id);
  assert.deepEqual(c.calls.map((call) => call.name), ["save_material_catalog"]);
  assert.equal("p_category_id" in c.calls[0].args, false);
});

test("an unmigrated database preserves the existing material's category while editing", async () => {
  const c = client([missing, { data: id, error: null }], [{ category_id: id }]);
  assert.equal((await saveMaterialCatalog(c.api, { ...input, id })).data, id);
  assert.deepEqual(c.calls.map((call) => call.name), ["save_material_catalog", "save_material"]);
  assert.equal(c.calls[1].args.p_category_id, id);
});

test("an unmigrated database reuses the internal reference without user classification", async () => {
  const c = client([missing, { data: id, error: null }], [{ id, archived_at: null }]);
  assert.equal((await saveMaterialCatalog(c.api, input)).data, id);
  assert.equal(c.calls[1].args.p_category_id, id);
});

test("concurrent legacy reference setup re-reads the winning reference", async () => {
  const c = client([missing, { data: null, error: { code: "23505" } }, { data: id, error: null }], [null, { id, archived_at: null }]);
  assert.equal((await saveMaterialCatalog(c.api, input)).data, id);
  assert.deepEqual(c.calls.map((call) => call.name), ["save_material_catalog", "save_material_category", "save_material"]);
});

test("permission, validation and connection errors never fall back to another write command", async () => {
  for (const code of ["42501", "22023", "23505", "PGRST301"]) {
    const c = client([{ data: null, error: { code } }]);
    assert.equal((await saveMaterialCatalog(c.api, input)).error?.code, code);
    assert.equal(c.calls.length, 1);
  }
});
