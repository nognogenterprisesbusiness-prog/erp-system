import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { getInventoryMaterials } from "@/lib/data/inventory";
import { csvAttachment } from "@/lib/export/csv";

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const category = uuidSchema.safeParse(params.get("category"));
  const filters: Parameters<typeof getInventoryMaterials>[0] = {
    query: params.get("q") ?? "", locationId: params.get("location") ?? "",
    categoryId: category.success ? category.data : "",
    status: params.get("status") === "inactive" ? "inactive" : params.get("status") === "any" ? "all" : "active",
    lowStock: params.get("low") === "true", includeValues: user.canViewLaborRates, pageSize: 500,
  };
  const first = await getInventoryMaterials(filters);
  const materials = [...first.rows];
  for (let page = 2; (page - 1) * 500 < first.count; page++) {
    materials.push(...(await getInventoryMaterials({ ...filters, page })).rows);
  }
  const location = first.locations.find((item) => item.id === first.selectedLocationId)?.name ?? "All locations";
  return csvAttachment(`nognog-inventory-${new Date().toISOString().slice(0, 10)}.csv`, [
    "SKU", "Material", "Location", "On hand", "Reserved", "Available", "Unit", "Level", "Stock by location",
    ...(user.canViewLaborRates ? ["Stock value (PHP)"] : []),
  ], materials.filter((item) => Number(item.quantity_on_hand) > 0).map((item) => [
    item.code, item.name, location, item.quantity_on_hand, item.reserved_quantity, item.available_quantity,
    item.unit_symbol, Number(item.available_quantity) <= Number(item.minimum_stock_level) ? "Low" : "Available",
    item.stockLocations.map((stock) => `${stock.name}: ${stock.onHand} ${item.unit_symbol} on hand, ${stock.available} available`).join("; "),
    ...(user.canViewLaborRates ? [item.stockValue ?? ""] : []),
  ]));
}
