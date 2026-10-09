import { IntentLink as Link } from "@/components/layout/intent-link";
import { ExcavatorIcon, Car01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RecordThumbnail } from "@/components/ui/record-thumbnail";
import { RecordListView } from "@/components/ui/record-list-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { AssetStatusBadge } from "./asset-status-badge";
import { AssetCardActions } from "./asset-card-actions";
import type { AssetLocationView, AssetView } from "@/lib/data/assets";
import type { AssetCategoryRow, AssetKind } from "@/types/database";

export function AssetCards({ assets, kind, canManage, categories, locations }: { assets: AssetView[]; kind: AssetKind; canManage: boolean; categories: AssetCategoryRow[]; locations: AssetLocationView[] }) {
  if (!assets.length) return <div className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind="results" title={`No ${kind} records found`} description="Change the filters or add a record." /></div>;
  const base = kind === "equipment" ? "/equipment" : "/vehicles";
  return <RecordListView storageKey={kind === "equipment" ? "equipment" : "vehicles"} title={kind === "equipment" ? "Equipment" : "Vehicles"} columns={["Asset", kind === "equipment" ? "Category" : "Vehicle type", ...(kind === "equipment" ? ["Brand / model"] : []), kind === "equipment" ? "Serial number" : "Plate number", "Location", "Status", "Actions"]} rows={assets.map((asset) => ({ id: asset.id, cells: [
    <div key="record" className="flex min-w-56 items-center gap-3"><RecordThumbnail icon={kind === "equipment" ? ExcavatorIcon : Car01Icon} name={asset.name} photo={asset.photo_path ? recordPhotoUrl("assets", asset.id, asset.updated_at) : null} /><Link key="asset" href={`${base}/${asset.id}`} className="font-semibold hover:text-cyan-700">{asset.code} · {asset.name}</Link></div>, asset.categoryName, ...(kind === "equipment" ? [[asset.brand, asset.model].filter(Boolean).join(" ")] : []), asset.equipment?.serial_number ?? asset.vehicle?.plate_number ?? "—", asset.location?.displayName ?? "Unavailable location",
    <AssetStatusBadge key="status" status={asset.status} />, <AssetCardActions key="actions" asset={asset} kind={kind} canManage={canManage} categories={categories} locations={locations} />,
  ] }))}><section aria-label={`${kind} records`} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {assets.map((asset) => <article key={asset.id} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative grid h-44 place-items-center bg-slate-100 text-slate-400">
        {asset.photo_path ? <PhotoViewer src={recordPhotoUrl("assets", asset.id, asset.updated_at)} alt={`${asset.name} photo`} sizes="(max-width: 768px) 100vw, 33vw" /> : <HugeiconsIcon icon={kind === "equipment" ? ExcavatorIcon : Car01Icon} size={42} strokeWidth={1.5} aria-label="No photo uploaded" />}
        <div className="absolute right-3 top-3"><AssetStatusBadge status={asset.status} /></div>
      </div>
      <div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-cyan-700">{asset.code}</p><h2 className="mt-1 text-lg font-semibold"><Link href={`${base}/${asset.id}`} className="hover:text-cyan-700">{asset.name}</Link></h2><p className="mt-1 text-sm text-slate-500">{asset.categoryName}</p></div><AssetCardActions asset={asset} kind={kind} canManage={canManage} categories={categories} locations={locations} /></div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">{[
          ...(kind === "equipment" ? [["Brand / model", [asset.brand, asset.model].filter(Boolean).join(" ")]] : []),
          [kind === "equipment" ? "Serial number" : "Plate number", asset.equipment?.serial_number ?? asset.vehicle?.plate_number ?? "—"],
          ...(kind === "equipment" ? [["SKU", asset.equipment?.sku || "—"], ["Type", asset.equipment?.equipment_type ?? "—"]] : [["Ownership", asset.ownership_type.replaceAll("_", " ")]]),
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><HugeiconsIcon icon={Location01Icon} size={16} strokeWidth={1.5} />{asset.location?.displayName ?? "Unavailable location"}</p>
      </div>
    </article>)}
  </section></RecordListView>;
}
