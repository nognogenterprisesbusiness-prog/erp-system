import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "./common";

export const quantitySchema = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a positive quantity with up to four decimal places").refine((value) => Number(value) > 0, "Quantity must be greater than zero");
export const moneyInputSchema = z.string().trim().regex(/^\d{1,22}(\.\d{1,2})?$/, "Enter a positive amount with up to two decimal places").refine((value) => Number(value) > 0, "Amount must be greater than zero");
export const materialKinds = ["consumable", "reusable"] as const;
export const materialKindSchema = z.enum(materialKinds);

export const materialInputSchema = z.object({
  id: uuidSchema.optional(),
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and hyphens only"),
  name: z.string().trim().min(2).max(160),
  description: optionalTextSchema,
  baseUnitId: uuidSchema,
  materialKind: materialKindSchema,
  minimumStockLevel: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a non-negative quantity with up to four decimal places"),
  isActive: z.enum(["true", "false"]),
});

const movementFields = {
  idempotencyKey: uuidSchema,
  materialId: uuidSchema,
  quantity: quantitySchema,
  unitId: uuidSchema,
  referenceNumber: z.string().trim().min(2).max(120),
  transactionDate: z.iso.date(),
  remarks: optionalTextSchema,
};

export const stockInInputSchema = z.object({ ...movementFields, destinationLocationId: uuidSchema, totalCost: moneyInputSchema, remarks: z.string().trim().min(3).max(2000) });
export const openingValueInputSchema = z.object({ idempotencyKey: uuidSchema, materialId: uuidSchema, locationId: uuidSchema, quantity: quantitySchema, totalValue: moneyInputSchema, reason: z.string().trim().min(3).max(500) });
export const legacyTransitValueInputSchema = z.object({
  idempotencyKey: uuidSchema, transferItemId: uuidSchema,
  dispatchedTotalCost: moneyInputSchema,
  receivedTotalCost: z.string().trim().regex(/^\d{1,22}(\.\d{1,2})?$/, "Enter a non-negative amount with up to two decimals"),
  supportingReference: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(3).max(500),
}).refine((value) => Number(value.receivedTotalCost) < Number(value.dispatchedTotalCost),
  { path: ["receivedTotalCost"], message: "Historical received value must be below dispatched value while stock remains in transit" });
export const siteConsumptionInputSchema = z.object({ ...movementFields, siteLocationId: uuidSchema, projectId: uuidSchema });
export const stockOutInputSchema = z.object({ ...movementFields, sourceLocationId: uuidSchema, remarks: z.string().trim().min(3).max(2000) });
export const transferInputSchema = z.object({ ...movementFields, sourceLocationId: uuidSchema, destinationLocationId: uuidSchema }).refine((value) => value.sourceLocationId !== value.destinationLocationId, { path: ["destinationLocationId"], message: "Destination must differ from source" });
export const transferReceiptInputSchema = z.object({ idempotencyKey: uuidSchema, transferItemId: uuidSchema, quantity: quantitySchema, transactionDate: z.iso.date(), remarks: optionalTextSchema });
export const reversalInputSchema = z.object({ idempotencyKey: uuidSchema, transactionId: uuidSchema, reason: z.string().trim().min(3).max(500) });
export const transferVarianceInputSchema = z.object({ idempotencyKey: uuidSchema, transferItemId: uuidSchema, quantity: quantitySchema, reason: z.string().trim().min(3).max(500), returnPath: z.string().regex(/^\/(requests\/[0-9a-f-]{36}|inventory\/transfers)$/) });

export type MaterialInput = z.infer<typeof materialInputSchema>;
export type StockInInput = z.infer<typeof stockInInputSchema>;
export type StockOutInput = z.infer<typeof stockOutInputSchema>;
export type TransferInput = z.infer<typeof transferInputSchema>;
