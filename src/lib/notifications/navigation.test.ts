import assert from "node:assert/strict";
import test from "node:test";
import { notificationHref, notificationRecordLabel } from "./navigation";

const id = "f5874746-3d39-4140-8ff6-16e8daa2d526";
test("notification destinations preserve the linked record and give staff a specific action", () => {
  for (const [entity_type, path, label] of [["daily_report", "/reports/daily", "View daily report"], ["material_request", "/requests", "View request"], ["vehicle", "/vehicles", "View vehicle"], ["equipment", "/equipment", "View equipment"]]) {
    assert.equal(notificationHref({ entity_type, entity_id: id, project_id: null, warehouse_id: null }), `${path}/${id}`);
    assert.equal(notificationRecordLabel(entity_type), label);
  }
});
test("notification destinations do not invent links for missing or unsupported records", () => {
  assert.equal(notificationHref({ entity_type: "daily_report", entity_id: null, project_id: null, warehouse_id: null }), null);
  assert.equal(notificationHref({ entity_type: "unsupported", entity_id: id, project_id: null, warehouse_id: null }), null);
  assert.equal(notificationHref({ entity_type: "project_site", entity_id: id, project_id: null, warehouse_id: null }), null);
  assert.equal(notificationHref({ entity_type: "project_site", entity_id: id, project_id: id, warehouse_id: null }), `/projects/${id}`);
});
