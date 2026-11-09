import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceReturnPath } from "./auth-return-path";

test("retains warehouse tool targets and filters after login", () => {
  assert.equal(workspaceReturnPath("/inventory?location=123&action=stock-in"), "/inventory?location=123&action=stock-in");
  assert.equal(workspaceReturnPath("/requests/123-456"), "/requests/123-456");
  assert.equal(workspaceReturnPath("/purchase-orders/receive"), "/purchase-orders/receive");
});

test("rejects open redirects and non-workspace targets", () => {
  for (const path of ["https://other.test", "//other.test", "/\\other.test", "/%2f%2fother.test",
    "/inventory/../login", "/api/mobile/v1/session", "/purchase-orders/new", "/inventory-fake", "/scan#fragment"]) {
    assert.equal(workspaceReturnPath(path), undefined, path);
  }
});
