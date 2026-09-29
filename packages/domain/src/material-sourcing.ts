import { z } from "zod";
import { uuidSchema } from "./common";

export const materialSourcingSchema = z.object({
  key: uuidSchema,
  projectId: uuidSchema,
  siteId: uuidSchema,
  warehouseId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  unit: z.string().trim().min(1).max(40),
  quantity: z.string().trim().regex(/^\d+(?:\.\d{1,4})?$/).refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000),
  neededOn: z.iso.date(),
  reason: z.string().trim().min(3).max(500),
});
