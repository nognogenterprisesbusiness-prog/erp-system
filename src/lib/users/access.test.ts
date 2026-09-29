import assert from "node:assert/strict";
import test from "node:test";

import { canAssignInitialRole, canManageAccount, invitableRoles, roleLabels } from "./access";

test("the five approved account roles are exposed", () => {
  assert.deepEqual(Object.keys(roleLabels), ["admin", "engineer", "foreman", "warehouse_staff", "finance"]);
  assert.deepEqual([...invitableRoles], ["engineer", "foreman", "warehouse_staff", "finance"]);
});

test("admin can invite Finance but cannot grant another Admin role", () => {
  assert.equal(canAssignInitialRole(["admin"], "engineer"), true);
  assert.equal(canAssignInitialRole(["admin"], "foreman"), true);
  assert.equal(canAssignInitialRole(["admin"], "warehouse_staff"), true);
  assert.equal(canAssignInitialRole(["admin"], "finance"), true);
  assert.equal(canAssignInitialRole(["admin"], "admin"), false);
  assert.equal(canAssignInitialRole(["foreman"], "engineer"), false);
});

test("account management excludes self and higher-privilege targets", () => {
  assert.equal(canManageAccount("a", ["admin"], "a", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["foreman"]), true);
  assert.equal(canManageAccount("a", ["engineer"], "b", ["foreman"]), false);
});
