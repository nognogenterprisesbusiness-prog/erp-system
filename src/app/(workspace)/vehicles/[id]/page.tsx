import { AssetExpenseHistory, VehicleDrivers } from "@/components/assets/asset-expense-history";
import { VehicleFuelHistory } from "@/components/assets/vehicle-fuel-history";
import { pageNumber } from "@/lib/data/pagination";
import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset, getAssetReferences, getEquipmentUsage, getVehicleFuelReceipts } from "@/lib/data/assets";

export default async function VehicleDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; eventPage?: string; usagePage?: string; fuelPage?: string; assetExpensePage?: string }>;
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
    <AssetDetail data={data} kind="vehicle" canManage={user.canManage} usage={usage} references={references} editing={filters.edit === "1"} operations={user.canViewLaborRates ? <>
{user.canManage && <VehicleDrivers assetId={id} />}
    {user.canViewLaborRates && <AssetExpenseHistory assetId={id} kind="vehicle" page={pageNumber(filters.assetExpensePage)} canManage={user.canManage} canAdd={data.asset.status !== "retired"} filters={{ eventPage: filters.eventPage ?? "1", usagePage: filters.usagePage ?? "1", fuelPage: filters.fuelPage ?? "1" }} />}
    {fuel && <VehicleFuelHistory assetId={id} data={fuel} />}
    </> : undefined} />
  </>;
}
