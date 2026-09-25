import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getStockCounts(locationId: string) {
  const supabase = await createClient();
  const [pending, recent] = await Promise.all([
    supabase.from("inventory_stock_counts").select("*").eq("inventory_location_id", locationId)
      .eq("status", "pending").order("counted_at", { ascending: false }).limit(500),
    supabase.from("inventory_stock_counts").select("*").eq("inventory_location_id", locationId)
      .order("counted_at", { ascending: false }).limit(100),
  ]);
  if (pending.error || recent.error) throw new Error("Unable to load stock counts.");
  const counts = [...new Map([...(pending.data ?? []), ...(recent.data ?? [])].map((row) => [row.id, row])).values()]
    .toSorted((a, b) => a.status === b.status ? b.counted_at.localeCompare(a.counted_at) : a.status === "pending" ? -1 : 1);
  const transactionIds = counts.flatMap((count) => count.transaction_id ? [count.transaction_id] : []);
  const reversals = transactionIds.length ? await supabase.from("inventory_transactions")
    .select("reversal_of").in("reversal_of", transactionIds) : { data: [], error: null };
  if (reversals.error) throw new Error("Unable to load stock count corrections.");
  const reversedIds = new Set((reversals.data ?? []).map((row) => row.reversal_of));
  return counts.map((count) => ({ ...count, reversed: count.transaction_id ? reversedIds.has(count.transaction_id) : false }));
}
