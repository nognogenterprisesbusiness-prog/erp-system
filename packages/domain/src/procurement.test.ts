import assert from "node:assert/strict";
import { test } from "node:test";
import { issuePurchaseOrderSchema, receivePurchaseOrderLineSchema, recordSupplierPaymentSchema, submitSitePurchaseSchema, siteReceiptExpenseSchema, mobileSitePurchaseSchema } from "./procurement";

const id = "01234567-89ab-4cde-8123-456789abcdef";
const other = "11234567-89ab-4cde-8123-456789abcdef";

test("orders take item, quantity and typed price; purpose and expected date are optional", () => {
  const value = { idempotencyKey: id, supplierId: id, warehouseId: id, orderedOn: "2026-09-24", expectedOn: "", purpose: "", lines: [{ materialId: id, quantity: "1000", unitPrice: "100" }] };
  assert.equal(issuePurchaseOrderSchema.safeParse(value).success, true);
  assert.equal(issuePurchaseOrderSchema.safeParse({ ...value, lines: [value.lines[0], value.lines[0]] }).success, false);
  assert.equal(issuePurchaseOrderSchema.safeParse({ ...value, expectedOn: "2026-09-20" }).success, false);
  assert.equal(issuePurchaseOrderSchema.safeParse({ ...value, lines: [{ ...value.lines[0], unitPrice: "0" }] }).success, false);
  assert.equal(issuePurchaseOrderSchema.safeParse({ ...value, lines: [{ ...value.lines[0], unitPrice: "100.555" }] }).success, false);
});

test("supplier payments: cash needs no bank; a check needs bank and check number", () => {
  const cash = { idempotencyKey: id, orderId: other, method: "cash", bankName: "", checkNumber: "", amount: "725000.00", paymentDate: "2026-12-15", remarks: "" };
  assert.equal(recordSupplierPaymentSchema.safeParse(cash).success, true);
  assert.equal(recordSupplierPaymentSchema.safeParse({ ...cash, method: "check" }).success, false);
  assert.equal(recordSupplierPaymentSchema.safeParse({ ...cash, method: "check", bankName: "Metrobank", checkNumber: "123456" }).success, true);
  assert.equal(recordSupplierPaymentSchema.safeParse({ ...cash, amount: "0" }).success, false);
});

test("receipt requires actual goods cost, quantity and delivery reference", () => {
  const value = { idempotencyKey: id, orderId: id, lineId: other, quantity: "5.5", goodsTotalCost: "500.00", deliveryReference: "DR-101", receivedOn: "2026-09-26", costVarianceReason: "" };
  assert.equal(receivePurchaseOrderLineSchema.safeParse(value).success, true);
  assert.equal(receivePurchaseOrderLineSchema.safeParse({ ...value, goodsTotalCost: "0" }).success, false);
  assert.equal(receivePurchaseOrderLineSchema.safeParse({ ...value, deliveryReference: "" }).success, false);
});

test("site purchase: existing store, or a new store with name, address and contact number", () => {
  const value = { idempotencyKey: id, projectId: id, siteId: other, supplierId: id, newSupplierName: "", newSupplierAddress: "", newSupplierContact: "", receiptNumber: "OR-1001", receiptDate: "2026-10-05", paidWith: "own_money", notes: "", lines: [{ materialId: id, quantity: "10", unitPrice: "260" }] };
  assert.equal(submitSitePurchaseSchema.safeParse(value).success, true);
  assert.equal(submitSitePurchaseSchema.safeParse({ ...value, supplierId: "" }).success, false);
  assert.equal(submitSitePurchaseSchema.safeParse({ ...value, supplierId: "", newSupplierName: "Ace Hardware", newSupplierAddress: "Mandaue City", newSupplierContact: "09170001111" }).success, true);
  assert.equal(submitSitePurchaseSchema.safeParse({ ...value, receiptNumber: "" }).success, false);
  assert.equal(submitSitePurchaseSchema.safeParse({ ...value, lines: [value.lines[0], value.lines[0]] }).success, false);
});

test("receipt-only expenses require scoped identity and positive cent-precise amounts without inventory lines", () => {
  const receipt = { idempotencyKey: id, projectId: id, siteId: other, amount: "1500.00", paidWith: "own_money", notes: "Receipt supplies" };
  assert.equal(siteReceiptExpenseSchema.safeParse(receipt).success, true);
  for (const amount of ["0", "-1", "1500.001", "NaN"]) assert.equal(siteReceiptExpenseSchema.safeParse({ ...receipt, amount }).success, false);
  assert.equal(siteReceiptExpenseSchema.safeParse({ ...receipt, siteId: "" }).success, false);
  assert.equal(siteReceiptExpenseSchema.safeParse({ ...receipt, paidWith: "supplier_credit" }).success, false);
});


test("mobile itemized purchases require actual store and unique positive material lines", () => {
 const value = { idempotencyKey: id, projectId: id, siteId: other, supplierId: id, lines: [{ materialId: id, quantity: "10", unitPrice: "250.00" }] };
 assert.equal(mobileSitePurchaseSchema.safeParse(value).success, true);
 for (const invalid of [{ ...value, supplierId: "" }, { ...value, siteId: "" }, { ...value, lines: [] }, { ...value, lines: [value.lines[0], value.lines[0]] }]) assert.equal(mobileSitePurchaseSchema.safeParse(invalid).success, false);
 for (const patch of [{ quantity: "0" }, { quantity: "1.00001" }, { unitPrice: "0" }, { unitPrice: "1.001" }]) assert.equal(mobileSitePurchaseSchema.safeParse({ ...value, lines: [{ ...value.lines[0], ...patch }] }).success, false);
});
