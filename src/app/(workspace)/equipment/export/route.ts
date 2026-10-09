import { assetStatuses } from "@nognog/domain";

import { requireUser } from "@/lib/auth";
import { getAssets } from "@/lib/data/assets";
import { csvAttachment } from "@/lib/export/csv";

export async function GET(request: Request): Promise<Response> {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const requestedStatus = params.get("status");
  const status: typeof assetStatuses[number] | "all" = requestedStatus && assetStatuses.some((item) => item === requestedStatus) ? requestedStatus as typeof assetStatuses[number] : "all";
  const filters = {
    kind: "equipment" as const,
    query: params.get("q") ?? "",
    categoryId: params.get("category") ?? "",
    locationId: params.get("location") ?? "",
    status,
    includeArchived: status === "retired",
  };
  const assets = [] as Awaited<ReturnType<typeof getAssets>>;
  for (let page = 1; ; page += 1) {
    const batch = await getAssets({ ...filters, page, pageSize: 100 });
    assets.push(...batch.slice(0, 100));
    if (batch.length <= 100) break;
  }
  return csvAttachment(`nognog-equipment-${new Date().toISOString().slice(0, 10)}.csv`, ["Asset code", "SKU", "Equipment", "Classification", "Type", "Brand", "Model", "Serial number", "Current location", "Status"], assets.map((asset) => [
    asset.code, asset.equipment?.sku ?? "", asset.name, asset.categoryName, asset.equipment?.equipment_type ?? "", asset.brand ?? "", asset.model ?? "", asset.equipment?.serial_number ?? "", asset.location?.displayName ?? "", asset.status.replaceAll("_", " "),
  ]));
}
