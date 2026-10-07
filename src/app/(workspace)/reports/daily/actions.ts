"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dailyReportInputSchema, dailyReportReviewSchema, projectProgressInputSchema, uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import { executeSiteCommand } from "@/lib/mobile/commands";

export type DailyReportActionState =
  | { ok: true; message: string; id?: string }
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
  if (value(form, "photoSelected") === "1" && !photo) return { ok: false, message: "The selected photo was not attached. Choose it again before saving." };
  const supabase = await createClient();
  let data: string;
  try { data = (await executeSiteCommand(supabase, { action: "save-report", input: { ...input, intent: photo ? "draft" : input.intent } })).id!; }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "The daily report could not be saved." }; }
  if (photo) {
    try { await saveRecordPhoto("daily-reports", data, photo, supabase); }
    catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "The report was saved, but its photo could not be attached." }; }
    if (input.intent === "submit") {
      try { await executeSiteCommand(supabase, { action: "save-report", input }); }
      catch {
        revalidatePath("/reports/daily");
        revalidatePath(`/reports/daily/${data}`);
        return { ok: false, message: "The photo was saved. The report remains a draft; review its status before submitting again." };
      }
    }
  }
  revalidatePath("/reports/daily");
  revalidatePath(`/reports/daily/${data}`);
  return { ok: true, message: input.intent === "submit" ? "Report submitted." : "Draft saved.", id: data };
}

export async function reviewDailyReportAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  await requireUser();
  const parsed = dailyReportReviewSchema.safeParse({ reportId: value(form, "reportId"), action: value(form, "action"), note: value(form, "note") });
  if (!parsed.success) return { ok: false, message: "Review the decision and note.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  try { await executeSiteCommand(supabase, { action: "review-report", input: parsed.data }); }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "The review could not be saved." }; }
  revalidatePath(`/reports/daily/${parsed.data.reportId}`);
  revalidatePath("/reports/daily");
  return { ok: true, message: parsed.data.action === "approve" ? "Report approved." : "Report returned for correction." };
}

export async function startDailyReportCorrectionAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  await requireUser();
  const id = value(form, "reportId");
  if (!uuidSchema.safeParse(id).success) return { ok: false, message: "Invalid report ID." };
  const supabase = await createClient();
  try { await executeSiteCommand(supabase, { action: "correct-report", input: { reportId: id } }); }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "The report could not be reopened." }; }
  revalidatePath(`/reports/daily/${id}`);
  redirect(`/reports/daily/${id}?edit=1`);
}

export async function recordProjectProgressAction(_: DailyReportActionState, form: FormData): Promise<DailyReportActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("engineer")) return { ok: false, message: "Only an administrator or assigned engineer can record progress." };
  const parsed = projectProgressInputSchema.safeParse({ reportId: value(form, "reportId"), percent: value(form, "percent"), summary: value(form, "summary") });
  if (!parsed.success) return { ok: false, message: "Review the progress details.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  try { await executeSiteCommand(supabase, { action: "record-progress", input: parsed.data }); }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "Project progress could not be saved." }; }
  revalidatePath(`/reports/daily/${parsed.data.reportId}`);
  return { ok: true, message: "Project progress recorded." };
}
