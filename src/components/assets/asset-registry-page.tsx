import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { Suspense } from "react";
import { AssetForm } from "@/components/assets/asset-form";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { assetStatuses, uuidSchema } from "@nognog/domain";
import { AssetCards } from "@/components/assets/asset-cards";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { RecordListSkeleton } from "@/components/ui/record-list-view";
import { requireUser } from "@/lib/auth";
import { getAssetReferences, getAssets } from "@/lib/data/assets";
import type { AssetKind, AssetStatus } from "@/types/database";
import { InventoryTypeTabs } from "@/components/inventory/inventory-type-tabs";

const statuses: Array<AssetStatus | "all"> = ["all", ...assetStatuses];
export async function AssetRegistryPage({ kind, searchParams, inventoryMode = false }: { kind: AssetKind; searchParams: Promise<Record<string, string | string[] | undefined>>; inventoryMode?: boolean }) { const params = await searchParams; const query = typeof params.q === "string" ? params.q : ""; const parsedLocation = uuidSchema.safeParse(params.location); const locationId = parsedLocation.success ? parsedLocation.data : ""; const status = typeof params.status === "string" && statuses.includes(params.status as typeof statuses[number]) ? params.status as typeof statuses[number] : "all"; const rawPage = Number(params.page); const page = Number.isInteger(rawPage) ? Math.max(1, Math.min(1000, rawPage)) : 1; const assetsPromise = getAssets({ kind, query, locationId, status, includeArchived: status === "retired", page, pageSize: 24 }); const [user, references] = await Promise.all([requireUser(), getAssetReferences()]); const isEquipment = kind === "equipment"; const originalBase = isEquipment ? "/equipment" : "/vehicles"; const base = inventoryMode ? "/inventory" : originalBase; const exportParams = new URLSearchParams(); if (inventoryMode) exportParams.set("type", kind); if (query) exportParams.set("q", query); if (locationId) exportParams.set("location", locationId); if (status !== "all") exportParams.set("status", status); const exportHref = `${originalBase}/export?${exportParams.toString()}`; return <>
  <PageHeader eyebrow={inventoryMode ? undefined : "Reusable asset control"} title={isEquipment ? "Equipment" : "Vehicles"} description={isEquipment ? "Equipment availability, location and condition." : "Vehicles, their availability and current location."} action={<div className="flex flex-wrap gap-2">{isEquipment && <Button variant="outline" asChild><a href={exportHref}><HugeiconsIcon icon={Download04Icon} size={17} />Export CSV</a></Button>}{user.canManage && <RecordCreateDialog title={isEquipment ? "Add equipment" : "Add vehicle"} initialOpen={params.create === "1"} closeHref={`${base}?${exportParams}`}><AssetForm kind={kind} {...references} /></RecordCreateDialog>}</div>} />
  {inventoryMode && <InventoryTypeTabs active={kind} />}
  <ListFilterBar viewKey={isEquipment ? "equipment" : "vehicles"} viewTitle={isEquipment ? "Equipment" : "Vehicles"}>
    {inventoryMode && <input type="hidden" name="type" value={kind} />}
    <SearchField key={query} name="q" label={`Search ${kind}`} defaultValue={query} placeholder={isEquipment ? "Search equipment, code, brand, or model" : "Search vehicle name or code"} />
    <SelectPicker name="location" label="Current location" defaultValue={locationId || "all"} options={[{ value: "all", label: "All locations" }, ...references.locations.map((item) => ({ value: item.id, label: item.displayName }))]} />
    <SelectPicker name="status" label="Operational status" defaultValue={status} options={statuses.map((item) => ({ value: item, label: item === "all" ? "All statuses" : item.replaceAll("_", " ") }))} />
  </ListFilterBar>
  <Suspense key={`${kind}:${query}:${locationId}:${status}:${page}`} fallback={<RecordListSkeleton storageKey={kind === "equipment" ? "equipment" : "vehicles"} columns={isEquipment ? 7 : 6} />}>
    <AssetRegistryResults assetsPromise={assetsPromise} kind={kind} canManage={user.canManage} references={references} page={page} base={base} exportParams={exportParams.toString()} />
  </Suspense>
  </>; }

async function AssetRegistryResults({ assetsPromise, kind, canManage, references, page, base, exportParams }: { assetsPromise: ReturnType<typeof getAssets>; kind: AssetKind; canManage: boolean; references: Awaited<ReturnType<typeof getAssetReferences>>; page: number; base: string; exportParams: string }) {
  const assets = await assetsPromise;
  return <><AssetCards assets={assets.slice(0, 24)} kind={kind} canManage={canManage} {...references} />
  {(page > 1 || assets.length > 24) && <nav aria-label={`${kind} pages`} className="mt-4 flex items-center justify-end gap-3"><span className="text-xs text-slate-500">Page {page}</span>{page > 1 && <Button variant="outline" size="sm" asChild><Link href={`${base}?${exportParams}&page=${page - 1}`}>Previous</Link></Button>}{assets.length > 24 && <Button variant="outline" size="sm" asChild><Link href={`${base}?${exportParams}&page=${page + 1}`}>Next</Link></Button>}</nav>}</>;
}
