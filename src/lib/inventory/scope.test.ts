import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryLocationKind, inventoryScopeLabel, parseInventoryScope, resolveInventoryScope } from "./scope";

test("inventory defaults to warehouse stock, while site-only staff retain a usable site view", () => {
  const warehousesAndSites = [{ location_type: "warehouse" }, { location_type: "project_site" }];
  assert.equal(resolveInventoryScope(undefined, warehousesAndSites), "warehouses");
  assert.equal(resolveInventoryScope(undefined, [{ location_type: "project_site" }]), "sites");
  assert.equal(resolveInventoryScope("overview", warehousesAndSites), "overview");
  assert.equal(resolveInventoryScope("sites", warehousesAndSites), "sites");
  assert.equal(inventoryLocationKind(resolveInventoryScope(undefined, warehousesAndSites)), "warehouse");
  assert.equal(inventoryLocationKind(resolveInventoryScope(undefined, [{ location_type: "project_site" }])), "project_site");
});

test("URL scopes preserve the overview and reject untrusted scope values", () => {
  for (const value of [undefined, null, "", "invalid", ["overview"], { scope: "overview" }]) {
    assert.equal(parseInventoryScope(value), undefined);
  }
  assert.equal(inventoryScopeLabel(resolveInventoryScope("warehouses", [])), "All warehouses");
  assert.equal(inventoryScopeLabel(resolveInventoryScope("sites", [])), "All sites");
  assert.equal(inventoryScopeLabel(resolveInventoryScope("overview", [])), "All locations");
  assert.equal(inventoryLocationKind("overview"), "all");
});
