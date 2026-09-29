"use server";

import { additionalExpenseSchema, budgetChangeSchema, equipmentRateSchema, equipmentUsageSchema, reverseProjectCostSchema, uuidSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { verifyRecordPhoto } from "@/lib/media/verify-record-photo";
import { storeEquipmentEvidence } from "@/lib/media/equipment-evidence";

export type ProjectCostActionState = { ok?: boolean; message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (message: string, fieldErrors?: Record<string, string[]>): ProjectCostActionState => ({ message, fieldErrors });

function costError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to record or correct this project cost.";
  if (error.message.includes("located at an active site")) return "Assign the equipment to an active site in this project first.";
  if (error.message.includes("No approved equipment rate")) return "Set an equipment rate covering the usage date first.";
  if (error.message.includes("exceeds 24 hours")) return "The equipment would exceed 24 recorded hours for this date.";
  if (error.message.includes("already posted")) return "Usage is already posted for this equipment, project and date.";
  if (error.message.includes("cannot be negative")) return "The approved budget cannot become negative.";
  if (error.code === "23505") return "The reference or transaction key already exists. Refresh and check the history.";
  return "The project cost action could not be posted.";
}

function update(projectId: string) {
  revalidatePath(`/projects/${projectId}/costs`);
  revalidatePath(`/projects/${projectId}`);
}

export async function setEquipmentRateAction(_: ProjectCostActionState, form: FormData): Promise<ProjectCostActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can set equipment rates."); }
  const projectId = uuidSchema.safeParse(value(form, "projectId"));
  if (!projectId.success) return fail("Invalid project.");
  const parsed = equipmentRateSchema.safeParse({ assetId: value(form, "assetId"), hourlyRate: value(form, "hourlyRate"), effectiveOn: value(form, "effectiveOn") });
  if (!parsed.success) return fail("Review the equipment rate.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_equipment_hour_rate", { p_asset_id: parsed.data.assetId, p_hourly_rate: parsed.data.hourlyRate, p_effective_start_date: parsed.data.effectiveOn });
  if (error) return fail(costError(error));
  update(projectId.data);
  redirect(`/projects/${projectId.data}/costs?posted=rate`);
}

export async function postEquipmentUsageAction(_: ProjectCostActionState, form: FormData): Promise<ProjectCostActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("foreman")) return fail("Only an Admin or assigned Foreman can record equipment hours.");
  const parsed = equipmentUsageSchema.safeParse({ idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"), assetId: value(form, "assetId"), useDate: value(form, "useDate"), hours: value(form, "hours"), workNote: value(form, "workNote") });
  if (!parsed.success) return fail("Review the equipment usage.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const start = form.get("startPhoto");
  const end = form.get("endPhoto");
  if (!(start instanceof File) || !(end instanceof File) || start.size === 0 || end.size === 0
    || start.size > 2_000_000 || end.size > 2_000_000)
    return fail("Add a start and after photo. Each processed image must be under 2 MB.");
  let photos: [Buffer, Buffer];
  try {
    photos = await Promise.all([
      verifyRecordPhoto(Buffer.from(await start.arrayBuffer())),
      verifyRecordPhoto(Buffer.from(await end.arrayBuffer())),
    ]);
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : "The photos could not be verified.");
  }
  const supabase = await createClient();
  try {
    await storeEquipmentEvidence(supabase, user.userId, input.idempotencyKey, photos);
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : "Equipment photos could not be uploaded.");
  }
  const { error } = await supabase.rpc("post_project_equipment_usage_with_photos", {
    p_idempotency_key: input.idempotencyKey, p_project_id: input.projectId,
    p_asset_id: input.assetId, p_use_date: input.useDate,
    p_hours: input.hours, p_work_note: input.workNote,
  });
  if (error) return fail(costError(error));
  update(input.projectId);
  return { ok: true, message: "Equipment hours and photos recorded." };
}

export async function postAdditionalExpenseAction(_: ProjectCostActionState, form: FormData): Promise<ProjectCostActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can post project expenses."); }
  const parsed = additionalExpenseSchema.safeParse({ idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"), expenseDate: value(form, "expenseDate"), category: value(form, "category"), description: value(form, "description"), externalReference: value(form, "externalReference"), amount: value(form, "amount") });
  if (!parsed.success) return fail("Review the expense details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_project_additional_expense", { p_idempotency_key: input.idempotencyKey, p_project_id: input.projectId, p_expense_date: input.expenseDate, p_category: input.category, p_description: input.description, p_external_reference: input.externalReference, p_amount: input.amount });
  if (error) return fail(costError(error));
  update(input.projectId);
  redirect(`/projects/${input.projectId}/costs?posted=expense`);
}

export async function adjustBudgetAction(_: ProjectCostActionState, form: FormData): Promise<ProjectCostActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can adjust budget."); }
  const parsed = budgetChangeSchema.safeParse({ idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"), changeAmount: value(form, "changeAmount"), reason: value(form, "reason") });
  if (!parsed.success) return fail("Review the budget change.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_project_budget", { p_idempotency_key: input.idempotencyKey, p_project_id: input.projectId, p_change_amount: input.changeAmount, p_reason: input.reason });
  if (error) return fail(costError(error));
  update(input.projectId);
  redirect(`/projects/${input.projectId}/costs?posted=budget`);
}

export async function reverseProjectCostAction(_: ProjectCostActionState, form: FormData): Promise<ProjectCostActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can reverse project costs."); }
  const parsed = reverseProjectCostSchema.safeParse({ idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"), kind: value(form, "kind"), entryId: value(form, "entryId"), reason: value(form, "reason") });
  if (!parsed.success) return fail("Enter a correction reason.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const source = input.kind === "equipment" ? "project_equipment_usage" : "project_additional_expenses";
  const { data: entry, error: lookupError } = await supabase.from(source).select("project_id").eq("id", input.entryId).single();
  if (lookupError || entry?.project_id !== input.projectId) return fail("The cost entry does not belong to this project.");
  const { error } = await supabase.rpc("reverse_project_cost_entry", { p_idempotency_key: input.idempotencyKey, p_kind: input.kind, p_entry_id: input.entryId, p_reason: input.reason });
  if (error) return fail(costError(error));
  update(input.projectId);
  redirect(`/projects/${input.projectId}/costs?posted=reversal`);
}
