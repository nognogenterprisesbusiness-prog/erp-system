import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "./common";

export const supplierStatuses = ["active", "inactive"] as const;
export const materialAvailabilityStatuses = ["available", "limited", "unavailable", "discontinued"] as const;

const phoneSchema = z.string().trim().min(7, "Enter a contact number").max(40).regex(/^[0-9+() .-]+$/, "Enter a valid contact number");
const positiveDecimalSchema = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a positive quantity with up to four decimal places").refine((value) => Number(value) > 0, "Quantity must be greater than zero");
const priceSchema = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a positive price with up to two decimal places").refine((value) => Number(value) > 0, "Price must be greater than zero");

export const supplierCategoryInputSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(120),
  description: optionalTextSchema,
});

export const supplierInputSchema = z.object({
  id: uuidSchema.optional(),
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and hyphens only"),
  supplierName: z.string().trim().min(2).max(160),
  businessName: z.string().trim().min(2).max(200),
  categoryId: uuidSchema,
  contactPerson: z.string().trim().min(2).max(160),
  contactNumber: phoneSchema,
  emailAddress: z.email("Enter a valid email address").max(254),
  businessAddress: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(120),
  province: z.string().trim().min(2).max(120),
  taxIdentificationNumber: z.string().trim().max(40).regex(/^[A-Za-z0-9 .-]*$/, "Enter a valid tax identification number"),
  paymentTerms: z.string().trim().min(2).max(160),
  status: z.enum(supplierStatuses),
  remarks: optionalTextSchema,
});

export const supplierMaterialInputSchema = z.object({
  id: uuidSchema.optional(),
  supplierId: uuidSchema,
  materialId: uuidSchema,
  unitId: uuidSchema,
  supplierMaterialCode: z.string().trim().min(1).max(80).regex(/^[A-Z0-9./-]+$/, "Use uppercase letters, numbers, dots, slashes, and hyphens only"),
  minimumOrderQuantity: positiveDecimalSchema,
  leadTimeDays: z.union([z.literal(""), z.coerce.number().int().min(0).max(3650)]),
  availabilityStatus: z.enum(materialAvailabilityStatuses),
});

export const supplierPriceInputSchema = z.object({
  supplierMaterialId: uuidSchema,
  unitPrice: priceSchema,
  effectiveStartDate: z.iso.date(),
  effectiveEndDate: z.union([z.iso.date(), z.literal("")]),
  currency: z.string().trim().length(3).regex(/^[A-Z]{3}$/, "Use a three-letter currency code"),
}).refine((value) => !value.effectiveEndDate || value.effectiveEndDate >= value.effectiveStartDate, {
  path: ["effectiveEndDate"],
  message: "End date cannot be before the start date",
});

export const closeSupplierPriceInputSchema = z.object({ priceId: uuidSchema, effectiveEndDate: z.iso.date() });

export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type SupplierCategoryInput = z.infer<typeof supplierCategoryInputSchema>;
export type SupplierMaterialInput = z.infer<typeof supplierMaterialInputSchema>;
export type SupplierPriceInput = z.infer<typeof supplierPriceInputSchema>;
