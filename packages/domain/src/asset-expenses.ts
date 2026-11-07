import { z } from "zod";
import { uuidSchema } from "./common";

export const assetExpenseLabels = {
  fuel: "Fuel",
  oil_change: "Oil change",
  maintenance: "Maintenance",
  repair: "Repair",
  other: "Other",
} as const;
export const assetExpenseCategory = z.enum(["fuel", "oil_change", "maintenance", "repair", "other"] satisfies (keyof typeof assetExpenseLabels)[]);

export const assetExpenseInput = z.object({
  assetId: uuidSchema,
  requestId: uuidSchema,
  category: assetExpenseCategory,
  amount: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/).refine((value) => Number(value) > 0),
  expenseDate: z.iso.date(),
  notes: z.string().trim().max(500),
});
export const driverExpenseInput = assetExpenseInput.extend({ assignmentId: uuidSchema });

export const driverTruckSchema = z.object({
  assignment_id: uuidSchema,
  asset_id: uuidSchema,
  code: z.string(),
  name: z.string(),
  plate_number: z.string().nullable(),
});

export const driverDashboardSchema = z.object({
  truck: driverTruckSchema.nullable(),
  expenses: z.array(z.object({
    id: uuidSchema,
    category: assetExpenseCategory,
    amount: z.number(),
    expense_date: z.iso.date(),
    notes: z.string(),
    reversed_at: z.string().nullable(),
    reversal_reason: z.string().nullable(),
    receipt_path: z.string().nullable(),
  })),
  hasMore: z.boolean(),
});

export function philippinesDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
