import { pageNumber } from "@/lib/data/pagination";
import { AssetDetail } from "@/components/assets/asset-detail";
import { AssetExpenseHistory } from "@/components/assets/asset-expense-history";
import { requireUser } from "@/lib/auth";
import { getAsset, getEquipmentUsage, getAssetReferences } from "@/lib/data/assets";

export default async function EquipmentDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; section?: string; eventPage?: string; usagePage?: string; assetExpensePage?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const user = await requireUser();
  const [data, usage, references] = await Promise.all([
    getAsset(id, "equipment", pageNumber(filters.eventPage)),
    user.canViewLaborRates ? getEquipmentUsage(id, pageNumber(filters.usagePage)) : undefined,
    user.canManage ? getAssetReferences() : undefined,
  ]);
  return <AssetDetail data={data} kind="equipment" canManage={user.canManage} usage={usage} references={references} editing={filters.edit === "1"} initialSection={filters.section}
    expenses={user.canViewLaborRates ? <AssetExpenseHistory assetId={id} kind="equipment" page={pageNumber(filters.assetExpensePage)} canManage={user.canManage} canAdd={data.asset.status !== "retired"} filters={{ eventPage: filters.eventPage ?? "1", usagePage: filters.usagePage ?? "1" }} /> : undefined} />;
}
