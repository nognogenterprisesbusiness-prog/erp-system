import { requireUser } from "@/lib/auth";
import { getInventoryBalances } from "@/lib/data/inventory";
import { csvAttachment } from "@/lib/export/csv";

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser();
  const withValues = user.canViewLaborRates;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const filters: Parameters<typeof getInventoryBalances>[0] = {
    query: params.get("q") ?? "",
    locationId: params.get("location") ?? "",
    kind: kind === "warehouse" || kind === "project_site" ? kind : "all" as const,
    lowStock: params.get("low") === "true",
    includeValues: withValues,
  };
  const first = await getInventoryBalances({ ...filters, pageSize: 500 });
  const balances = [...first.balances];
  for (let page = 2; (page - 1) * 500 < first.count; page++) {
    balances.push(...(await getInventoryBalances({ ...filters, page, pageSize: 500 })).balances);
  }
  return csvAttachment(`nognog-inventory-${new Date().toISOString().slice(0, 10)}.csv`, ["SKU", "Material", "Location", "Location type", "On hand", "Reserved", "Available", "Unit", "Level", ...(withValues ? ["Stock value (PHP)"] : [])], balances.map((item) => [
    item.material?.code ?? "", item.material?.name ?? "", item.location?.name ?? "", item.location?.location_type ?? "", item.quantity_on_hand, item.reserved_quantity, item.available_quantity, item.material?.unitSymbol ?? "", item.available_quantity <= (item.material?.minimum_stock_level ?? 0) ? "Low" : "Available",
    ...(withValues ? [item.stockValue ?? ""] : []),
  ]));
}
