"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dailyReportInputSchema, dailyReportReviewSchema, projectProgressInputSchema, uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";

export type DailyReportActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

const value = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function saveDailyReportAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  await requireUser();
  const parsed = dailyReportInputSchema.safeParse({
    id: value(form, "id"), projectId: value(form, "projectId"), projectSiteId: value(form, "projectSiteId"),
    reportDate: value(form, "reportDate"), weatherConditions: value(form, "weatherConditions"),
    workDescription: value(form, "workDescription"), accomplishments: value(form, "accomplishments"),
    issuesEncountered: value(form, "issuesEncountered"), siteObservations: value(form, "siteObservations"),
    generalRemarks: value(form, "generalRemarks"), intent: value(form, "intent"),
  });
  if (!parsed.success) return { ok: false, message: "Review the report fields and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  const input = parsed.data;
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "The report photo could not be processed." }; }
  const supabase = await createClient();
  const args = {
    p_id: input.id, p_project_id: input.projectId, p_project_site_id: input.projectSiteId,
    p_report_date: input.reportDate, p_weather_conditions: input.weatherConditions,
    p_work_description: input.workDescription, p_accomplishments: input.accomplishments,
    p_issues_encountered: input.issuesEncountered, p_site_observations: input.siteObservations,
    p_general_remarks: input.generalRemarks, p_submit: input.intent === "submit" && !photo,
  };
  const { data, error } = await supabase.rpc("save_daily_report", args);
  if (error) {
    let message = "The daily report could not be saved. Please try again.";
    if (error.code === "42501") message = "You do not have permission to prepare a report for this project.";
    else if (error.code === "55000") message = "This report has already been submitted and can no longer be edited.";
    else if (error.message.includes("site is unavailable")) message = "Select an active site in an active project.";
    else if (error.message.includes("required for submission")) message = "Work description and accomplishments are required before submitting.";
    return { ok: false, message };
  }
  if (photo) {
    try { await saveRecordPhoto("daily-reports", data, photo); }
    catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "The report was saved, but its photo could not be attached." }; }
    if (input.intent === "submit") {
      const { error: submitError } = await supabase.rpc("save_daily_report", { ...args, p_submit: true });
      if (submitError) return { ok: false, message: "The photo was saved, but the report remains a draft. Review and submit it again." };
    }
  }
  revalidatePath("/reports/daily");
  revalidatePath(`/reports/daily/${data}`);
  revalidatePath(`/projects/${input.projectId}/reports`);
  redirect(`/reports/daily/${data}`);
}

export async function reviewDailyReportAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  await requireUser();
  const parsed = dailyReportReviewSchema.safeParse({ reportId: value(form, "reportId"), action: value(form, "action"), note: value(form, "note") });
  if (!parsed.success) return { ok: false, message: "Review the decision and note.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_daily_report", {
    p_report_id: parsed.data.reportId, p_action: parsed.data.action, p_note: parsed.data.note,
  });
  if (error) return { ok: false, message: error.code === "42501" ? "An independent project manager must review this report." : error.code === "55000" ? "This report is no longer awaiting review." : "The review could not be saved. Please try again." };
  revalidatePath(`/reports/daily/${parsed.data.reportId}`);
  revalidatePath("/reports/daily");
  return { ok: true, message: parsed.data.action === "approve" ? "Report approved." : "Report returned for correction." };
}

export async function startDailyReportCorrectionAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  await requireUser();
  const id = value(form, "reportId");
  if (!uuidSchema.safeParse(id).success) return { ok: false, message: "Invalid report ID." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_daily_report_correction", { p_report_id: id });
  if (error) return { ok: false, message: error.code === "42501" ? "Only the report preparer can correct it." : "The report could not be reopened for correction." };
  revalidatePath(`/reports/daily/${id}`);
  redirect(`/reports/daily/${id}/edit`);
}

export async function recordProjectProgressAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("project_manager")) return { ok: false, message: "Only an administrator or assigned project manager can record progress." };
  const parsed = projectProgressInputSchema.safeParse({ reportId: value(form, "reportId"), percent: value(form, "percent"), summary: value(form, "summary") });
  if (!parsed.success) return { ok: false, message: "Review the progress details.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_project_progress", {
    p_report_id: parsed.data.reportId, p_percent: parsed.data.percent, p_summary: parsed.data.summary,
  });
  if (error) return { ok: false, message: error.code === "42501" ? "You cannot record progress for this project." : error.code === "23505" ? "Progress is already recorded for this report." : "Progress could not be recorded. Use an approved daily report." };
  revalidatePath(`/reports/daily/${parsed.data.reportId}`);
  return { ok: true, message: "Project progress recorded." };
}
