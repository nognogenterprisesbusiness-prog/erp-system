import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceReturnPath } from "./auth-return-path";

test("retains warehouse tool targets and filters after login", () => {
  assert.equal(workspaceReturnPath("/inventory?location=123&action=stock-in"), "/inventory?location=123&action=stock-in");
  assert.equal(workspaceReturnPath("/requests/123-456"), "/requests/123-456");
  assert.equal(workspaceReturnPath("/purchase-orders/receive"), "/purchase-orders/receive");
});

test("retains staff work areas without bypassing their server-side role checks", () => {
  for (const path of ["/employees?status=active", "/attendance?date=2026-11-14", "/payroll", "/users", "/equipment", "/vehicles", "/billing", "/purchase-orders/new"]) assert.equal(workspaceReturnPath(path), path);
});

test("rejects open redirects and non-workspace targets", () => {
  for (const path of ["https://other.test", "//other.test", "/\\other.test", "/%2f%2fother.test",
    "/inventory/../login", "/api/mobile/v1/session", "/auth/accept-invite", "/inventory-fake", "/scan#fragment"]) {
    assert.equal(workspaceReturnPath(path), undefined, path);
  }
});
