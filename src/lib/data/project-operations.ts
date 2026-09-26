import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getProjectMaterialPlan(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_material_plan", { p_project_id: projectId });
  if (error) throw new Error("Unable to load the project material plan.");
  return data ?? [];
}

export async function getProjectProgress(projectId: string) {
  return (await getProjectProgressPage(projectId)).entries;
}

export async function getProjectProgressPage(projectId: string, page = 1) {
  const supabase = await createClient();
  const { data, count, error } = await supabase.from("project_progress_entries").select("*", { count: "exact" })
    .eq("project_id", projectId).order("progress_date", { ascending: false })
    .order("recorded_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("Unable to load project progress.");
  return { entries: data ?? [], count: count ?? 0 };
}

export async function getReportProgress(reportId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_progress_entries").select("*")
    .eq("daily_report_id", reportId).maybeSingle();
  if (error) throw new Error("Unable to load report progress.");
  return data;
}
