import assert from "node:assert/strict";
import { test } from "node:test";
import { issuePurchaseOrderSchema, receivePurchaseOrderLineSchema } from "./procurement";

const id = "01234567-89ab-4cde-8123-456789abcdef";
const other = "11234567-89ab-4cde-8123-456789abcdef";

test("orders validate unique catalog lines and dates", () => {
  const value = { idempotencyKey: id, supplierId: id, warehouseId: id, orderedOn: "2026-09-24", expectedOn: "2026-09-30", purpose: "Stock replenishment", lines: [{ supplierMaterialId: id, quantity: "20" }] };
  assert.equal(issuePurchaseOrderSchema.safeParse(value).success, true);
  assert.equal(issuePurchaseOrderSchema.safeParse({ ...value, lines: [value.lines[0], value.lines[0]] }).success, false);
  assert.equal(issuePurchaseOrderSchema.safeParse({ ...value, expectedOn: "2026-09-20" }).success, false);
});

test("receipt requires actual goods cost, quantity and delivery reference", () => {
  const value = { idempotencyKey: id, orderId: id, lineId: other, quantity: "5.5", goodsTotalCost: "500.00", deliveryReference: "DR-101", receivedOn: "2026-09-26", costVarianceReason: "" };
  assert.equal(receivePurchaseOrderLineSchema.safeParse(value).success, true);
  assert.equal(receivePurchaseOrderLineSchema.safeParse({ ...value, goodsTotalCost: "0" }).success, false);
  assert.equal(receivePurchaseOrderLineSchema.safeParse({ ...value, deliveryReference: "" }).success, false);
});
