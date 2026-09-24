import { assetStatuses } from "@nognog/domain";

import { requireUser } from "@/lib/auth";
import { getAssets } from "@/lib/data/assets";
import { csvAttachment } from "@/lib/export/csv";

export async function GET(request: Request): Promise<Response> {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const requestedStatus = params.get("status");
  const status = requestedStatus && assetStatuses.some((item) => item === requestedStatus) ? requestedStatus as typeof assetStatuses[number] : "all";
  const assets = await getAssets({
    kind: "equipment",
    query: params.get("q") ?? "",
    categoryId: params.get("category") ?? "",
    locationId: params.get("location") ?? "",
    status,
    includeArchived: status === "retired",
  });
  return csvAttachment(`nognog-equipment-${new Date().toISOString().slice(0, 10)}.csv`, ["Asset code", "SKU", "Equipment", "Classification", "Type", "Brand", "Model", "Serial number", "Current location", "Status"], assets.map((asset) => [
    asset.code, asset.equipment?.sku ?? "", asset.name, asset.categoryName, asset.equipment?.equipment_type ?? "", asset.brand, asset.model, asset.equipment?.serial_number ?? "", asset.location?.displayName ?? "", asset.status.replaceAll("_", " "),
  ]));
}
