import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyTransitValueInputSchema, openingValueInputSchema, siteConsumptionInputSchema, stockInInputSchema, stockOutInputSchema, transferVarianceInputSchema } from "./inventory";

const key = "51234567-89ab-4cde-8123-456789abcdef";
const materialId = "31234567-89ab-4cde-8123-456789abcdef";
const locationId = "11234567-89ab-4cde-8123-456789abcdef";
const projectId = "01234567-89ab-4cde-8123-456789abcdef";
const unitId = "21234567-89ab-4cde-8123-456789abcdef";
const movement = {
  idempotencyKey: key, materialId, quantity: "2.5", unitId,
  referenceNumber: "DR-001", transactionDate: "2026-09-25", remarks: "",
};

test("new stock-in requires an explicit cent-precise total cost", () => {
  const stockIn = { ...movement, destinationLocationId: locationId, totalCost: "250.00", remarks: "Approved non-PO receipt" };
  assert.equal(stockInInputSchema.safeParse(stockIn).success, true);
  assert.equal(stockInInputSchema.safeParse({ ...stockIn, totalCost: "" }).success, false);
  assert.equal(stockInInputSchema.safeParse({ ...stockIn, totalCost: "250.001" }).success, false);
  assert.equal(stockInInputSchema.safeParse({ ...stockIn, totalCost: "0" }).success, false);
  assert.equal(stockInInputSchema.safeParse({ ...stockIn, totalCost: "-1" }).success, false);
  assert.equal(stockInInputSchema.safeParse({ ...stockIn, remarks: "" }).success, false);
});

test("legacy transit values require evidence and cannot exceed dispatched value", () => {
  const input = { idempotencyKey: key, transferItemId: locationId, dispatchedTotalCost: "1000.00", receivedTotalCost: "200.00", supportingReference: "Signed DR-001", reason: "Opening reconciliation" };
  assert.equal(legacyTransitValueInputSchema.safeParse(input).success, true);
  assert.equal(legacyTransitValueInputSchema.safeParse({ ...input, receivedTotalCost: "1000.00" }).success, false);
  assert.equal(legacyTransitValueInputSchema.safeParse({ ...input, supportingReference: "" }).success, false);
});

test("opening reconciliation requires a positive posted quantity, value and reason", () => {
  const input = { idempotencyKey: key, materialId, locationId, quantity: "100", totalValue: "10000.00", reason: "Signed count sheet" };
  assert.equal(openingValueInputSchema.safeParse(input).success, true);
  assert.equal(openingValueInputSchema.safeParse({ ...input, quantity: "0" }).success, false);
  assert.equal(openingValueInputSchema.safeParse({ ...input, reason: "" }).success, false);
});

test("site use and variance commands require scoped IDs and positive quantities", () => {
  assert.equal(siteConsumptionInputSchema.safeParse({ ...movement, siteLocationId: locationId, projectId }).success, true);
  assert.equal(siteConsumptionInputSchema.safeParse({ ...movement, siteLocationId: locationId, projectId, quantity: "0" }).success, false);
  const variance = { idempotencyKey: key, transferItemId: locationId, quantity: "1.5", reason: "Damaged in transit", returnPath: "/inventory/transfers" };
  assert.equal(transferVarianceInputSchema.safeParse(variance).success, true);
  assert.equal(transferVarianceInputSchema.safeParse({ ...variance, returnPath: "//example.com" }).success, false);
});

test("direct warehouse write-off does not carry a misleading project cost tag", () => {
  const parsed = stockOutInputSchema.parse({ ...movement, sourceLocationId: locationId, projectId, remarks: "Damaged at warehouse" });
  assert.equal("projectId" in parsed, false);
});
