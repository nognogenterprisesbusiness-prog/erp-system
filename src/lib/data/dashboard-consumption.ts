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
    const { data, error } = await client.rpc("get_monthly_material_consumption", { p_from: months[0], p_to: end }).order("month").order("material_id").order("unit_id").range(offset, offset + 499);
    if (error) throw new Error("Unable to load monthly material consumption.");
    const rows = data ?? [];
    for (const row of rows) {
      const index = months.findIndex(value => value.slice(0, 7) === row.month);
      if (index < 0) continue;
      const key = `${row.material_id}:${row.unit_id}`;
      const total = totals.get(key) ?? { materialId: row.material_id, unitId: row.unit_id, values: months.map(() => 0) };
      total.values[index] += Number(row.quantity);
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
    for (const row of data ?? []) materialNames.set(row.id, row.name);
  }
  for (let start = 0; start < unitIds.length; start += 100) {
    const { data, error } = await client.from("units_of_measure").select("id,symbol").in("id", unitIds.slice(start, start + 100));
    if (error) throw new Error("Unable to resolve chart units.");
    for (const row of data ?? []) unitNames.set(row.id, row.symbol);
  }
  const series: TrendSeries[] = [...totals].map(([id, row]) => ({ id, label: materialNames.get(row.materialId) ?? "Unavailable material", unit: unitNames.get(row.unitId) ?? row.unitId, values: row.values }));
  return { months, series };
}
