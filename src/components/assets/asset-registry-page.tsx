import { ListFilterBar } from "@/components/ui/list-filter-bar";
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
import { requireUser } from "@/lib/auth";
import { getAssetReferences, getAssets } from "@/lib/data/assets";
import type { AssetKind, AssetStatus } from "@/types/database";

const statuses: Array<AssetStatus | "all"> = ["all", ...assetStatuses];
export async function AssetRegistryPage({ kind, searchParams }: { kind: AssetKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) { const params = await searchParams; const query = typeof params.q === "string" ? params.q : ""; const parsedCategory = uuidSchema.safeParse(params.category); const categoryId = parsedCategory.success ? parsedCategory.data : ""; const parsedLocation = uuidSchema.safeParse(params.location); const locationId = parsedLocation.success ? parsedLocation.data : ""; const status = typeof params.status === "string" && statuses.includes(params.status as typeof statuses[number]) ? params.status as typeof statuses[number] : "all"; const rawPage = Number(params.page); const page = Number.isInteger(rawPage) ? Math.max(1, Math.min(1000, rawPage)) : 1; const [user, assets, references] = await Promise.all([requireUser(), getAssets({ kind, query, categoryId, locationId, status, includeArchived: status === "retired", page, pageSize: 24 }), getAssetReferences(kind)]); const isEquipment = kind === "equipment"; const base = isEquipment ? "/equipment" : "/vehicles"; const exportParams = new URLSearchParams(); if (query) exportParams.set("q", query); if (categoryId) exportParams.set("category", categoryId); if (locationId) exportParams.set("location", locationId); if (status !== "all") exportParams.set("status", status); const exportHref = `${base}/export?${exportParams.toString()}`; return <>
  <PageHeader eyebrow="Reusable asset control" title={isEquipment ? "Equipment" : "Vehicles"} description={isEquipment ? "Availability, location, condition, and registry history without mixing assets into material stock." : "A shared asset identity for fleet records, mileage, status, and current location."} action={<div className="flex flex-wrap gap-2">{isEquipment && <Button variant="outline" asChild><a href={exportHref}><HugeiconsIcon icon={Download04Icon} size={17} />Export CSV</a></Button>}{user.canManage && <><Button variant="outline" asChild><Link href="/equipment/categories">Classifications</Link></Button><RecordCreateDialog title={isEquipment ? "Add equipment" : "Add vehicle"} initialOpen={params.create === "1"} closeHref={`${base}?${exportParams}`}><AssetForm kind={kind} {...references} /></RecordCreateDialog></>}</div>} />
  <ListFilterBar viewKey={isEquipment ? "equipment" : "vehicles"} viewTitle={isEquipment ? "Equipment" : "Vehicles"}>
    <SearchField name="q" label={`Search ${kind}`} defaultValue={query} placeholder={`Search ${kind}, code, brand, or model`} />
    <SelectPicker name="category" label="Classification" defaultValue={categoryId || "all"} options={[{ value: "all", label: "All classifications" }, ...references.categories.map((item) => ({ value: item.id, label: item.name }))]} />
    <SelectPicker name="location" label="Current location" defaultValue={locationId || "all"} options={[{ value: "all", label: "All locations" }, ...references.locations.map((item) => ({ value: item.id, label: item.displayName }))]} />
    <SelectPicker name="status" label="Operational status" defaultValue={status} options={statuses.map((item) => ({ value: item, label: item === "all" ? "All statuses" : item.replaceAll("_", " ") }))} />
  </ListFilterBar>
  <AssetCards assets={assets.slice(0, 24)} kind={kind} canManage={user.canManage} {...references} />
  {(page > 1 || assets.length > 24) && <nav aria-label={`${kind} pages`} className="mt-4 flex items-center justify-end gap-3"><span className="text-xs text-slate-500">Page {page}</span>{page > 1 && <Button variant="outline" size="sm" asChild><Link href={`${base}?${exportParams}&page=${page - 1}`}>Previous</Link></Button>}{assets.length > 24 && <Button variant="outline" size="sm" asChild><Link href={`${base}?${exportParams}&page=${page + 1}`}>Next</Link></Button>}</nav>}
  </>; }
