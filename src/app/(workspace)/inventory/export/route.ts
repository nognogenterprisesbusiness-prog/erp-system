import { requireUser } from "@/lib/auth";
import { getInventoryMaterials } from "@/lib/data/inventory";
import { streamCsvAttachment } from "@/lib/export/csv";
import { inventoryScopeLabel, parseInventoryScope } from "@/lib/inventory/scope";

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const filters: Parameters<typeof getInventoryMaterials>[0] = {
    query: params.get("q") ?? "", locationId: params.get("location") ?? "", scope: parseInventoryScope(params.get("scope")),
    status: params.get("status") === "inactive" ? "inactive" : params.get("status") === "any" ? "all" : "active",
    lowStock: params.get("low") === "true", includeValues: user.canViewLaborRates, pageSize: 500,
  };
  const first = await getInventoryMaterials(filters);
  const location = first.locations.find((item) => item.id === first.selectedLocationId)?.name ?? inventoryScopeLabel(first.scope);
  async function* batches() {
    for (let page = 1; ; page++) {
      const result = page === 1 ? first : await getInventoryMaterials({ ...filters, page }, first.locations);
      if (result.page !== page) return;
      yield result.rows.filter(item => Number(item.quantity_on_hand) > 0).map(item => [item.code, item.name, location, item.quantity_on_hand, item.reserved_quantity, item.available_quantity, item.unit_symbol, Number(item.available_quantity) <= Number(item.minimum_stock_level) ? "Low" : "Available", item.stockLocations.map(stock => `${stock.name}: ${stock.onHand} ${item.unit_symbol} on hand, ${stock.available} available`).join("; "), ...(user.canViewLaborRates ? [item.stockValue ?? ""] : [])]);
      if (page * 500 >= first.count || !result.rows.length) return;
    }
  }
  return streamCsvAttachment(`nognog-inventory-${new Date().toISOString().slice(0, 10)}.csv`, [
    "SKU", "Material", "Location", "On hand", "Reserved", "Available", "Unit", "Level", "Stock by location",
    ...(user.canViewLaborRates ? ["Stock value (PHP)"] : []),
  ], batches());
}
