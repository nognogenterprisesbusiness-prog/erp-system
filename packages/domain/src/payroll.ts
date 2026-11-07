import { z } from "zod";
import { uuidSchema } from "./common";

const pesos = z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount up to two decimal places").default("0");

export const payrollStatusLabels = { draft: "Draft", finalized: "Finalized", paid: "Paid", voided: "Voided" } as const;
export type PayrollStatus = keyof typeof payrollStatusLabels;

export const payrollRunInputSchema = z.object({
  idempotencyKey: uuidSchema,
  departmentId: z.union([uuidSchema, z.literal("")]).default(""),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  payDate: z.iso.date(),
  notes: z.string().trim().max(500).default(""),
})
  .refine((input) => input.periodEnd >= input.periodStart, { path: ["periodEnd"], message: "End date must be on or after the start date" })
  .refine((input) => (Date.parse(input.periodEnd) - Date.parse(input.periodStart)) / 86_400_000 <= 62, { path: ["periodEnd"], message: "A payroll period can cover at most 62 days" })
  .refine((input) => input.payDate >= input.periodStart, { path: ["payDate"], message: "Pay date cannot be before the period starts" });

export const payrollLineInputSchema = z.object({
  lineId: uuidSchema,
  otherEarnings: pesos,
  deductions: pesos,
  notes: z.string().trim().max(300).default(""),
});

export const payrollPaymentSchema = z.object({ runId: uuidSchema, paidOn: z.iso.date(), reference: z.string().trim().min(2, "Enter the payment reference").max(120) });
export const payrollVoidSchema = z.object({ runId: uuidSchema, reason: z.string().trim().min(3, "Enter a reason").max(500) });
export const departmentInputSchema = z.object({ id: z.union([uuidSchema, z.literal("")]).default(""), name: z.string().trim().min(2, "Enter a department name").max(80) });

/** Payroll totals in whole centavos so displayed sums match the posted lines. */
export function payrollTotals(lines: { attendance_pay: number | string; other_earnings: number | string; deductions: number | string }[]) {
  const cents = (value: number | string) => Math.round(Number(value) * 100);
  const sum = lines.reduce((total, line) => ({
    gross: total.gross + cents(line.attendance_pay) + cents(line.other_earnings),
    deductions: total.deductions + cents(line.deductions),
  }), { gross: 0, deductions: 0 });
  return { gross: sum.gross / 100, deductions: sum.deductions / 100, net: (sum.gross - sum.deductions) / 100 };
}
