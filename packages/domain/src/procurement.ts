import { z } from "zod";
import { uuidSchema } from "./common";
import { moneyInputSchema, quantitySchema } from "./inventory";

export const purchaseOrderLineSchema = z.object({ supplierMaterialId: uuidSchema, quantity: quantitySchema });
export const issuePurchaseOrderSchema = z.object({
  idempotencyKey: uuidSchema,
  supplierId: uuidSchema,
  warehouseId: uuidSchema,
  orderedOn: z.iso.date(),
  expectedOn: z.iso.date(),
  purpose: z.string().trim().min(3).max(500),
  lines: z.array(purchaseOrderLineSchema).min(1).max(20),
}).refine((value) => value.expectedOn >= value.orderedOn, { path: ["expectedOn"], message: "Expected date must not precede order date" })
  .refine((value) => new Set(value.lines.map((line) => line.supplierMaterialId)).size === value.lines.length,
    { path: ["lines"], message: "Choose each supplier material once" });

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

export const cancelPurchaseOrderSchema = z.object({ orderId: uuidSchema, reason: z.string().trim().min(3).max(500) });
