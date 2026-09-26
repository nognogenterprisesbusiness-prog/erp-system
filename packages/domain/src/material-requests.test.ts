import assert from "node:assert/strict";
import { test } from "node:test";
import { cancelMaterialRequestSchema, decideMaterialRequestSchema, dispatchRequestLineSchema, receiveRequestTransferSchema, submitMaterialRequestSchema } from "./material-requests";

const projectId = "01234567-89ab-4cde-8123-456789abcdef";
const siteId = "11234567-89ab-4cde-8123-456789abcdef";
const warehouseId = "21234567-89ab-4cde-8123-456789abcdef";
const materialId = "31234567-89ab-4cde-8123-456789abcdef";
const requestId = "41234567-89ab-4cde-8123-456789abcdef";
const key = "51234567-89ab-4cde-8123-456789abcdef";

const request = {
  idempotencyKey: key, projectId, siteId, warehouseId, requiredDate: "2026-09-25",
  purpose: "Cement for footings", lines: [{ materialId, quantity: "50.0000" }],
};

test("material requests accept a valid project/site/warehouse and decimal quantities", () => {
  assert.equal(submitMaterialRequestSchema.safeParse(request).success, true);
});

test("material requests reject duplicate SKUs and invalid quantities", () => {
  assert.equal(submitMaterialRequestSchema.safeParse({ ...request, lines: [request.lines[0], request.lines[0]] }).success, false);
  assert.equal(submitMaterialRequestSchema.safeParse({ ...request, lines: [{ materialId, quantity: "0" }] }).success, false);
  assert.equal(submitMaterialRequestSchema.safeParse({ ...request, lines: [{ materialId, quantity: "1.00001" }] }).success, false);
});

test("engineer decisions accept zero and partial quantities but reject malformed values", () => {
  assert.equal(decideMaterialRequestSchema.safeParse({ idempotencyKey: key, requestId, decisions: { [materialId]: "0" }, reason: "Not available" }).success, true);
  assert.equal(decideMaterialRequestSchema.safeParse({ idempotencyKey: key, requestId, decisions: { [materialId]: "25.5" }, reason: "Partial stock" }).success, true);
  assert.equal(decideMaterialRequestSchema.safeParse({ idempotencyKey: key, requestId, decisions: { [materialId]: "-1" }, reason: "Invalid" }).success, false);
});

test("dispatch and receipt require a scoped identifier, positive quantity and date", () => {
  const movement = { idempotencyKey: key, quantity: "2.5", transactionDate: "2026-09-25", remarks: "" };
  assert.equal(dispatchRequestLineSchema.safeParse({ ...movement, requestLineId: materialId }).success, true);
  assert.equal(receiveRequestTransferSchema.safeParse({ ...movement, transferItemId: siteId, requestId }).success, true);
  assert.equal(dispatchRequestLineSchema.safeParse({ ...movement, requestLineId: materialId, quantity: "0" }).success, false);
  assert.equal(receiveRequestTransferSchema.safeParse({ ...movement, transferItemId: siteId, requestId: "../users" }).success, false);
});

test("cancellation requires a valid request, retry key, and explanation", () => {
  assert.equal(cancelMaterialRequestSchema.safeParse({ idempotencyKey: key, requestId, reason: "Project no longer needs this stock" }).success, true);
  assert.equal(cancelMaterialRequestSchema.safeParse({ idempotencyKey: key, requestId, reason: "No" }).success, false);
  assert.equal(cancelMaterialRequestSchema.safeParse({ idempotencyKey: key, requestId: "another-project", reason: "Project no longer needs this stock" }).success, false);
});
