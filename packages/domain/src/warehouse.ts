import { z } from "zod";

import { optionalTextSchema, phoneSchema, uuidSchema } from "./common";

export const warehouseStatuses = ["active", "inactive"] as const;
export const warehouseStatusSchema = z.enum(warehouseStatuses);

export const warehouseInputSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and hyphens only"),
  name: z.string().trim().min(2).max(160),
  description: optionalTextSchema,
  address: z.string().trim().min(3).max(300),
  municipalityCode: z.string().regex(/^\d{10}$/, "Choose a city or municipality from the list"),
  contactPerson: z.string().trim().max(160).optional().or(z.literal("")),
  contactNumber: phoneSchema,
  status: warehouseStatusSchema,
});

export const warehouseUpdateSchema = warehouseInputSchema.and(z.object({ id: uuidSchema }));

export const warehouseAssignmentInputSchema = z.object({
  warehouseId: uuidSchema,
  userId: uuidSchema,
  assignedOn: z.iso.date(),
});

export type WarehouseInput = z.infer<typeof warehouseInputSchema>;
export type WarehouseUpdate = z.infer<typeof warehouseUpdateSchema>;
export type WarehouseAssignmentInput = z.infer<typeof warehouseAssignmentInputSchema>;
