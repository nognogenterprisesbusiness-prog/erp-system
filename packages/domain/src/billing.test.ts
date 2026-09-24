import assert from "node:assert/strict";
import { test } from "node:test";
import { issueInvoiceSchema, recordPaymentSchema, reversePaymentSchema } from "./billing";

const id = "01234567-89ab-4cde-8123-456789abcdef";

test("invoice input requires a valid project, monetary precision and ordered dates", () => {
  const value = { idempotencyKey: id, projectId: id, description: "Progress billing", issuedOn: "2026-09-24", dueOn: "2026-10-24", amount: "25000.00" };
  assert.equal(issueInvoiceSchema.safeParse(value).success, true);
  assert.equal(issueInvoiceSchema.safeParse({ ...value, dueOn: "2026-09-23" }).success, false);
  assert.equal(issueInvoiceSchema.safeParse({ ...value, amount: "0" }).success, false);
  assert.equal(issueInvoiceSchema.safeParse({ ...value, amount: "25.001" }).success, false);
});

test("payment and reversal inputs require scoped IDs and a reason", () => {
  assert.equal(recordPaymentSchema.safeParse({ idempotencyKey: id, invoiceId: id, amount: "100.00", paidOn: "2026-09-24", reference: "OR-123" }).success, true);
  assert.equal(recordPaymentSchema.safeParse({ idempotencyKey: id, invoiceId: id, amount: "-1", paidOn: "2026-09-24", reference: "OR-123" }).success, false);
  assert.equal(reversePaymentSchema.safeParse({ idempotencyKey: id, invoiceId: id, paymentId: id, reason: "Duplicate entry" }).success, true);
  assert.equal(reversePaymentSchema.safeParse({ idempotencyKey: id, invoiceId: id, paymentId: id, reason: "" }).success, false);
});
