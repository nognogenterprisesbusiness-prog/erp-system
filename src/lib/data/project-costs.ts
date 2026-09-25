import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getProjectProfitability(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_profitability", { p_project_id: projectId });
  if (error || !data?.[0]) throw new Error("Unable to load project profitability.");
  return data[0];
}

export async function getProjectCostData(projectId: string, canManage: boolean) {
  const supabase = await createClient();
  const [profitResult, equipmentResult, expensesResult, budgetsResult, assetResult] = await Promise.all([
    supabase.rpc("get_project_profitability", { p_project_id: projectId }),
    supabase.from("project_equipment_usage").select("id,asset_code,asset_name,asset_id,project_id,use_date,hours_used,hourly_rate_snapshot,cost_total,work_note").eq("project_id", projectId).order("use_date", { ascending: false }).limit(50),
    supabase.from("project_additional_expenses").select("id,project_id,expense_date,category,description,external_reference,amount").eq("project_id", projectId).order("expense_date", { ascending: false }).limit(50),
    supabase.from("project_budget_changes").select("id,project_id,change_amount,reason,approved_at").eq("project_id", projectId).order("approved_at", { ascending: false }).limit(50),
    canManage ? supabase.from("assets").select("id,code,name,current_location_id").eq("asset_kind", "equipment").is("archived_at", null).in("status", ["available", "assigned", "in_use"]).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profitResult.error || equipmentResult.error || expensesResult.error || budgetsResult.error || assetResult.error || !profitResult.data?.[0])
    throw new Error("Unable to load project cost records.");
  const equipment = equipmentResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const [equipmentReversals, expenseReversals] = await Promise.all([
    equipment.length ? supabase.from("project_equipment_usage_reversals").select("usage_id,reason,reversed_at").in("usage_id", equipment.map((row) => row.id)) : Promise.resolve({ data: [], error: null }),
    expenses.length ? supabase.from("project_expense_reversals").select("expense_id,reason,reversed_at").in("expense_id", expenses.map((row) => row.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (equipmentReversals.error || expenseReversals.error) throw new Error("Unable to load cost corrections.");
  const equipmentReversalMap = new Map((equipmentReversals.data ?? []).map((row) => [row.usage_id, row]));
  const expenseReversalMap = new Map((expenseReversals.data ?? []).map((row) => [row.expense_id, row]));
  const assets = assetResult.data ?? [];
  const locationIds = [...new Set(assets.map((asset) => asset.current_location_id))];
  const { data: assetLocations, error: locationError } = locationIds.length
    ? await supabase.from("asset_locations").select("id,inventory_location_id").in("id", locationIds)
    : { data: [], error: null };
  if (locationError) throw new Error("Unable to load equipment locations.");
  const inventoryIds = (assetLocations ?? []).flatMap((item) => item.inventory_location_id ? [item.inventory_location_id] : []);
  const { data: inventoryLocations, error: inventoryError } = inventoryIds.length
    ? await supabase.from("inventory_locations").select("id,project_site_id").in("id", inventoryIds)
    : { data: [], error: null };
  if (inventoryError) throw new Error("Unable to load project equipment locations.");
  const siteIds = (inventoryLocations ?? []).flatMap((item) => item.project_site_id ? [item.project_site_id] : []);
  const { data: sites, error: siteError } = siteIds.length
    ? await supabase.from("project_sites").select("id,project_id").in("id", siteIds)
    : { data: [], error: null };
  if (siteError) throw new Error("Unable to load project sites.");
  const projectSiteIds = new Set((sites ?? []).filter((site) => site.project_id === projectId).map((site) => site.id));
  const inventorySiteMap = new Map((inventoryLocations ?? []).map((location) => [location.id, location.project_site_id]));
  const assetLocationMap = new Map((assetLocations ?? []).map((location) => [location.id, location.inventory_location_id]));
  const projectAssets = assets.filter((asset) => {
    const inventoryId = assetLocationMap.get(asset.current_location_id);
    return inventoryId ? projectSiteIds.has(inventorySiteMap.get(inventoryId) ?? "") : false;
  });
  const ratesResult = projectAssets.length ? await supabase.from("equipment_hour_rates").select("asset_id,hourly_rate,effective_start_date,effective_end_date").in("asset_id", projectAssets.map((asset) => asset.id)).order("effective_start_date", { ascending: false }) : { data: [], error: null };
  if (ratesResult.error) throw new Error("Unable to load equipment rates.");
  const latestRates = new Map<string, { hourly_rate: number; effective_start_date: string; effective_end_date: string | null }>();
  for (const rate of ratesResult.data ?? []) if (!latestRates.has(rate.asset_id)) latestRates.set(rate.asset_id, rate);
  return {
    profitability: profitResult.data[0],
    equipment: equipment.map((row) => ({ ...row, reversal: equipmentReversalMap.get(row.id) })),
    expenses: expenses.map((row) => ({ ...row, reversal: expenseReversalMap.get(row.id) })),
    budgetChanges: budgetsResult.data ?? [],
    assets: projectAssets.map((asset) => ({ ...asset, rate: latestRates.get(asset.id) })),
  };
}
