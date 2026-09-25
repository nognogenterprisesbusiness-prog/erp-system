import { z } from "zod";
import { quantitySchema } from "./inventory";
import { uuidSchema } from "./common";

export const projectMaterialPlanInputSchema = z.object({
  projectId: uuidSchema, siteId: uuidSchema, warehouseId: uuidSchema, materialId: uuidSchema,
  quantity: quantitySchema, requiredOn: z.iso.date(), note: z.string().trim().max(500),
});

export const projectProgressInputSchema = z.object({
  reportId: uuidSchema,
  percent: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage with up to two decimals")
    .refine((value) => Number(value) <= 100, "Progress cannot exceed 100%"),
  summary: z.string().trim().min(3).max(500),
});

export const stockCountInputSchema = z.object({
  idempotencyKey: uuidSchema, materialId: uuidSchema, locationId: uuidSchema,
  countedQuantity: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a non-negative quantity with up to four decimals"),
  reasonType: z.enum(["physical_count", "damaged", "missing"]),
  reason: z.string().trim().min(3).max(500),
});

export const stockCountDecisionSchema = z.object({
  countId: uuidSchema, decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500),
}).refine((value) => value.decision === "approve" || value.note.length >= 3,
  { path: ["note"], message: "Explain why this count is being rejected" });
