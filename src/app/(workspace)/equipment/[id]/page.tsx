import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset, getEquipmentUsage } from "@/lib/data/assets";
export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const user = await requireUser(); const [data, usage] = await Promise.all([getAsset(id, "equipment"), user.canViewLaborRates ? getEquipmentUsage(id) : Promise.resolve(undefined)]); return <AssetDetail data={data} kind="equipment" canManage={user.canManage} usage={usage} />; }
