import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDashboardConsumption } from "@/lib/data/dashboard-consumption";

export async function getDashboardData(options: { finance: boolean; audit: boolean; consumption: boolean }) {
  const supabase = await createClient();
  const [total, active, onHold, recent, requestResult, monthlyResult, auditResult, consumptionTrend, totalsResult] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active").is("archived_at", null),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "on_hold").is("archived_at", null),
    supabase.from("projects").select("id,code,name,photo_path,city_province,status,target_completion_date,created_at,updated_at").eq("status", "active").is("archived_at", null).order("created_at", { ascending: false }).limit(4),
    supabase.from("material_requests").select("id,request_number,project_id,status,required_date,requested_at").order("requested_at", { ascending: false }).limit(4),
    options.finance ? supabase.rpc("get_dashboard_monthly_project_costs", { p_months: 6 }) : Promise.resolve({ data: [], error: null }),
    options.audit ? supabase.from("audit_logs").select("id,actor_id,table_name,action,created_at").order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null }),
    options.consumption ? getDashboardConsumption() : Promise.resolve({ months: [], series: [] }),
    options.finance ? supabase.rpc("get_dashboard_totals", {}) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = [total, active, onHold, recent, requestResult, monthlyResult, auditResult].find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load dashboard: ${error.message}`);
  if (totalsResult.error && !["PGRST202", "42883"].includes(totalsResult.error.code)) throw new Error("Unable to load dashboard totals.");
  const projectIds = [...new Set((requestResult.data ?? []).map((row) => row.project_id))];
  const actorIds = [...new Set((auditResult.data ?? []).flatMap((row) => row.actor_id ? [row.actor_id] : []))];
  const [projects, actors] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if ([projects, actors].some((result) => result.error)) throw new Error("Unable to resolve dashboard records.");
  const requestProjects = projects.data ?? [];
  const projectNames = new Map((requestProjects ?? []).map((row) => [row.id, row]));
  const actorNames = new Map((actors.data ?? []).map((row) => [row.id, row.full_name]));
  return {
    metrics: { total: total.count ?? 0, active: active.count ?? 0, onHold: onHold.count ?? 0 },
    financialTotals: options.finance ? totalsResult.data?.[0] ?? null : undefined,
    recentProjects: recent.data ?? [],
    recentRequests: (requestResult.data ?? []).map((row) => ({ ...row, project: projectNames.get(row.project_id) })),
    monthlyCosts: monthlyResult.data ?? [],
    consumptionTrend,
    recentActivity: (auditResult.data ?? []).map((row) => ({ ...row, actorName: row.actor_id ? actorNames.get(row.actor_id) ?? "Former account" : "System" })),
  };
}
