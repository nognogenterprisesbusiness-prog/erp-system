import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset } from "@/lib/data/assets";
export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const [user, data] = await Promise.all([requireUser(), getAsset(id, "equipment")]); return <AssetDetail data={data} kind="equipment" canManage={user.canManage} />; }
