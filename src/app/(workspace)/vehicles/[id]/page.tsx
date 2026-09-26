import { AssetDetail } from "@/components/assets/asset-detail";
import { requireUser } from "@/lib/auth";
import { getAsset, getAssetReferences } from "@/lib/data/assets";
export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) { const { id } = await params; const user = await requireUser(); const [data, references] = await Promise.all([getAsset(id, "vehicle"), user.canManage ? getAssetReferences("vehicle") : Promise.resolve(undefined)]); return <AssetDetail data={data} kind="vehicle" canManage={user.canManage} references={references} editing={(await searchParams).edit === "1"} />; }
