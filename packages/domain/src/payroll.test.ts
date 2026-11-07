import assert from "node:assert/strict";
import { test } from "node:test";

import { payrollLineInputSchema, payrollRunInputSchema, payrollTotals } from "./payroll";

const run = { idempotencyKey: "a1b2c3d4-0000-4000-8000-000000000001", departmentId: "", periodStart: "2026-11-01", periodEnd: "2026-11-15", payDate: "2026-11-16", notes: "" };

test("payroll period must be ordered, at most 62 days, and paid on or after it starts", () => {
  assert.equal(payrollRunInputSchema.safeParse(run).success, true);
  assert.equal(payrollRunInputSchema.safeParse({ ...run, periodEnd: "2026-10-31" }).success, false);
  assert.equal(payrollRunInputSchema.safeParse({ ...run, periodEnd: "2027-01-03" }).success, false);
  assert.equal(payrollRunInputSchema.safeParse({ ...run, payDate: "2026-10-30" }).success, false);
  assert.equal(payrollRunInputSchema.safeParse({ ...run, departmentId: "not-a-uuid" }).success, false);
});

test("payroll line amounts are non-negative pesos with up to two decimals", () => {
  const line = { lineId: "a1b2c3d4-0000-4000-8000-000000000002", otherEarnings: "1500.50", deductions: "250", notes: "SSS" };
  assert.equal(payrollLineInputSchema.safeParse(line).success, true);
  for (const bad of ["-1", "1.234", "abc", "10000000"]) assert.equal(payrollLineInputSchema.safeParse({ ...line, deductions: bad }).success, false, bad);
  assert.equal(payrollLineInputSchema.parse({ lineId: line.lineId }).otherEarnings, "0");
});

test("payroll totals add in centavos", () => {
  assert.deepEqual(payrollTotals([
    { attendance_pay: "2250.00", other_earnings: "500", deductions: "250.50" },
    { attendance_pay: 0.1, other_earnings: 0.2, deductions: 0 },
  ]), { gross: 2750.3, deductions: 250.5, net: 2499.8 });
  assert.deepEqual(payrollTotals([]), { gross: 0, deductions: 0, net: 0 });
});
