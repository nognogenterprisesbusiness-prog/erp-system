import { z } from "zod";
import { moneyInputSchema } from "./inventory";
import { uuidSchema } from "./common";

export const issueInvoiceSchema = z.object({
  idempotencyKey: uuidSchema,
  projectId: uuidSchema,
  description: z.string().trim().min(3).max(300),
  issuedOn: z.iso.date(),
  dueOn: z.iso.date(),
  amount: moneyInputSchema,
}).refine((value) => value.dueOn >= value.issuedOn, { path: ["dueOn"], message: "Due date must not precede issue date" });

export const recordPaymentSchema = z.object({
  idempotencyKey: uuidSchema,
  invoiceId: uuidSchema,
  amount: moneyInputSchema,
  paidOn: z.iso.date(),
  reference: z.string().trim().min(3).max(100),
});

export const reversePaymentSchema = z.object({
  idempotencyKey: uuidSchema,
  paymentId: uuidSchema,
  invoiceId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});

export const voidInvoiceSchema = z.object({
  invoiceId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});
