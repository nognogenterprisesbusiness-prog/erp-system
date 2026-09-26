"use server";
import { uuidSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { requireDailyReportViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  const { error } = await (await createClient()).rpc(detach ? "detach_daily_report_resource" : "attach_daily_report_resource", { p_report_id: report.data, p_kind: kind, p_resource_id: resource.data });
  if (error) return { ok: false, message: "Record could not be attached. Check project, site, date and access." };
  revalidatePath(`/reports/daily/${report.data}`);
  return { ok: true, message: detach ? "Link removed. The original posting is unchanged." : "Record attached. Stock and costs were not posted again." };
}
