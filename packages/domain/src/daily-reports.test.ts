import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyReportReviewSchema } from "./daily-reports";

const reportId = "11111111-1111-4111-8111-111111111111";

test("approval may omit a review note", () => {
  assert.equal(dailyReportReviewSchema.safeParse({ reportId, action: "approve", note: "" }).success, true);
});

test("return requires a reason", () => {
  assert.equal(dailyReportReviewSchema.safeParse({ reportId, action: "return", note: "" }).success, false);
  assert.equal(dailyReportReviewSchema.safeParse({ reportId, action: "return", note: "Correct site measurements" }).success, true);
});

test("unknown review actions are rejected", () => {
  assert.equal(dailyReportReviewSchema.safeParse({ reportId, action: "reject", note: "reason" }).success, false);
});
