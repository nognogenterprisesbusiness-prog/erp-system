import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardData(options: { finance: boolean; audit: boolean; consumption: boolean }) {
  const supabase = await createClient();
  const [total, active, onHold, warehouses, recent, requestResult, consumptionResult, monthlyResult, auditResult] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active").is("archived_at", null),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "on_hold").is("archived_at", null),
    supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("projects").select("id,code,name,photo_path,city_province,status,target_completion_date,created_at").eq("status", "active").is("archived_at", null).order("created_at", { ascending: false }).limit(4),
    supabase.from("material_requests").select("id,request_number,project_id,status,required_date,requested_at").order("requested_at", { ascending: false }).limit(4),
    options.consumption ? supabase.from("inventory_transactions").select("id,material_id,unit_of_measure_id,project_id,transaction_date,quantity,created_at").eq("transaction_type", "MATERIAL_CONSUMPTION").order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
    options.finance ? supabase.rpc("get_dashboard_monthly_project_costs", { p_months: 6 }) : Promise.resolve({ data: [], error: null }),
    options.audit ? supabase.from("audit_logs").select("id,actor_id,table_name,action,created_at").order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = [total, active, onHold, warehouses, recent, requestResult, consumptionResult, monthlyResult, auditResult].find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load dashboard: ${error.message}`);
  const candidateConsumption = consumptionResult.data ?? [];
  const { data: reversed, error: reversalError } = candidateConsumption.length
    ? await supabase.from("inventory_transactions").select("reversal_of").in("reversal_of", candidateConsumption.map((row) => row.id))
    : { data: [], error: null };
  if (reversalError) throw new Error("Unable to reconcile recent material consumption.");
  const reversedIds = new Set((reversed ?? []).flatMap((row) => row.reversal_of ? [row.reversal_of] : []));
  const recentConsumption = candidateConsumption.filter((row) => !reversedIds.has(row.id)).slice(0, 5);
  const projectIds = [...new Set([...(requestResult.data ?? []), ...recentConsumption].flatMap((row) => row.project_id ? [row.project_id] : []))];
  const materialIds = [...new Set(recentConsumption.map((row) => row.material_id))];
  const unitIds = [...new Set(recentConsumption.map((row) => row.unit_of_measure_id))];
  const actorIds = [...new Set((auditResult.data ?? []).flatMap((row) => row.actor_id ? [row.actor_id] : []))];
  const [projects, materials, units, actors] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    materialIds.length ? supabase.from("materials").select("id,name,code").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    unitIds.length ? supabase.from("units_of_measure").select("id,symbol").in("id", unitIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if ([projects, materials, units, actors].some((result) => result.error)) throw new Error("Unable to resolve dashboard records.");
  const requestProjects = projects.data ?? [];
  const projectNames = new Map((requestProjects ?? []).map((row) => [row.id, row]));
  const materialNames = new Map((materials.data ?? []).map((row) => [row.id, row]));
  const unitSymbols = new Map((units.data ?? []).map((row) => [row.id, row.symbol]));
  const actorNames = new Map((actors.data ?? []).map((row) => [row.id, row.full_name]));
  return {
    metrics: { total: total.count ?? 0, active: active.count ?? 0, onHold: onHold.count ?? 0, warehouses: warehouses.count ?? 0 },
    recentProjects: recent.data ?? [],
    recentRequests: (requestResult.data ?? []).map((row) => ({ ...row, project: projectNames.get(row.project_id) })),
    recentConsumption: recentConsumption.map((row) => ({ ...row, material: materialNames.get(row.material_id), unitSymbol: unitSymbols.get(row.unit_of_measure_id) ?? "", project: row.project_id ? projectNames.get(row.project_id) : undefined })),
    monthlyCosts: monthlyResult.data ?? [],
    recentActivity: (auditResult.data ?? []).map((row) => ({ ...row, actorName: row.actor_id ? actorNames.get(row.actor_id) ?? "Former account" : "System" })),
  };
}
