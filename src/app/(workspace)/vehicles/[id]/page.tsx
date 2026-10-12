import { VehicleFuelHistory } from "@/components/assets/vehicle-fuel-history";
import { pageNumber } from "@/lib/data/pagination";
import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset, getAssetReferences, getEquipmentUsage, getVehicleFuelReceipts } from "@/lib/data/assets";

export default async function VehicleDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; eventPage?: string; usagePage?: string; fuelPage?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const user = await requireUser();
  const [data, usage, references, fuel] = await Promise.all([
    getAsset(id, "vehicle", pageNumber(filters.eventPage)),
    user.canViewLaborRates ? getEquipmentUsage(id, pageNumber(filters.usagePage)) : undefined,
    user.canManage ? getAssetReferences() : undefined,
    user.canViewLaborRates ? getVehicleFuelReceipts(id, pageNumber(filters.fuelPage)) : undefined,
  ]);
  return <>
    <AssetDetail data={data} kind="vehicle" canManage={user.canManage} usage={usage} references={references} editing={filters.edit === "1"} />
    {fuel && <VehicleFuelHistory assetId={id} data={fuel} />}
  </>;
}
