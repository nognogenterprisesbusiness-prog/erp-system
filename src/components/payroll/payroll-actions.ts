"use server";

import { departmentInputSchema, payrollLineInputSchema, payrollPaymentSchema, payrollRunInputSchema, payrollVoidSchema, uuidSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireFinanceViewer, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PayrollActionState = { ok?: boolean; message: string; fieldErrors?: Record<string, string[] | undefined> };
const fail = (message: string, fieldErrors?: PayrollActionState["fieldErrors"]): PayrollActionState => ({ ok: false, message, fieldErrors });
const field = (form: FormData, name: string) => String(form.get(name) ?? "");

// Server messages are the ERP's own wording; anything unexpected gets a safe generic message.
function payrollError(error: { code?: string; message: string }, fallback: string) {
  const known = ["Overlapping payroll already includes", "No active employees", "Deductions cannot exceed gross pay", "Only a draft payroll", "Finalize the payroll",
    "already voided", "A department with this name already exists", "Choose an active department", "Invalid payroll period", "Enter the payment date"];
  if (known.some((text) => error.message.includes(text))) return error.message;
  if (error.code === "42501") return "You do not have permission for this payroll action.";
  return fallback;
}

export async function createPayrollAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Payroll access is required."); }
  const parsed = payrollRunInputSchema.safeParse({ idempotencyKey: field(form, "idempotencyKey"), departmentId: field(form, "departmentId"), periodStart: field(form, "periodStart"), periodEnd: field(form, "periodEnd"), payDate: field(form, "payDate"), notes: field(form, "notes") });
  if (!parsed.success) return fail("Review the payroll period.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payroll_run", { p_key: input.idempotencyKey, p_department_id: input.departmentId || null, p_period_start: input.periodStart, p_period_end: input.periodEnd, p_pay_date: input.payDate, p_notes: input.notes });
  if (error || !data) return fail(error ? payrollError(error, "The payroll could not be created. Refresh and try again.") : "The payroll could not be created.");
  revalidatePath("/payroll");
  redirect(`/payroll/${data}`);
}

export async function updatePayrollLineAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Payroll access is required."); }
  const parsed = payrollLineInputSchema.safeParse({ lineId: field(form, "lineId"), otherEarnings: field(form, "otherEarnings") || "0", deductions: field(form, "deductions") || "0", notes: field(form, "notes") });
  if (!parsed.success) return fail("Enter amounts up to two decimal places.", parsed.error.flatten().fieldErrors);
  const runId = uuidSchema.safeParse(field(form, "runId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_payroll_line", { p_line_id: parsed.data.lineId, p_other_earnings: Number(parsed.data.otherEarnings), p_deductions: Number(parsed.data.deductions), p_notes: parsed.data.notes });
  if (error) return fail(payrollError(error, "The line could not be saved. Refresh and try again."));
  if (runId.success) revalidatePath(`/payroll/${runId.data}`);
  return { ok: true, message: "Saved." };
}

export async function finalizePayrollAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireManager(); } catch { return fail("Only Admin can finalize payroll."); }
  const runId = uuidSchema.safeParse(field(form, "runId"));
  if (!runId.success) return fail("Payroll is unavailable.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_payroll_run", { p_run_id: runId.data });
  if (error) return fail(payrollError(error, "The payroll could not be finalized. Refresh and try again."));
  revalidatePath("/payroll"); revalidatePath(`/payroll/${runId.data}`);
  return { ok: true, message: "Payroll finalized. Attendance pay was recalculated and the lines are now locked." };
}

export async function markPayrollPaidAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Payroll access is required."); }
  const parsed = payrollPaymentSchema.safeParse({ runId: field(form, "runId"), paidOn: field(form, "paidOn"), reference: field(form, "reference") });
  if (!parsed.success) return fail("Enter the payment date and reference.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_payroll_paid", { p_run_id: parsed.data.runId, p_paid_on: parsed.data.paidOn, p_reference: parsed.data.reference });
  if (error) return fail(payrollError(error, "The payment could not be recorded. Refresh and try again."));
  revalidatePath("/payroll"); revalidatePath(`/payroll/${parsed.data.runId}`);
  return { ok: true, message: "Payroll marked as paid." };
}

export async function voidPayrollAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireManager(); } catch { return fail("Only Admin can void payroll."); }
  const parsed = payrollVoidSchema.safeParse({ runId: field(form, "runId"), reason: field(form, "reason") });
  if (!parsed.success) return fail("Enter a reason.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payroll_run", { p_run_id: parsed.data.runId, p_reason: parsed.data.reason });
  if (error) return fail(payrollError(error, "The payroll could not be voided. Refresh and try again."));
  revalidatePath("/payroll"); revalidatePath(`/payroll/${parsed.data.runId}`);
  return { ok: true, message: "Payroll voided. Its history stays visible." };
}

export async function saveDepartmentAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireManager(); } catch { return fail("Only Admin can manage departments."); }
  const parsed = departmentInputSchema.safeParse({ id: field(form, "id"), name: field(form, "name") });
  if (!parsed.success) return fail("Enter a department name.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_department", { p_id: parsed.data.id || null, p_name: parsed.data.name });
  if (error) return fail(payrollError(error, "The department could not be saved."));
  revalidatePath("/payroll"); revalidatePath("/employees/[id]", "page");
  return { ok: true, message: "Department saved." };
}

export async function setEmployeeDepartmentAction(_: PayrollActionState, form: FormData): Promise<PayrollActionState> {
  try { await requireManager(); } catch { return fail("Only Admin can change departments."); }
  const parsed = z.object({ employeeId: uuidSchema, departmentId: z.union([uuidSchema, z.literal("")]) }).safeParse({ employeeId: field(form, "employeeId"), departmentId: field(form, "departmentId") });
  if (!parsed.success) return fail("Choose a department.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_department", { p_employee_id: parsed.data.employeeId, p_department_id: parsed.data.departmentId || null });
  if (error) return fail(payrollError(error, "The department could not be changed."));
  revalidatePath(`/employees/${parsed.data.employeeId}`);
  return { ok: true, message: "Department updated." };
}
