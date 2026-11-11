import assert from "node:assert/strict";
import test from "node:test";
import { displayMoney, displayDate, displayQuantity, displayStatus, auditActivityLabel, projectSiteLabel } from "./display";

test("display formatting groups PHP amounts without dropping centavos or signs", () => {
  assert.equal(displayMoney("722222000.25"), "₱722,222,000.25");
  assert.equal(displayMoney(-1000.5), "-₱1,000.50");
  assert.equal(displayQuantity("2400.125"), "2,400.125");
});
test("dates use Philippines time and missing data stays explicit", () => {
  assert.equal(displayDate("2026-11-10"), "Nov 10, 2026");
  assert.equal(displayDate(null), "Not recorded");
  assert.equal(displayDate("invalid"), "Date unavailable");
});
test("labels avoid duplicate site names and do not invent a workflow transition", () => {
  assert.equal(projectSiteLabel(" CTU phase 3 ", "ctu phase 3"), "CTU phase 3");
  assert.equal(projectSiteLabel("CTU", "North wing"), "CTU · North wing");
  assert.equal(auditActivityLabel("insert", "daily_report_events"), "Added daily report history");
  assert.equal(displayStatus("under_maintenance"), "Under maintenance");
});

