import assert from "node:assert/strict";
import test from "node:test";

import { canAssignInitialRole, canManageAccount } from "./access";

test("admin can invite staff but cannot grant a privileged role", () => {
  assert.equal(canAssignInitialRole(["admin"], "engineer"), true);
  assert.equal(canAssignInitialRole(["admin"], "admin"), false);
  assert.equal(canAssignInitialRole(["admin"], "owner"), false);
  assert.equal(canAssignInitialRole(["worker"], "engineer"), false);
  assert.equal(canAssignInitialRole(["owner"], "admin"), true);
});

test("account management excludes self and higher-privilege targets", () => {
  assert.equal(canManageAccount("a", ["admin"], "a", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["owner"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["admin"]), false);
  assert.equal(canManageAccount("a", ["admin"], "b", ["worker"]), true);
  assert.equal(canManageAccount("a", ["owner"], "b", ["admin"]), true);
});
