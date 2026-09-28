import { pageNumber } from "@/lib/data/pagination";
import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset, getAssetReferences, getEquipmentUsage } from "@/lib/data/assets";
export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; eventPage?: string; usagePage?: string }> }) { const { id } = await params; const filters = await searchParams; const user = await requireUser(); const [data, usage, references] = await Promise.all([getAsset(id, "vehicle", pageNumber(filters.eventPage)), user.canViewLaborRates ? getEquipmentUsage(id, pageNumber(filters.usagePage)) : Promise.resolve(undefined), user.canManage ? getAssetReferences("vehicle") : Promise.resolve(undefined)]); return <AssetDetail data={data} kind="vehicle" canManage={user.canManage} usage={usage} references={references} editing={filters.edit === "1"} />; }
