"use server";
import { uuidSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { requireDailyReportViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { executeSiteCommand } from "@/lib/mobile/commands";
export type ResourceState = { ok: boolean; message: string };
export async function attachReportResource(_: ResourceState, form: FormData): Promise<ResourceState> {
  return changeReportResource(form, false);
}
export async function detachReportResource(_: ResourceState, form: FormData): Promise<ResourceState> {
  return changeReportResource(form, true);
}
async function changeReportResource(form: FormData, detach: boolean): Promise<ResourceState> {
  await requireDailyReportViewer();
  const report = uuidSchema.safeParse(form.get("reportId"));
  const resource = uuidSchema.safeParse(form.get("resourceId"));
  const kind = String(form.get("kind") ?? "");
  if (!report.success || !resource.success || !["material", "attendance", "equipment"].includes(kind)) return { ok: false, message: "Choose a valid resource record." };
  try { await executeSiteCommand(await createClient(), { action: "link-resource", input: { reportId: report.data, kind, resourceId: resource.data, detach } }); }
  catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : "Record could not be attached." }; }
  revalidatePath(`/reports/daily/${report.data}`);
  return { ok: true, message: detach ? "Link removed. The original posting is unchanged." : "Record attached. Stock and costs were not posted again." };
}
