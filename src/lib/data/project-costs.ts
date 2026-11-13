import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProjectEquipmentChoices } from "./assets";
import { readByIds } from "./read-all-pages";
import { philippinesDate } from "@nognog/domain";

export async function getProjectProfitability(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_profitability", { p_project_id: projectId });
  if (error) throw new Error(`Unable to load project profitability: ${error.message}`, { cause: error });
  if (!data?.[0]) throw new Error("No project profitability record was returned.");
  return data[0];
}

export async function getProjectExpenseBreakdown(projectId: string) {
  const supabase = await createClient();
  const result = await supabase.rpc("get_project_expense_breakdown", { p_project_id: projectId });
  if (result.error) throw new Error("Unable to load the project expense breakdown.", { cause: result.error });
  return result.data;
}

export async function getProjectCostData(projectId: string, canManage: boolean, pages = { equipment: 1, expenses: 1, budgets: 1 }, expenseBucket = "all") {
  const supabase = await createClient();
  const [equipmentResult, expensesResult, budgetsResult, assetResult] = await Promise.all([
    supabase.from("project_equipment_usage").select("id,asset_code,asset_name,asset_id,project_id,use_date,hours_used,hourly_rate_snapshot,cost_total,work_note,start_photo_path,end_photo_path", { count: "exact" }).eq("project_id", projectId).order("use_date", { ascending: false }).order("id").range((pages.equipment - 1) * 20, pages.equipment * 20 - 1),
    supabase.rpc("get_project_expense_entries", { p_project_id: projectId, p_bucket: expenseBucket, p_offset: (pages.expenses - 1) * 20, p_limit: 20 }),
    supabase.from("project_budget_changes").select("id,project_id,change_amount,reason,approved_at", { count: "exact" }).eq("project_id", projectId).order("approved_at", { ascending: false }).order("id").range((pages.budgets - 1) * 20, pages.budgets * 20 - 1),
    canManage ? getProjectEquipmentChoices(projectId) : Promise.resolve([]),
  ]);
  if (equipmentResult.error || expensesResult.error || budgetsResult.error)
    throw new Error("Unable to load project cost records.");
  const equipment = equipmentResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const equipmentReversals = equipment.length ? await supabase.from("project_equipment_usage_reversals").select("usage_id,reason,reversed_at").in("usage_id", equipment.map((row) => row.id)) : { data: [], error: null };
  if (equipmentReversals.error) throw new Error("Unable to load cost corrections.");
  const equipmentReversalMap = new Map((equipmentReversals.data ?? []).map((row) => [row.usage_id, row]));
  const projectAssets = assetResult;
  const today = philippinesDate();
  const rates = await readByIds(projectAssets.map((asset) => asset.id), (ids, from, to) => supabase.from("equipment_hour_rates").select("asset_id,hourly_rate,effective_start_date,effective_end_date").in("asset_id", ids).order("effective_start_date", { ascending: false }).order("id").range(from, to), "equipment rates");
  const latestRates = new Map<string, { hourly_rate: number; effective_start_date: string; effective_end_date: string | null }>();
  for (const rate of rates) if (rate.effective_start_date <= today && (!rate.effective_end_date || rate.effective_end_date >= today) && !latestRates.has(rate.asset_id)) latestRates.set(rate.asset_id, rate);
  return {
    counts: { equipment: equipmentResult.count ?? 0, expenses: Number(expenses[0]?.total_count ?? 0), budgets: budgetsResult.count ?? 0 },
    equipment: equipment.map((row) => ({ ...row, reversal: equipmentReversalMap.get(row.id) })),
    expenses: expenses.map((row) => ({ ...row, reversal: row.reversed_at ? { reason: row.reversal_reason, reversed_at: row.reversed_at } : undefined })),
    budgetChanges: budgetsResult.data ?? [],
    assets: projectAssets.map((asset) => ({ ...asset, rate: latestRates.get(asset.id) })),
  };
}
