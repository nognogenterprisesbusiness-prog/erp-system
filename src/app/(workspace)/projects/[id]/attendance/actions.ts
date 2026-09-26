"use server";

import { postAttendanceSchema, reverseAttendanceSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { requireManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AttendanceActionState = { ok?: boolean; message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (message: string, fieldErrors?: Record<string, string[]>): AttendanceActionState => ({ message, fieldErrors });

function attendanceError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to record or correct this attendance.";
  if (error.message.includes("already posted")) return "This employee already has an active attendance entry for the project and date.";
  if (error.message.includes("No approved labor rate")) return "Add an approved rate covering this employee and date first.";
  if (error.message.includes("hours exceed 24")) return "The employee's total recorded hours for this day would exceed 24.";
  if (error.message.includes("not assigned")) return "The employee was not assigned to this project on that date.";
  if (error.code === "23505") return "This attendance action conflicts with an existing record. Refresh and try again.";
  return "Attendance could not be posted. No project labor cost was changed.";
}

export async function postAttendanceAction(_: AttendanceActionState, form: FormData): Promise<AttendanceActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("foreman")) return fail("Only an Admin or assigned Foreman can record attendance.");
  const supabase = await createClient();
  const { data: assignment, error: assignmentError } = await supabase.from("employee_project_assignments").select("project_id,employee_id").eq("id", value(form, "assignmentId")).maybeSingle();
  if (assignmentError || !assignment || assignment.project_id !== value(form, "projectId")) return fail("The employee assignment does not belong to this project.");
  const absent = value(form, "status") === "absent";
  const basis = absent ? { data: "none" as const, error: null } : await supabase.rpc("get_attendance_rate_basis", { p_employee_id: assignment.employee_id, p_work_date: value(form, "workDate") });
  if (basis.error) return fail("An Admin must configure a valid attendance costing basis and rate for this date.");
  const parsed = postAttendanceSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"),
    assignmentId: value(form, "assignmentId"), workDate: value(form, "workDate"),
    status: value(form, "status"), hours: value(form, "hours"),
    rateType: basis.data, dayFraction: basis.data === "daily" ? value(form, "dayFraction") : "", note: value(form, "note"),
  });
  if (!parsed.success) return fail("Review the attendance details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const { error } = await supabase.rpc("post_project_attendance", {
    p_idempotency_key: input.idempotencyKey, p_assignment_id: input.assignmentId,
    p_work_date: input.workDate, p_status: input.status, p_hours: input.hours,
    p_rate_type: input.rateType === "none" ? null : input.rateType,
    p_day_fraction: input.dayFraction || null, p_note: input.note,
  });
  if (error) return fail(attendanceError(error));
  revalidatePath(`/projects/${input.projectId}/attendance`);
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/attendance");
  return { ok: true, message: "Attendance recorded." };
}

export async function reverseAttendanceAction(_: AttendanceActionState, form: FormData): Promise<AttendanceActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can reverse attendance."); }
  const parsed = reverseAttendanceSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"),
    attendanceId: value(form, "attendanceId"), reason: value(form, "reason"),
  });
  if (!parsed.success) return fail("Enter a correction reason.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data: attendance, error: lookupError } = await supabase.from("project_attendance").select("project_id").eq("id", input.attendanceId).single();
  if (lookupError || attendance?.project_id !== input.projectId) return fail("This attendance record does not belong to the project.");
  const { error } = await supabase.rpc("reverse_project_attendance", { p_idempotency_key: input.idempotencyKey, p_attendance_id: input.attendanceId, p_reason: input.reason });
  if (error) return fail(attendanceError(error));
  revalidatePath(`/projects/${input.projectId}/attendance`);
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/attendance");
  return { ok: true, message: "Attendance reversed; history preserved." };
}
