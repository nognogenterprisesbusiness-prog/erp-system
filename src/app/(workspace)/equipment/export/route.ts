import { assetStatuses } from "@nognog/domain";

import { requireUser } from "@/lib/auth";
import { getAssets } from "@/lib/data/assets";
import { streamCsvAttachment } from "@/lib/export/csv";

export async function GET(request: Request): Promise<Response> {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const requestedStatus = params.get("status");
  const status: typeof assetStatuses[number] | "all" = requestedStatus && assetStatuses.some((item) => item === requestedStatus) ? requestedStatus as typeof assetStatuses[number] : "all";
  const filters = {
    kind: "equipment" as const,
    query: params.get("q") ?? "",
    locationId: params.get("location") ?? "",
    status,
    includeArchived: status === "retired",
  };
  async function* batches() {
    for (let page = 1; ; page++) {
      const batch = await getAssets({ ...filters, page, pageSize: 100 });
      yield batch.slice(0, 100).map(asset => [asset.code, asset.equipment?.sku ?? "", asset.name, asset.equipment?.equipment_type ?? "", asset.brand ?? "", asset.model ?? "", asset.equipment?.serial_number ?? "", asset.location?.displayName ?? "", asset.status.replaceAll("_", " ")]);
      if (batch.length <= 100) return;
    }
  }
  return streamCsvAttachment(`nognog-equipment-${new Date().toISOString().slice(0, 10)}.csv`, ["Asset code", "SKU", "Equipment", "Type", "Brand", "Model", "Serial number", "Current location", "Status"], batches());
}
