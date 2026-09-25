import assert from "node:assert/strict";
import { test } from "node:test";
import { changedAuditFields } from "./diff";

test("audit inspection shows changed fields without unchanged noise", () => {
  assert.deepEqual(changedAuditFields(
    { status: "submitted", quantity: 10, details: { note: "old" } },
    { status: "approved", quantity: 10, details: { note: "new" } },
  ), [
    { field: "details", before: '{"note":"old"}', after: '{"note":"new"}' },
    { field: "status", before: "submitted", after: "approved" },
  ]);
});

test("audit inspection represents insertions and removals", () => {
  assert.deepEqual(changedAuditFields(null, { role: "admin" }), [{ field: "role", before: "—", after: "admin" }]);
  assert.deepEqual(changedAuditFields({ role: "admin" }, null), [{ field: "role", before: "admin", after: "—" }]);
});
