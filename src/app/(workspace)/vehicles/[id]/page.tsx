import { VehicleDrivers } from "@/components/assets/vehicle-drivers";
import { AssetExpenseHistory } from "@/components/assets/asset-expense-history";
import { VehicleFuelHistory } from "@/components/assets/vehicle-fuel-history";
import { pageNumber } from "@/lib/data/pagination";
import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset, getEquipmentUsage, getVehicleFuelReceipts } from "@/lib/data/assets";

export default async function VehicleDetailPage({ params, searchParams, editOnly = false }: {
  params: Promise<{ id: string }>;
  editOnly?: boolean;
  searchParams: Promise<{ edit?: string; section?: string; driverSearch?: string; eventPage?: string; usagePage?: string; fuelPage?: string; assetExpensePage?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const user = await requireUser();
  const [data, usage, fuel] = await Promise.all([
    getAsset(id, "vehicle", pageNumber(filters.eventPage)),
    user.canViewLaborRates ? getEquipmentUsage(id, pageNumber(filters.usagePage)) : undefined,
    user.canViewLaborRates ? getVehicleFuelReceipts(id, pageNumber(filters.fuelPage)) : undefined,
  ]);
  return <AssetDetail editOnly={editOnly} data={data} kind="vehicle" canManage={user.canManage} usage={usage} editing={filters.edit === "1"} initialSection={filters.section}
    drivers={user.canManage ? <VehicleDrivers assetId={id} assetName={data.asset.name} search={filters.driverSearch} canAssign={data.asset.status !== "retired" && !data.asset.archived_at} /> : undefined}
    expenses={user.canViewLaborRates ? <AssetExpenseHistory assetId={id} kind="vehicle" page={pageNumber(filters.assetExpensePage)} canManage={user.canManage} canAdd={data.asset.status !== "retired"} filters={{ eventPage: filters.eventPage ?? "1", usagePage: filters.usagePage ?? "1", fuelPage: filters.fuelPage ?? "1" }} /> : undefined}
    projectFuel={fuel ? <VehicleFuelHistory assetId={id} data={fuel} /> : undefined} />;
}
