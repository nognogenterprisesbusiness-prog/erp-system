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

export const cancelPurchaseOrderSchema = z.object({ orderId: uuidSchema, reason: z.string().trim().min(3).max(500) });
