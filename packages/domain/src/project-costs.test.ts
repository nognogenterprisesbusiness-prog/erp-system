import assert from "node:assert/strict";
import { test } from "node:test";
import { additionalExpenseSchema, budgetChangeSchema, equipmentUsageSchema } from "./project-costs";

const id = "01234567-89ab-4cde-8123-456789abcdef";
test("equipment use and expenses require valid scoped amounts", () => {
  const use = { idempotencyKey: id, projectId: id, assetId: id, useDate: "2026-09-24", hours: "8.5", workNote: "Excavation" };
  assert.equal(equipmentUsageSchema.safeParse(use).success, true);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  assert.equal(equipmentUsageSchema.safeParse({ ...use, useDate: tomorrow }).success, false);
  assert.equal(equipmentUsageSchema.safeParse({ ...use, hours: "24.5" }).success, false);
  const expense = { idempotencyKey: id, projectId: id, expenseDate: "2026-09-24", category: "permit", description: "City permit", externalReference: "PERMIT-123", amount: "1500.00" };
  assert.equal(additionalExpenseSchema.safeParse(expense).success, true);
  assert.equal(additionalExpenseSchema.safeParse({ ...expense, category: "material" }).success, false);
});
test("budget changes accept signed amounts but not zero", () => {
  const change = { idempotencyKey: id, projectId: id, changeAmount: "-1000.00", reason: "Approved reduction" };
  assert.equal(budgetChangeSchema.safeParse(change).success, true);
  assert.equal(budgetChangeSchema.safeParse({ ...change, changeAmount: "0" }).success, false);
});
