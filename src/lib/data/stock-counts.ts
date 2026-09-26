import "server-only";
import { createClient } from "@/lib/supabase/server";
import { HISTORY_PAGE_SIZE } from "./pagination";

export async function getStockCounts(locationId: string, page = 1, visibleMaterialIds: string[] = []) {
  const supabase = await createClient();
  const [recent, pending] = await Promise.all([
    supabase.from("inventory_stock_counts").select("*", { count: "exact" }).eq("inventory_location_id", locationId)
      .order("counted_at", { ascending: false }).order("id")
      .range((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE - 1),
    visibleMaterialIds.length ? supabase.from("inventory_stock_counts").select("material_id")
      .eq("inventory_location_id", locationId).eq("status", "pending").in("material_id", visibleMaterialIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (pending.error || recent.error) throw new Error("Unable to load stock counts.");
  const counts = recent.data ?? [];
  const transactionIds = counts.flatMap((count) => count.transaction_id ? [count.transaction_id] : []);
  const materialIds = [...new Set(counts.map((count) => count.material_id))];
  const [reversals, materials] = await Promise.all([
    transactionIds.length ? supabase.from("inventory_transactions").select("reversal_of").in("reversal_of", transactionIds) : Promise.resolve({ data: [], error: null }),
    materialIds.length ? supabase.from("materials").select("id,code,name").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reversals.error || materials.error) throw new Error("Unable to load stock count details.");
  const reversedIds = new Set((reversals.data ?? []).map((row) => row.reversal_of));
  return {
    counts: counts.map((count) => ({ ...count, reversed: count.transaction_id ? reversedIds.has(count.transaction_id) : false })),
    count: recent.count ?? 0,
    materials: materials.data ?? [],
    pendingMaterialIds: new Set((pending.data ?? []).map((row) => row.material_id)),
  };
}
