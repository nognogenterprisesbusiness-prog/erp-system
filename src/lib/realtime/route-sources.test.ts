import assert from "node:assert/strict";
import test from "node:test";
import { liveTablesForPath, refreshIntervalForPath } from "./route-sources";

test("operational routes subscribe only to their related data", () => {
  assert.deepEqual(liveTablesForPath("/requests/assigned-request"), ["material_requests", "material_request_lines", "inventory_balances", "inventory_transfers", "inventory_transfer_items"]);
  assert.deepEqual(liveTablesForPath("/inventory/transactions"), ["inventory_transactions"]);
  assert.deepEqual(liveTablesForPath("/inventory/counts"), ["inventory_stock_counts", "inventory_balances"]);
  assert.deepEqual(liveTablesForPath("/requests", "equipment"), ["equipment_requests", "assets"]);
  assert.deepEqual(liveTablesForPath("/requests", "vehicle"), ["equipment_requests", "assets"]);
  assert.deepEqual(liveTablesForPath("/requests"), ["material_requests", "material_request_lines", "inventory_balances", "inventory_transfers", "inventory_transfer_items"]);
  assert.deepEqual(liveTablesForPath("/reports/daily/record-id"), ["daily_reports", "project_progress_entries", "daily_report_resource_links", "project_attendance", "project_equipment_usage", "inventory_transactions"]);
  assert.ok(liveTablesForPath("/projects/record-id").includes("project_attendance"));
  assert.ok(liveTablesForPath("/projects/record-id").includes("project_equipment_usage"));
  assert.ok(liveTablesForPath("/projects/record-id").includes("daily_report_resource_links"));
  assert.deepEqual(liveTablesForPath("/attendance"), ["project_attendance", "project_attendance_reversals"]);
  assert.deepEqual(liveTablesForPath("/notifications"), ["notifications"]);
});

test("reference pages do not keep operational subscriptions open", () => {
  for (const pathname of ["/suppliers", "/employees", "/profile"]) {
    assert.deepEqual(liveTablesForPath(pathname), []);
    assert.equal(refreshIntervalForPath(pathname), null);
  }
  assert.equal(refreshIntervalForPath("/dashboard"), 120_000);
  assert.equal(refreshIntervalForPath("/inventory"), 90_000);
  assert.equal(refreshIntervalForPath("/projects/record-id"), 90_000);
});
