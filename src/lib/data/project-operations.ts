import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getProjectMaterialPlan(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_material_plan", { p_project_id: projectId });
  if (error) throw new Error("Unable to load the project material plan.");
  return data ?? [];
}

export async function getProjectProgress(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_progress_entries").select("*")
    .eq("project_id", projectId).order("progress_date", { ascending: false })
    .order("recorded_at", { ascending: false }).limit(100);
  if (error) throw new Error("Unable to load project progress.");
  return data ?? [];
}

export async function getReportProgress(reportId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_progress_entries").select("*")
    .eq("daily_report_id", reportId).maybeSingle();
  if (error) throw new Error("Unable to load report progress.");
  return data;
}
