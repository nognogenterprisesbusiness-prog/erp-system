import { requireUser } from "@/lib/auth";
import { getInventoryBalances } from "@/lib/data/inventory";
import { csvAttachment } from "@/lib/export/csv";

export async function GET(request: Request): Promise<Response> {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const { balances } = await getInventoryBalances({
    query: params.get("q") ?? "",
    locationId: params.get("location") ?? "",
    kind: kind === "warehouse" || kind === "project_site" ? kind : "all",
    lowStock: params.get("low") === "true",
  });
  return csvAttachment(`nognog-inventory-${new Date().toISOString().slice(0, 10)}.csv`, ["SKU", "Material", "Location", "Location type", "On hand", "Reserved", "Available", "Unit", "Level"], balances.map((item) => [
    item.material?.code ?? "", item.material?.name ?? "", item.location?.name ?? "", item.location?.location_type ?? "", item.quantity_on_hand, item.reserved_quantity, item.available_quantity, item.material?.unitSymbol ?? "", item.available_quantity <= (item.material?.minimum_stock_level ?? 0) ? "Low" : "Available",
  ]));
}
