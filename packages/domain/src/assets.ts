import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "./common";

export const assetKinds = ["equipment", "vehicle"] as const;
export const assetOwnershipTypes = ["company_owned", "rented", "leased"] as const;
export const assetStatuses = ["available", "assigned", "in_use", "under_maintenance", "out_of_service", "retired"] as const;
export const registryAssetStatuses = ["available", "under_maintenance", "out_of_service"] as const;
export const standaloneAssetLocationKinds = ["maintenance_facility", "other"] as const;

export const assetCategoryInputSchema = z.object({
  id: uuidSchema.optional(),
  assetKind: z.enum(assetKinds),
  name: z.string().trim().min(2).max(120),
  description: optionalTextSchema,
});

export const assetLocationInputSchema = z.object({
  id: uuidSchema.optional(),
  locationKind: z.enum(standaloneAssetLocationKinds),
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(3).max(300),
});

const decimalMoneySchema = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a non-negative amount with up to two decimal places");
const commonAssetFields = {
  id: uuidSchema.optional(),
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and hyphens only"),
  name: z.string().trim().min(2).max(160),
  description: optionalTextSchema,
  categoryId: uuidSchema,
  brand: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(120),
  acquisitionDate: z.iso.date(),
  ownershipType: z.enum(assetOwnershipTypes),
  status: z.enum(registryAssetStatuses),
  currentLocationId: uuidSchema,
  conditionNotes: optionalTextSchema,
};

export const equipmentInputSchema = z.object({
  ...commonAssetFields,
  sku: z.union([z.literal(""), z.string().trim().min(2).max(80).regex(/^[A-Z0-9./-]+$/, "Use uppercase letters, numbers, dots, slashes, and hyphens only")]),
  equipmentType: z.string().trim().min(2).max(120),
  serialNumber: z.string().trim().min(2).max(80).regex(/^[A-Z0-9./-]+$/, "Use uppercase letters, numbers, dots, slashes, and hyphens only"),
  acquisitionCost: decimalMoneySchema,
});

export const vehicleInputSchema = z.object({
  ...commonAssetFields,
  plateNumber: z.string().trim().min(2).max(20).regex(/^[A-Z0-9 -]+$/, "Enter a valid uppercase plate number"),
  manufactureYear: z.coerce.number().int().min(1886).max(new Date().getFullYear() + 1),
  currentMileage: decimalMoneySchema,
});

export const equipmentRequestInputSchema = z.object({
  assetId: uuidSchema,
  projectId: uuidSchema,
  siteId: uuidSchema,
  neededOn: z.iso.date(),
  expectedReturnOn: z.iso.date(),
  purpose: z.string().trim().min(3).max(500),
}).refine((input) => input.expectedReturnOn >= input.neededOn, { path: ["expectedReturnOn"], message: "Return date must be on or after the needed date" });

export const equipmentRequestDecisionSchema = z.object({
  id: uuidSchema,
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500),
}).refine((input) => input.decision !== "reject" || input.note.length >= 3, { path: ["note"], message: "A rejection reason is required" });

export const equipmentReturnInputSchema = z.object({
  id: uuidSchema,
  needsMaintenance: z.boolean(),
  note: z.string().trim().min(3).max(500),
});

export type AssetCategoryInput = z.infer<typeof assetCategoryInputSchema>;
export type AssetLocationInput = z.infer<typeof assetLocationInputSchema>;
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export type VehicleInput = z.infer<typeof vehicleInputSchema>;
