import { z } from "zod";
import { uuidSchema } from "./common";
import { moneyInputSchema } from "./inventory";

const hours = z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter up to two decimal places")
  .refine((value) => Number(value) > 0 && Number(value) <= 24, "Hours must be between 0 and 24");

export const equipmentRateSchema = z.object({ assetId: uuidSchema, hourlyRate: moneyInputSchema, effectiveOn: z.iso.date() });
export const equipmentUsageSchema = z.object({
  idempotencyKey: uuidSchema, projectId: uuidSchema, assetId: uuidSchema,
  useDate: z.iso.date().refine((value) => value <= new Date().toISOString().slice(0, 10), "Equipment use date cannot be in the future."),
  hours, workNote: z.string().trim().min(3).max(500),
});
export const additionalExpenseSchema = z.object({
  idempotencyKey: uuidSchema, projectId: uuidSchema, expenseDate: z.iso.date(),
  category: z.enum(["permit", "subcontract", "utilities", "other"]),
  description: z.string().trim().min(3).max(500),
  externalReference: z.string().trim().min(3).max(120), amount: moneyInputSchema,
});
export const budgetChangeSchema = z.object({
  idempotencyKey: uuidSchema, projectId: uuidSchema,
  changeAmount: z.string().trim().regex(/^-?\d{1,22}(\.\d{1,2})?$/, "Enter a signed amount with up to two decimals")
    .refine((value) => Number(value) !== 0, "Change amount cannot be zero"),
  reason: z.string().trim().min(3).max(500),
});
export const reverseProjectCostSchema = z.object({
  idempotencyKey: uuidSchema, projectId: uuidSchema,
  kind: z.enum(["equipment", "expense"]), entryId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});
