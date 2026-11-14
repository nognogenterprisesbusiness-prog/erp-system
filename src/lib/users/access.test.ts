import assert from "node:assert/strict";
import test from "node:test";

import { canAssignInitialRole, canManageAccount, invitableRoles, roleLabels, userRoleLabel, workspaceHomeHref, workforceAccess } from "./access";

test("the approved account roles include the separate HR role and mobile-only Driver", () => {
  assert.deepEqual(Object.keys(roleLabels), ["admin", "engineer", "foreman", "warehouse_staff", "finance", "driver", "hr"]);
  assert.deepEqual([...invitableRoles], ["engineer", "foreman", "warehouse_staff", "finance", "driver", "hr"]);
});

test("admin can invite Finance but cannot grant another Admin role", () => {
  assert.equal(canAssignInitialRole(["admin"], "engineer"), true);
  assert.equal(canAssignInitialRole(["admin"], "foreman"), true);
  assert.equal(canAssignInitialRole(["admin"], "warehouse_staff"), true);
  assert.equal(canAssignInitialRole(["admin"], "finance"), true);
  assert.equal(canAssignInitialRole(["admin"], "driver"), true);
  assert.equal(canAssignInitialRole(["admin"], "hr"), true);
  assert.equal(canAssignInitialRole(["hr"], "finance"), false);
  assert.equal(canAssignInitialRole(["finance"], "driver"), false);
  assert.equal(canAssignInitialRole(["admin"], "admin"), false);
  assert.equal(canAssignInitialRole(["foreman"], "engineer"), false);
});

test("account management excludes self and higher-privilege targets", () => {
  assert.equal(canManageAccount("a", ["admin"], "a", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["foreman"]), true);
  assert.equal(canManageAccount("a", ["engineer"], "b", ["foreman"]), false);
});

test("workspace homes preserve every role and do not hide a mixed-role staff workspace", () => {
  for (const role of ["admin", "engineer", "foreman", "finance", "hr"] as const) assert.equal(workspaceHomeHref([role]), "/dashboard");
  assert.equal(workspaceHomeHref(["warehouse_staff"]), "/inventory");
  assert.equal(workspaceHomeHref(["driver"]), "/driver-account");
  for (const roles of [["warehouse_staff", "finance"], ["finance", "warehouse_staff"], ["driver", "engineer"], ["warehouse_staff", "admin"]] as const) assert.equal(workspaceHomeHref(roles), "/dashboard");
  assert.equal(workspaceHomeHref(["driver", "warehouse_staff"]), "/inventory");
});

test("HR workforce capabilities are separate from finance and warehouse duties", () => {
  assert.deepEqual(workforceAccess(["hr"]), { canManageEmployees: true, canViewPayroll: true, workforceOnly: true });
  assert.deepEqual(workforceAccess(["finance"]), { canManageEmployees: false, canViewPayroll: true, workforceOnly: false });
  assert.equal(workforceAccess(["hr", "finance"]).workforceOnly, false);
  for (const role of ["foreman", "engineer", "warehouse_staff", "driver"] as const) {
    assert.equal(workforceAccess([role]).canManageEmployees, false);
    assert.equal(workforceAccess([role]).canViewPayroll, false);
  }
});

test("role labels show all assigned roles in a stable order without duplicates", () => {
  assert.equal(userRoleLabel(["finance", "admin", "finance"]), "Admin, Finance");
  assert.equal(userRoleLabel(["warehouse_staff"]), "Warehouse staff");
  assert.equal(userRoleLabel([]), "Team member");
});
