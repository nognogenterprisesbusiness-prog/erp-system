"use server";

import { issueInvoiceSchema, recordPaymentSchema, reversePaymentSchema, voidInvoiceSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinanceViewer, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type BillingActionState = { message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (message: string, fieldErrors?: Record<string, string[]>): BillingActionState => ({ message, fieldErrors });

function billingError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to perform this billing action.";
  if (error.message.includes("exceeds remaining project contract")) return "This exceeds the remaining project contract value.";
  if (error.message.includes("exceeds invoice outstanding")) return "This payment exceeds the outstanding invoice balance.";
  if (error.message.includes("reference_invoice_unique")) return "That payment reference is already recorded on this invoice.";
  if (error.message.includes("already been reversed")) return "This payment has already been reversed.";
  if (error.message.includes("Reverse all payments")) return "Reverse active payments before voiding this invoice.";
  if (error.message.includes("not eligible for billing")) return "The selected project is not available for billing.";
  if (error.message.includes("not payable")) return "This invoice can no longer accept payments.";
  if (error.code === "23505") return "This transaction conflicts with an existing billing record. Refresh and try again.";
  return "The billing action could not be completed. No payment or invoice was posted.";
}

export async function issueInvoiceAction(_: BillingActionState, form: FormData): Promise<BillingActionState> {
  try { await requireFinanceViewer(); } catch { return fail("You do not have permission to issue invoices."); }
  const parsed = issueInvoiceSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"),
    description: value(form, "description"), issuedOn: value(form, "issuedOn"),
    dueOn: value(form, "dueOn"), amount: value(form, "amount"),
  });
  if (!parsed.success) return fail("Review the invoice details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_client_invoice", {
    p_idempotency_key: input.idempotencyKey, p_project_id: input.projectId,
    p_description: input.description, p_issued_on: input.issuedOn, p_due_on: input.dueOn,
    p_amount: input.amount,
  });
  if (error) return fail(billingError(error));
  revalidatePath("/billing");
  redirect(`/billing/${data}`);
}

export async function recordPaymentAction(_: BillingActionState, form: FormData): Promise<BillingActionState> {
  try { await requireFinanceViewer(); } catch { return fail("You do not have permission to record payments."); }
  const parsed = recordPaymentSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), invoiceId: value(form, "invoiceId"),
    amount: value(form, "amount"), paidOn: value(form, "paidOn"), reference: value(form, "reference"),
  });
  if (!parsed.success) return fail("Review the payment details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_client_payment", {
    p_idempotency_key: input.idempotencyKey, p_invoice_id: input.invoiceId,
    p_amount: input.amount, p_paid_on: input.paidOn, p_reference: input.reference,
  });
  if (error) return fail(billingError(error));
  revalidatePath("/billing");
  revalidatePath(`/billing/${input.invoiceId}`);
  redirect(`/billing/${input.invoiceId}?posted=payment`);
}

export async function reversePaymentAction(_: BillingActionState, form: FormData): Promise<BillingActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can reverse a payment."); }
  const parsed = reversePaymentSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), paymentId: value(form, "paymentId"),
    invoiceId: value(form, "invoiceId"), reason: value(form, "reason"),
  });
  if (!parsed.success) return fail("Enter a correction reason.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data: payment, error: lookupError } = await supabase.from("client_payments").select("invoice_id").eq("id", input.paymentId).single();
  if (lookupError || payment?.invoice_id !== input.invoiceId) return fail("The payment does not belong to this invoice.");
  const { error } = await supabase.rpc("reverse_client_payment", { p_idempotency_key: input.idempotencyKey, p_payment_id: input.paymentId, p_reason: input.reason });
  if (error) return fail(billingError(error));
  revalidatePath("/billing");
  revalidatePath(`/billing/${input.invoiceId}`);
  redirect(`/billing/${input.invoiceId}?posted=reversal`);
}

export async function voidInvoiceAction(_: BillingActionState, form: FormData): Promise<BillingActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can void an invoice."); }
  const parsed = voidInvoiceSchema.safeParse({ invoiceId: value(form, "invoiceId"), reason: value(form, "reason") });
  if (!parsed.success) return fail("Enter a void reason.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_client_invoice", { p_invoice_id: input.invoiceId, p_reason: input.reason });
  if (error) return fail(billingError(error));
  revalidatePath("/billing");
  revalidatePath(`/billing/${input.invoiceId}`);
  redirect(`/billing/${input.invoiceId}?posted=void`);
}
