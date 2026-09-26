import assert from "node:assert/strict";
import { test } from "node:test";
import { postAttendanceSchema } from "./attendance";
const id = "01234567-89ab-4cde-8123-456789abcdef";
const base = { idempotencyKey: id, projectId: id, assignmentId: id, workDate: "2026-09-24", status: "present", hours: "8", rateType: "hourly", dayFraction: "", note: "Concrete pouring" };
test("attendance validates hourly, daily and unpaid entries", () => {
  assert.equal(postAttendanceSchema.safeParse(base).success, true);
  assert.equal(postAttendanceSchema.safeParse({ ...base, rateType: "daily", dayFraction: "0.5" }).success, true);
  assert.equal(postAttendanceSchema.safeParse({ ...base, rateType: "daily", dayFraction: "" }).success, false);
  assert.equal(postAttendanceSchema.safeParse({ ...base, hours: "25" }).success, false);
  assert.equal(postAttendanceSchema.safeParse({ ...base, status: "absent", hours: "0", rateType: "none" }).success, true);
});
const input = { idempotencyKey: "10000000-0000-0000-0000-000000000001", projectId: "20000000-0000-0000-0000-000000000001", assignmentId: "30000000-0000-0000-0000-000000000001", workDate: "2026-09-27", status: "present", hours: "8", rateType: "daily", dayFraction: "1", note: "Site work completed" };
test("daily attendance accepts only full or half days for new entries", () => {
  for (const dayFraction of ["1", "0.5"]) assert.ok(postAttendanceSchema.safeParse({ ...input, dayFraction }).success);
  for (const dayFraction of ["0", "0.25", "1.5", "-1", "NaN"]) assert.equal(postAttendanceSchema.safeParse({ ...input, dayFraction }).success, false);
});
test("hourly and absent attendance do not accept paid-day fractions", () => {
  assert.ok(postAttendanceSchema.safeParse({ ...input, rateType: "hourly", dayFraction: "" }).success);
  assert.equal(postAttendanceSchema.safeParse({ ...input, rateType: "hourly" }).success, false);
  assert.ok(postAttendanceSchema.safeParse({ ...input, status: "absent", hours: "0", rateType: "none", dayFraction: "" }).success);
  assert.equal(postAttendanceSchema.safeParse({ ...input, hours: "25" }).success, false);
});
