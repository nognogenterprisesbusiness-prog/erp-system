import assert from "node:assert/strict";
import test from "node:test";

import { canAssignInitialRole, canManageAccount, invitableRoles, roleLabels } from "./access";

test("only four account roles are exposed", () => {
  assert.deepEqual(Object.keys(roleLabels), ["admin", "engineer", "foreman", "warehouse_staff"]);
  assert.deepEqual([...invitableRoles], ["engineer", "foreman", "warehouse_staff"]);
});

test("admin can invite staff but cannot grant a privileged role", () => {
  assert.equal(canAssignInitialRole(["admin"], "engineer"), true);
  assert.equal(canAssignInitialRole(["admin"], "foreman"), true);
  assert.equal(canAssignInitialRole(["admin"], "warehouse_staff"), true);
  assert.equal(canAssignInitialRole(["admin"], "admin"), false);
  assert.equal(canAssignInitialRole(["foreman"], "engineer"), false);
});

test("account management excludes self and higher-privilege targets", () => {
  assert.equal(canManageAccount("a", ["admin"], "a", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["foreman"]), true);
  assert.equal(canManageAccount("a", ["engineer"], "b", ["foreman"]), false);
});
