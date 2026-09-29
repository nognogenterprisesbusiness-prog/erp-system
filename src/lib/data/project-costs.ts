import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProjectEquipmentChoices } from "./assets";
import { readByIds } from "./read-all-pages";

export async function getProjectProfitability(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_profitability", { p_project_id: projectId });
  if (error) throw new Error(`Unable to load project profitability: ${error.message}`, { cause: error });
  if (!data?.[0]) throw new Error("No project profitability record was returned.");
  return data[0];
}

export async function getProjectCostData(projectId: string, canManage: boolean, pages = { equipment: 1, expenses: 1, budgets: 1 }) {
  const supabase = await createClient();
  const [profitResult, equipmentResult, expensesResult, budgetsResult, assetResult] = await Promise.all([
    supabase.rpc("get_project_profitability", { p_project_id: projectId }),
    supabase.from("project_equipment_usage").select("id,asset_code,asset_name,asset_id,project_id,use_date,hours_used,hourly_rate_snapshot,cost_total,work_note,start_photo_path,end_photo_path", { count: "exact" }).eq("project_id", projectId).order("use_date", { ascending: false }).order("id").range((pages.equipment - 1) * 20, pages.equipment * 20 - 1),
    supabase.from("project_additional_expenses").select("id,project_id,expense_date,category,description,external_reference,amount", { count: "exact" }).eq("project_id", projectId).order("expense_date", { ascending: false }).order("id").range((pages.expenses - 1) * 20, pages.expenses * 20 - 1),
    supabase.from("project_budget_changes").select("id,project_id,change_amount,reason,approved_at", { count: "exact" }).eq("project_id", projectId).order("approved_at", { ascending: false }).order("id").range((pages.budgets - 1) * 20, pages.budgets * 20 - 1),
    canManage ? getProjectEquipmentChoices(projectId) : Promise.resolve([]),
  ]);
  if (profitResult.error || equipmentResult.error || expensesResult.error || budgetsResult.error || !profitResult.data?.[0])
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
  const projectAssets = assetResult;
  const rates = await readByIds(projectAssets.map((asset) => asset.id), (ids, from, to) => supabase.from("equipment_hour_rates").select("asset_id,hourly_rate,effective_start_date,effective_end_date").in("asset_id", ids).order("effective_start_date", { ascending: false }).order("id").range(from, to), "equipment rates");
  const latestRates = new Map<string, { hourly_rate: number; effective_start_date: string; effective_end_date: string | null }>();
  for (const rate of rates) if (!latestRates.has(rate.asset_id)) latestRates.set(rate.asset_id, rate);
  return {
    counts: { equipment: equipmentResult.count ?? 0, expenses: expensesResult.count ?? 0, budgets: budgetsResult.count ?? 0 },
    profitability: profitResult.data[0],
    equipment: equipment.map((row) => ({ ...row, reversal: equipmentReversalMap.get(row.id) })),
    expenses: expenses.map((row) => ({ ...row, reversal: expenseReversalMap.get(row.id) })),
    budgetChanges: budgetsResult.data ?? [],
    assets: projectAssets.map((asset) => ({ ...asset, rate: latestRates.get(asset.id) })),
  };
}
