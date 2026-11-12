import assert from "node:assert/strict";
import test from "node:test";
import { auditChanges, auditRecordName, auditSummary, auditValue, auditActionLabel } from "./presentation";

test("audit history identifies the saved record and describes only real changes", () => {
  const old = { name: "Portable pump", status: "available", quantity: 10, updated_at: "2026-11-01" };
  const next = { ...old, status: "under_maintenance", updated_at: "2026-11-02" };
  assert.equal(auditRecordName("assets", old, next), "Portable pump");
  assert.equal(auditSummary("update", old, next), "Status changed from Available to Under maintenance.");
  assert.deepEqual(auditChanges(old, next).filter(row => !row.technical).map(({ label, before, after }) => ({ label, before, after })), [
    { label: "Status", before: "Available", after: "Under maintenance" },
  ]);
  assert.equal(auditActionLabel("INSERT"), "Added");
});

test("readable values preserve zero, false, null, currency precision and plain text", () => {
  assert.equal(auditValue("quantity", 0), "0");
  assert.equal(auditValue("is_active", false), "No");
  assert.equal(auditValue("name", null), "Not set");
  assert.equal(auditValue("name", undefined), "Not recorded");
  assert.equal(auditValue("amount", "722222000.25"), "₱722,222,000.25");
  assert.equal(auditValue("unit_cost", "0.123456"), "₱0.123456");
  assert.equal(auditValue("note", '<script>alert("x")</script>'), '<script>alert("x")</script>');
  assert.equal(auditValue("work_date", "2026-11-10"), "Nov 10, 2026");
  assert.equal(auditValue("code", "2026-11-10"), "2026-11-10");
});

test("saved references retain distinct identities even if current names match", () => {
  const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
  const names = new Map([[`warehouse_id:${first}`, "Main warehouse"], [`warehouse_id:${second}`, "Main warehouse"]]);
  const change = auditChanges({ warehouse_id: first }, { warehouse_id: second }, names)[0];
  assert.match(change.before, new RegExp(first));
  assert.match(change.after, new RegExp(second));
  assert.equal(auditValue("warehouse_id", first), `Reference ${first}`);
});

test("insertions/deletions and system-only updates do not invent approval or posting", () => {
  assert.equal(auditRecordName("employees", null, { first_name: "Ana", last_name: "Cruz", code: "EMP-1" }), "Ana Cruz");
  assert.equal(auditRecordName("material_requests", null, { request_number: "MR-12", status: "submitted" }), "MR-12");
  assert.match(auditSummary("insert", null, { status: "approved" }), /^New record saved/);
  assert.match(auditSummary("delete", { name: "Old" }, null), /^Record deleted/);
  assert.match(auditSummary("update", { updated_at: "A" }, { updated_at: "B" }), /^System information updated/);
  assert.equal(auditChanges({ quantity: 10 }, { quantity: 10 }).length, 0);
  assert.equal(auditSummary("insert", null, { event_type: "submitted", report_snapshot: { report_number: "DR-21" } }), "Recorded action: Submitted.");
  assert.equal(auditRecordName("daily_report_events", null, { report_snapshot: { report_number: "DR-21" } }), "DR-21");
  assert.equal(auditChanges(null, { report_snapshot: { id: "saved-id" }, submission_payload: {} }).every(row => row.technical), true);
  assert.equal(auditChanges(null, { approved_at: null, submission_hash: "stored-hash" }).every(row => row.technical), true);
  assert.equal(auditChanges({ note: "Before" }, { note: null })[0].technical, false);
});
