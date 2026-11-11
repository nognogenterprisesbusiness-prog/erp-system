import assert from "node:assert/strict";
import test from "node:test";
import { activeNavigationGroup } from "./active-navigation";

test("the active group follows nested authorized destinations without sibling-prefix collisions", () => {
  const items = [{ href: "/inventory", group: "Main work" }, { href: "/inventory/transactions", group: "Inventory tools" }, { href: "/profile", group: "Settings" }];
  assert.equal(activeNavigationGroup("/inventory/transactions?location=site", items), "Inventory tools");
  assert.equal(activeNavigationGroup("/inventory", items), "Main work");
  assert.equal(activeNavigationGroup("/inventory-old", items), undefined);
  assert.equal(activeNavigationGroup("/profile", items), "Settings");
  assert.equal(activeNavigationGroup("/users", items), undefined);
});
