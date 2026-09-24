"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeLaborRateInputSchema,
  employeeCategoryInputSchema,
  employeeInputSchema,
  endWorkforceAssignmentInputSchema,
  laborRateInputSchema,
  transferWorkforceAssignmentInputSchema,
  uuidSchema,
  workforceAssignmentInputSchema,
} from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type WorkforceActionState =
  | { ok: true; data?: { id?: string }; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string, fieldErrors?: Record<string, string[]>): WorkforceActionState => ({ ok: false, message, fieldErrors });

function friendlyWorkforceError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to manage workforce records.";
  if (error.code === "23505") return "That employee code, linked account, category, or active project assignment is already in use.";
  if (error.code === "23P01" || error.message.includes("overlap")) return "This labor rate overlaps an existing rate of the same type.";
  if (error.message.includes("category")) return "The selected employee category is unavailable.";
  if (error.message.includes("linked user")) return "The selected user account is inactive or unavailable.";
  if (error.message.includes("project site")) return "Select an active site that belongs to the project.";
  if (error.message.includes("active project assignments")) return "End every active project assignment before archiving this employee.";
  if (error.message.includes("transfer dates")) return "The current assignment must end before the new assignment starts.";
  return "The workforce change could not be saved.";
}

function revalidateWorkforce(employeeId?: string, projectId?: string) {
  revalidatePath("/employees");
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function saveEmployeeAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage employees."); }
  const parsed = employeeInputSchema.safeParse({
    id: value(form, "id") || undefined,
    code: value(form, "code").toUpperCase(),
    firstName: value(form, "firstName"),
    middleName: value(form, "middleName"),
    lastName: value(form, "lastName"),
    contactNumber: value(form, "contactNumber"),
    emailAddress: value(form, "emailAddress"),
    categoryId: value(form, "categoryId"),
    employmentType: value(form, "employmentType"),
    status: value(form, "status"),
    hireDate: value(form, "hireDate"),
    profileId: value(form, "profileId"),
  });
  if (!parsed.success) return failure("Review the highlighted employee details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_employee_with_email", {
    p_id: input.id ?? null,
    p_code: input.code,
    p_first_name: input.firstName,
    p_middle_name: input.middleName,
    p_last_name: input.lastName,
    p_contact_number: input.contactNumber,
    p_email_address: input.emailAddress,
    p_category_id: input.categoryId,
    p_employment_type: input.employmentType,
    p_status: input.status,
    p_hire_date: input.hireDate,
    p_profile_id: input.profileId || null,
  });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(data);
  redirect(`/employees/${data}`);
}

export async function archiveEmployeeAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to archive employees."); }
  const id = uuidSchema.safeParse(value(form, "id"));
  const reason = value(form, "reason").trim();
  if (!id.success || reason.length < 3 || reason.length > 500) return failure("Enter an archive reason of 3 to 500 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_employee", { p_id: id.data, p_reason: reason });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(id.data);
  redirect("/employees?status=separated");
}

export async function saveEmployeeCategoryAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage employee categories."); }
  const parsed = employeeCategoryInputSchema.safeParse({ id: value(form, "id") || undefined, name: value(form, "name"), description: value(form, "description") });
  if (!parsed.success) return failure("Review the category details.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_employee_category", { p_id: parsed.data.id ?? null, p_name: parsed.data.name, p_description: parsed.data.description || "" });
  if (error) return failure(friendlyWorkforceError(error));
  revalidatePath("/employees");
  revalidatePath("/employees/categories");
  redirect("/employees/categories");
}

export async function archiveEmployeeCategoryAction(form: FormData) {
  await requireManager();
  const id = uuidSchema.parse(value(form, "id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_employee_category", { p_id: id });
  if (error) throw new Error(friendlyWorkforceError(error));
  revalidatePath("/employees");
  revalidatePath("/employees/categories");
}

export async function assignEmployeeAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to assign employees."); }
  const parsed = workforceAssignmentInputSchema.safeParse({
    employeeId: value(form, "employeeId"), projectId: value(form, "projectId"), projectSiteId: value(form, "projectSiteId"),
    positionTitle: value(form, "positionTitle"), startDate: value(form, "startDate"), remarks: value(form, "remarks"),
  });
  if (!parsed.success) return failure("Review the assignment details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_employee_to_project", {
    p_employee_id: input.employeeId, p_project_id: input.projectId, p_project_site_id: input.projectSiteId,
    p_position_title: input.positionTitle, p_start_date: input.startDate, p_remarks: input.remarks || "",
  });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(input.employeeId, input.projectId);
  return { ok: true, message: "Employee assigned.", data: { id: data } };
}

export async function endEmployeeAssignmentAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to end assignments."); }
  const parsed = endWorkforceAssignmentInputSchema.safeParse({ assignmentId: value(form, "assignmentId"), endDate: value(form, "endDate"), remarks: value(form, "remarks") });
  if (!parsed.success) return failure("Review the assignment end details.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_employee_project_assignment", { p_assignment_id: parsed.data.assignmentId, p_end_date: parsed.data.endDate, p_remarks: parsed.data.remarks || "" });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(value(form, "employeeId") || undefined, value(form, "projectId") || undefined);
  return { ok: true, message: "Assignment ended." };
}

export async function transferEmployeeAssignmentAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to transfer employees."); }
  const parsed = transferWorkforceAssignmentInputSchema.safeParse({
    assignmentId: value(form, "assignmentId"), projectId: value(form, "projectId"), projectSiteId: value(form, "projectSiteId"),
    positionTitle: value(form, "positionTitle"), currentEndDate: value(form, "currentEndDate"), newStartDate: value(form, "newStartDate"), remarks: value(form, "remarks"),
  });
  if (!parsed.success) return failure("Review the transfer details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_employee_assignment", {
    p_assignment_id: input.assignmentId, p_new_project_id: input.projectId, p_new_project_site_id: input.projectSiteId,
    p_new_position_title: input.positionTitle, p_current_end_date: input.currentEndDate, p_new_start_date: input.newStartDate, p_remarks: input.remarks || "",
  });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(value(form, "employeeId") || undefined, input.projectId);
  return { ok: true, message: "Employee transferred.", data: { id: data } };
}

export async function addLaborRateAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage labor rates."); }
  const parsed = laborRateInputSchema.safeParse({ employeeId: value(form, "employeeId"), rateType: value(form, "rateType"), amount: value(form, "amount"), effectiveStartDate: value(form, "effectiveStartDate"), effectiveEndDate: value(form, "effectiveEndDate") });
  if (!parsed.success) return failure("Review the labor rate details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_labor_rate", { p_employee_id: input.employeeId, p_rate_type: input.rateType, p_rate_amount: input.amount, p_effective_start_date: input.effectiveStartDate, p_effective_end_date: input.effectiveEndDate || null });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(input.employeeId);
  return { ok: true, message: "Labor rate version added.", data: { id: data } };
}

export async function closeLaborRateAction(_: WorkforceActionState, form: FormData): Promise<WorkforceActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to close labor rates."); }
  const parsed = closeLaborRateInputSchema.safeParse({ rateId: value(form, "rateId"), effectiveEndDate: value(form, "effectiveEndDate") });
  if (!parsed.success) return failure("Enter a valid rate end date.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_labor_rate", { p_rate_id: parsed.data.rateId, p_effective_end_date: parsed.data.effectiveEndDate });
  if (error) return failure(friendlyWorkforceError(error));
  revalidateWorkforce(value(form, "employeeId") || undefined);
  return { ok: true, message: "Labor rate closed." };
}
