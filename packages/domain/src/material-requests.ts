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

export const cancelMaterialRequestSchema = z.object({
  idempotencyKey: uuidSchema,
  requestId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});

const fulfillmentFields = {
  idempotencyKey: uuidSchema,
  quantity: quantitySchema,
  transactionDate: z.iso.date(),
  remarks: z.string().trim().max(500),
};

export const dispatchRequestLineSchema = z.object({ ...fulfillmentFields, requestLineId: uuidSchema });
export const receiveRequestTransferSchema = z.object({ ...fulfillmentFields, transferItemId: uuidSchema, requestId: uuidSchema });
export const dispatchRequestWithManifestSchema = dispatchRequestLineSchema.extend({
  vehicleAssetId: z.union([uuidSchema, z.literal("")]),
  vehicleLabel: z.string().trim().max(120),
  driverName: z.string().trim().min(2).max(120),
  deliveryReference: z.string().trim().min(2).max(120),
}).refine((input) => input.vehicleAssetId !== "" || input.vehicleLabel.length >= 2,
  { path: ["vehicleLabel"], message: "Enter a vehicle or transport description." });
export const receiveRequestWithInspectionSchema = receiveRequestTransferSchema.extend({
  condition: z.enum(["accepted", "accepted_with_note"]),
  qualityNote: z.string().trim().max(500),
}).refine((input) => input.condition === "accepted_with_note" ? input.qualityNote.length >= 3 : input.qualityNote.length === 0,
  { path: ["qualityNote"], message: "Add a note for this acceptance." });

export type SubmitMaterialRequest = z.infer<typeof submitMaterialRequestSchema>;
export type DecideMaterialRequest = z.infer<typeof decideMaterialRequestSchema>;
export type CancelMaterialRequest = z.infer<typeof cancelMaterialRequestSchema>;
