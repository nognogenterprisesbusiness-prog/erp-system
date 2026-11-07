import assert from "node:assert/strict";
import { test } from "node:test";

import { assetExpenseInput, driverExpenseInput, philippinesDate } from "./asset-expenses";
import { projectBudgetPosition } from "./project";

const base = {
  assetId: "a1b2c3d4-0000-4000-8000-000000000001",
  requestId: "a1b2c3d4-0000-4000-8000-000000000002",
  category: "fuel",
  amount: "1250.50",
  expenseDate: "2026-11-08",
  notes: "",
};

test("asset expense input accepts PHP amounts with up to two decimals only", () => {
  assert.equal(assetExpenseInput.safeParse(base).success, true);
  for (const amount of ["0", "0.00", "-5", "1.234", "1,000", "abc", "12345678901"])
    assert.equal(assetExpenseInput.safeParse({ ...base, amount }).success, false, amount);
  assert.equal(assetExpenseInput.safeParse({ ...base, category: "tires" }).success, false);
  assert.equal(assetExpenseInput.safeParse({ ...base, notes: "x".repeat(501) }).success, false);
});

test("driver expense input requires the assignment it was opened against", () => {
  assert.equal(driverExpenseInput.safeParse(base).success, false);
  assert.equal(driverExpenseInput.safeParse({ ...base, assignmentId: "a1b2c3d4-0000-4000-8000-000000000003" }).success, true);
});

test("expense date defaults to the Philippine calendar day", () => {
  // 2026-11-08 17:30 UTC is already 2026-11-09 in Manila (UTC+8).
  assert.equal(philippinesDate(new Date("2026-11-08T17:30:00Z")), "2026-11-09");
  assert.equal(philippinesDate(new Date("2026-11-08T15:59:00Z")), "2026-11-08");
});

test("project budget position covers zero, under-budget and over-budget projects", () => {
  assert.deepEqual(projectBudgetPosition(0, 0), { approvedBudget: 0, actualCosts: 0, remaining: 0, overBudget: false, remainingLabel: "Remaining budget" });
  assert.deepEqual(projectBudgetPosition("1000000.00", "250000.10"), { approvedBudget: 1000000, actualCosts: 250000.1, remaining: 749999.9, overBudget: false, remainingLabel: "Remaining budget" });
  assert.deepEqual(projectBudgetPosition(1000, 1000.01), { approvedBudget: 1000, actualCosts: 1000.01, remaining: 0.01, overBudget: true, remainingLabel: "Over budget" });
  assert.equal(projectBudgetPosition(0, 500).remainingLabel, "Over budget");
  // Floating-point inputs that would leave a residue still settle to exact centavos.
  assert.equal(projectBudgetPosition(0.3, 0.1).remaining, 0.2);
});
