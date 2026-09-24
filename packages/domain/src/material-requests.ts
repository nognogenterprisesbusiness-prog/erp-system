import { z } from "zod";
import { uuidSchema } from "./common";
import { quantitySchema } from "./inventory";

export const materialRequestLineSchema = z.object({
  materialId: uuidSchema,
  quantity: quantitySchema,
});

export const submitMaterialRequestSchema = z.object({
  idempotencyKey: uuidSchema,
  projectId: uuidSchema,
  siteId: uuidSchema,
  warehouseId: uuidSchema,
  requiredDate: z.iso.date(),
  purpose: z.string().trim().min(3).max(500),
  lines: z.array(materialRequestLineSchema).min(1).max(20),
}).refine((value) => new Set(value.lines.map((line) => line.materialId)).size === value.lines.length,
  { path: ["lines"], message: "Each material may appear only once." });

export const decideMaterialRequestSchema = z.object({
  idempotencyKey: uuidSchema,
  requestId: uuidSchema,
  decisions: z.record(uuidSchema, z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a non-negative quantity with up to four decimal places")),
  reason: z.string().trim().max(500),
});

const fulfillmentFields = {
  idempotencyKey: uuidSchema,
  quantity: quantitySchema,
  transactionDate: z.iso.date(),
  remarks: z.string().trim().max(500),
};

export const dispatchRequestLineSchema = z.object({ ...fulfillmentFields, requestLineId: uuidSchema });
export const receiveRequestTransferSchema = z.object({ ...fulfillmentFields, transferItemId: uuidSchema, requestId: uuidSchema });

export type SubmitMaterialRequest = z.infer<typeof submitMaterialRequestSchema>;
export type DecideMaterialRequest = z.infer<typeof decideMaterialRequestSchema>;
