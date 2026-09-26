import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TrendSeries } from "@/components/dashboard/trend-chart";

export async function getDashboardConsumption() {
  const client = await createClient();
  const currentMonth = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Manila" }).formatToParts(new Date());
  const year = Number(currentMonth.find((part) => part.type === "year")?.value);
  const month = Number(currentMonth.find((part) => part.type === "month")?.value) - 1;
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, month - 5 + index, 1)).toISOString().slice(0, 10));
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  const totals = new Map<string, { materialId: string; unitId: string; values: number[] }>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("inventory_transactions").select("id,material_id,unit_of_measure_id,transaction_date,quantity").eq("transaction_type", "MATERIAL_CONSUMPTION").gte("transaction_date", months[0]).lt("transaction_date", end).order("id").range(offset, offset + 499);
    if (error) throw new Error("Unable to load monthly material consumption.");
    const rows = data ?? [];
    const reversedIds = new Set<string>();
    const reversalBatches = await Promise.all(Array.from({ length: Math.ceil(rows.length / 100) }, (_, index) => client.from("inventory_transactions").select("reversal_of").in("reversal_of", rows.slice(index * 100, index * 100 + 100).map((row) => row.id))));
    for (const result of reversalBatches) {
      if (result.error) throw new Error("Unable to reconcile monthly material consumption.");
      for (const row of result.data ?? []) if (row.reversal_of) reversedIds.add(row.reversal_of);
    }
    for (const row of rows) {
      if (reversedIds.has(row.id)) continue;
      const index = months.findIndex((value) => value.slice(0, 7) === row.transaction_date.slice(0, 7));
      if (index < 0) continue;
      const key = `${row.material_id}:${row.unit_of_measure_id}`;
      const total = totals.get(key) ?? { materialId: row.material_id, unitId: row.unit_of_measure_id, values: months.map(() => 0) };
      total.values[index] += Math.abs(Number(row.quantity));
      totals.set(key, total);
    }
    if (rows.length < 500) break;
  }
  const materialNames = new Map<string, string>();
  const unitNames = new Map<string, string>();
  const materialIds = [...new Set([...totals.values()].map((row) => row.materialId))];
  const unitIds = [...new Set([...totals.values()].map((row) => row.unitId))];
  for (let start = 0; start < materialIds.length; start += 100) {
    const { data, error } = await client.from("materials").select("id,name,code").in("id", materialIds.slice(start, start + 100));
    if (error) throw new Error("Unable to resolve chart materials.");
    for (const row of data ?? []) materialNames.set(row.id, `${row.name} · ${row.code}`);
  }
  for (let start = 0; start < unitIds.length; start += 100) {
    const { data, error } = await client.from("units_of_measure").select("id,symbol").in("id", unitIds.slice(start, start + 100));
    if (error) throw new Error("Unable to resolve chart units.");
    for (const row of data ?? []) unitNames.set(row.id, row.symbol);
  }
  const series: TrendSeries[] = [...totals].map(([id, row]) => ({ id, label: materialNames.get(row.materialId) ?? "Unavailable material", unit: unitNames.get(row.unitId) ?? row.unitId, values: row.values }));
  return { months, series };
}
