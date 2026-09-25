import assert from "node:assert/strict";
import test from "node:test";
import { projectMaterialPlanInputSchema, projectProgressInputSchema, stockCountDecisionSchema, stockCountInputSchema } from "./project-operations";

const id = "a0b4e120-55cf-44d2-a89d-8b56201cc374";

test("material plans need scoped IDs, a positive quantity and date", () => {
  const valid = { projectId: id, siteId: id, warehouseId: id, materialId: id, quantity: "12.5000", requiredOn: "2026-10-01", note: "Cement for columns" };
  assert.equal(projectMaterialPlanInputSchema.safeParse(valid).success, true);
  assert.equal(projectMaterialPlanInputSchema.safeParse({ ...valid, quantity: "0" }).success, false);
  assert.equal(projectMaterialPlanInputSchema.safeParse({ ...valid, warehouseId: "another-project" }).success, false);
});

test("progress is tied to a report and bounded by 100 percent", () => {
  assert.equal(projectProgressInputSchema.safeParse({ reportId: id, percent: "75.25", summary: "Foundation complete" }).success, true);
  assert.equal(projectProgressInputSchema.safeParse({ reportId: id, percent: "100.01", summary: "Foundation complete" }).success, false);
});

test("physical counts allow zero but reject negative values and unexplained rejection", () => {
  const count = { idempotencyKey: id, materialId: id, locationId: id, countedQuantity: "0", reasonType: "missing", reason: "Physical count found none" };
  assert.equal(stockCountInputSchema.safeParse(count).success, true);
  assert.equal(stockCountInputSchema.safeParse({ ...count, countedQuantity: "-1" }).success, false);
  assert.equal(stockCountInputSchema.safeParse({ ...count, reasonType: "other" }).success, false);
  assert.equal(stockCountDecisionSchema.safeParse({ countId: id, decision: "reject", note: "" }).success, false);
  assert.equal(stockCountDecisionSchema.safeParse({ countId: id, decision: "approve", note: "" }).success, true);
});
