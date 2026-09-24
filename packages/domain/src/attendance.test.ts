import assert from "node:assert/strict";
import { test } from "node:test";
import { postAttendanceSchema } from "./attendance";

const id = "01234567-89ab-4cde-8123-456789abcdef";
const base = { idempotencyKey: id, projectId: id, assignmentId: id, workDate: "2026-09-24", status: "present", hours: "8", rateType: "hourly", dayFraction: "", note: "Concrete pouring" };
test("attendance accepts hourly and explicitly fractional daily costing", () => {
  assert.equal(postAttendanceSchema.safeParse(base).success, true);
  assert.equal(postAttendanceSchema.safeParse({ ...base, rateType: "daily", dayFraction: "0.5" }).success, true);
  assert.equal(postAttendanceSchema.safeParse({ ...base, rateType: "daily", dayFraction: "" }).success, false);
  assert.equal(postAttendanceSchema.safeParse({ ...base, hours: "25" }).success, false);
  assert.equal(postAttendanceSchema.safeParse({ ...base, status: "absent", hours: "0", rateType: "none" }).success, true);
});
