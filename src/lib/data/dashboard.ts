import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardData() {
  const supabase = await createClient();
  const [total, active, onHold, warehouses, recent, requestResult] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active").is("archived_at", null),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "on_hold").is("archived_at", null),
    supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("projects").select("id,code,name,photo_path,city_province,status,target_completion_date,created_at").eq("status", "active").is("archived_at", null).order("created_at", { ascending: false }).limit(4),
    supabase.from("material_requests").select("id,request_number,project_id,status,required_date,requested_at").order("requested_at", { ascending: false }).limit(4),
  ]);
  const error = [total, active, onHold, warehouses, recent, requestResult].find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load dashboard: ${error.message}`);
  const requestProjectIds = [...new Set((requestResult.data ?? []).map((row) => row.project_id))];
  const { data: requestProjects, error: requestProjectsError } = requestProjectIds.length
    ? await supabase.from("projects").select("id,code,name").in("id", requestProjectIds)
    : { data: [], error: null };
  if (requestProjectsError) throw new Error("Unable to load request projects.");
  const projectNames = new Map((requestProjects ?? []).map((row) => [row.id, row]));
  return {
    metrics: { total: total.count ?? 0, active: active.count ?? 0, onHold: onHold.count ?? 0, warehouses: warehouses.count ?? 0 },
    recentProjects: recent.data ?? [],
    recentRequests: (requestResult.data ?? []).map((row) => ({ ...row, project: projectNames.get(row.project_id) })),
  };
}
