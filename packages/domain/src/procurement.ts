import { z } from "zod";
import { uuidSchema } from "./common";
import { moneyInputSchema, quantitySchema } from "./inventory";

// A purchase line is the item, quantity and the price typed on the order.
export const purchaseOrderLineSchema = z.object({ materialId: uuidSchema, quantity: quantitySchema, unitPrice: moneyInputSchema });
export const issuePurchaseOrderSchema = z.object({
  idempotencyKey: uuidSchema,
  supplierId: uuidSchema,
  warehouseId: uuidSchema,
  orderedOn: z.iso.date(),
  expectedOn: z.union([z.literal(""), z.iso.date()]),
  purpose: z.string().trim().max(500).refine((value) => value === "" || value.length >= 3, "Enter at least 3 characters"),
  lines: z.array(purchaseOrderLineSchema).min(1).max(50),
}).refine((value) => !value.expectedOn || value.expectedOn >= value.orderedOn, { path: ["expectedOn"], message: "Expected date must not precede purchase date" })
  .refine((value) => new Set(value.lines.map((line) => line.materialId)).size === value.lines.length,
    { path: ["lines"], message: "Choose each material once" });

export const decidePurchaseOwnerApprovalSchema = z.object({
  requestId: uuidSchema,
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500),
}).refine((value) => value.decision === "approve" || value.reason.length >= 3,
  { path: ["reason"], message: "Enter a reason for rejection" });

export const recordSupplierQuotationSchema = z.object({
  idempotencyKey: uuidSchema,
  supplierId: uuidSchema,
  reference: z.string().trim().min(2).max(120),
  quotedOn: z.iso.date(),
  validUntil: z.union([z.literal(""), z.iso.date()]),
  notes: z.string().trim().max(500),
  lines: z.array(purchaseOrderLineSchema).min(1).max(50),
}).refine((value) => !value.validUntil || value.validUntil >= value.quotedOn,
  { path: ["validUntil"], message: "Valid until must not precede the quote date" })
  .refine((value) => new Set(value.lines.map((line) => line.materialId)).size === value.lines.length,
    { path: ["lines"], message: "Choose each material once" });

export const inspectPurchaseDeliverySchema = z.object({
  idempotencyKey: uuidSchema, orderId: uuidSchema, lineId: uuidSchema,
  deliveredQuantity: quantitySchema, acceptedQuantity: z.string().regex(/^\d+(?:\.\d{1,4})?$/),
  deliveryReference: z.string().trim().min(2).max(120),
  inspectedOn: z.iso.date(), qualityNote: z.string().trim().max(500),
}).refine((value) => Number(value.acceptedQuantity) <= Number(value.deliveredQuantity),
  { path: ["acceptedQuantity"], message: "Accepted quantity cannot exceed delivered quantity" })
  .refine((value) => Number(value.acceptedQuantity) === Number(value.deliveredQuantity) || value.qualityNote.length >= 3,
    { path: ["qualityNote"], message: "Explain rejected or damaged quantity" });

export const receivePurchaseOrderLineSchema = z.object({
  idempotencyKey: uuidSchema,
  orderId: uuidSchema,
  lineId: uuidSchema,
  quantity: quantitySchema,
  goodsTotalCost: moneyInputSchema,
  deliveryReference: z.string().trim().min(2).max(120),
  receivedOn: z.iso.date(),
  costVarianceReason: z.string().trim().max(500).optional().or(z.literal("")),
});

// Supplier payment for one purchase order: cash, or a check (often postdated)
// with its bank and check number.
export const supplierPaymentMethods = ["cash", "check"] as const;
export const recordSupplierPaymentSchema = z.object({
  idempotencyKey: uuidSchema,
  orderId: uuidSchema,
  method: z.enum(supplierPaymentMethods),
  bankName: z.string().trim().max(80),
  checkNumber: z.string().trim().max(40),
  amount: moneyInputSchema,
  paymentDate: z.iso.date(),
  remarks: z.string().trim().max(500).optional().or(z.literal("")),
}).refine((value) => value.method === "cash" || value.bankName.length >= 2, { path: ["bankName"], message: "Enter the bank" })
  .refine((value) => value.method === "cash" || value.checkNumber.length >= 1, { path: ["checkNumber"], message: "Enter the check number" });

export const voidSupplierPaymentSchema = z.object({ paymentId: uuidSchema, reason: z.string().trim().min(3).max(500) });

// Site purchase: the Engineer buys at a hardware store and records the receipt.
// Pick an existing store, or enter a new store's name, address and contact number.
export const sitePurchasePaidWith = ["company_cash", "own_money"] as const;
export const submitSitePurchaseSchema = z.object({
  idempotencyKey: uuidSchema,
  projectId: uuidSchema,
  siteId: uuidSchema,
  supplierId: z.union([z.literal(""), uuidSchema]),
  newSupplierName: z.string().trim().max(160),
  newSupplierAddress: z.string().trim().max(300),
  newSupplierContact: z.string().trim().max(40),
  receiptNumber: z.string().trim().min(1, "Enter the receipt number").max(80),
  receiptDate: z.iso.date(),
  paidWith: z.enum(sitePurchasePaidWith),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  lines: z.array(purchaseOrderLineSchema).min(1).max(30),
}).refine((value) => Boolean(value.supplierId) || (value.newSupplierName.length >= 2 && value.newSupplierAddress.length >= 3 && /^[0-9+() .-]{7,40}$/.test(value.newSupplierContact)),
  { path: ["supplierId"], message: "Choose a store, or enter the new store's name, address and contact number" })
  .refine((value) => new Set(value.lines.map((line) => line.materialId)).size === value.lines.length,
    { path: ["lines"], message: "Choose each material once" });
export const rejectSitePurchaseSchema = z.object({ purchaseId: uuidSchema, reason: z.string().trim().min(3, "Enter a reason").max(500) });
export const reimburseSitePurchaseSchema = z.object({ purchaseId: uuidSchema, reimbursedOn: z.iso.date(), reference: z.string().trim().min(2, "Enter the reference").max(120) });

export const cancelPurchaseOrderSchema = z.object({ orderId: uuidSchema, reason: z.string().trim().min(3).max(500) });
