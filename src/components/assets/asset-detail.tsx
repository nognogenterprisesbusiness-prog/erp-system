import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { displayDate, displayMoney, displayQuantity, displayStatus } from "@/lib/ui/display";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { RecordSectionTabs, type RecordSection } from "@/components/ui/record-section-tabs";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { AssetForm } from "./asset-form";
import { ArchiveAssetForm } from "./archive-asset-form";
import { AssetStatusBadge } from "./asset-status-badge";
import { Button } from "@/components/ui/button";
import { EntityQrSection } from "@/components/qr/entity-qr-section";
import type { getAsset, getEquipmentUsage } from "@/lib/data/assets";
import type { AssetKind } from "@/types/database";

type AssetDetailData = Awaited<ReturnType<typeof getAsset>>;
type EquipmentUsageData = Awaited<ReturnType<typeof getEquipmentUsage>>;
type Props = {
  data: AssetDetailData; kind: AssetKind; canManage: boolean; usage?: EquipmentUsageData;
  editOnly?: boolean; editing?: boolean;
  expenses?: ReactNode; drivers?: ReactNode; projectFuel?: ReactNode; initialSection?: string;
};

export function AssetDetail({ data, kind, canManage, usage, editing = false, editOnly = false, expenses, drivers, projectFuel, initialSection }: Props) {
  const { asset, events } = data;
  const isEquipment = kind === "equipment";
  const base = isEquipment ? "/equipment" : "/vehicles";
  if (editing && !(canManage && !asset.archived_at && !["assigned", "in_use"].includes(asset.status))) redirect(`${base}/${asset.id}`);
  if ((editOnly || editing) && canManage && !asset.archived_at && !["assigned", "in_use"].includes(asset.status)) return <RecordCreateDialog hideTrigger initialOpen confirmDiscard title={`Edit ${kind}`} closeHref={base}><AssetForm kind={kind} asset={asset} /></RecordCreateDialog>;
  const details = <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
      <div><h2 className="font-semibold">Unit details</h2><dl className="mt-4 space-y-3 text-sm">{[
        [isEquipment ? "Equipment type" : "Vehicle type", isEquipment ? asset.equipment?.equipment_type : asset.typeName],
        ...(isEquipment ? [["Brand", asset.brand], ["Model", asset.model], ["Serial number", asset.equipment?.serial_number], ["Acquired", displayDate(asset.acquisition_date)], ["Acquisition cost", asset.equipment ? displayMoney(asset.equipment.acquisition_cost) : "Not recorded"]] : []),
        ["Ownership", displayStatus(asset.ownership_type)],
      ].map(([label, value]) => <div key={label} className="grid gap-1 sm:grid-cols-[140px_minmax(0,1fr)]"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium text-slate-800">{value || "Not recorded"}</dd></div>)}</dl></div>
      <div><h2 className="font-semibold">Condition and notes</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{asset.condition_notes || "No condition notes recorded."}</p>{asset.description && <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">{asset.description}</p>}{asset.location?.displayAddress && <p className="mt-4 text-sm text-slate-500">Location address: {asset.location.displayAddress}</p>}</div>
    </div>
    {canManage && <div className="border-t border-slate-100 px-5 pb-5 sm:px-6"><EntityQrSection entityType={kind} entityId={asset.id} canManage={canManage} recordName={asset.name} /></div>}
    {canManage && !asset.archived_at && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6"><p className="text-xs text-slate-500">Removing a unit preserves its recorded history.</p><RecordCreateDialog title={`Delete ${kind}`} triggerLabel={`Delete ${kind}`} triggerVariant="outline" triggerIcon={null} triggerSize="sm"><ArchiveAssetForm id={asset.id} kind={kind} /></RecordCreateDialog></div>}
  </section>;
  const history = <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Unit history</h2><p className="mt-1 text-sm text-slate-500">Changes to this unit’s details, location and status.</p></div>
    {!events.length ? <p className="p-5 text-sm text-slate-500">{data.eventCount ? "No changes on this page." : "No changes recorded yet."}</p> : <ol className="divide-y divide-slate-100">{events.map(event => <li key={event.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)]"><div><p className="text-sm font-semibold text-slate-800">{displayStatus(event.event_type)}</p><time className="mt-1 block text-xs leading-5 text-slate-500">{new Date(event.occurred_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</time></div><div><p className="text-sm leading-6 text-slate-700">{event.summary}</p>{event.previousLocation?.displayName !== event.currentLocation?.displayName && <p className="mt-1 text-sm text-slate-500">{event.previousLocation?.displayName ?? "No location"} → {event.currentLocation?.displayName ?? "No location"}</p>}<p className="mt-1 text-xs text-slate-500">{event.actorName}</p></div></li>)}</ol>}
    {(data.eventCount > 20 || data.eventPage > 1) && <div className="border-t border-slate-100 px-5 pb-4"><HistoryPagination replace path={`${base}/${asset.id}`} parameter="eventPage" page={data.eventPage} count={data.eventCount} filters={{ section: "history", usagePage: String(usage?.page ?? 1) }} /></div>}
  </section>;
  const projectUse = usage && <>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Project use</h2><p className="mt-1 text-sm text-slate-500">Hours and charges posted to a project.</p></div>
      {!usage.rows.length ? <p className="p-5 text-sm text-slate-500">{usage.count ? "No project use on this page." : "No project use recorded yet."}</p> : <ul className="divide-y divide-slate-100">{usage.rows.map(entry => <li key={entry.id} className="p-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-slate-800">{entry.projectName}</h3><p className="text-sm text-slate-500">{displayDate(entry.use_date)}</p></div>{entry.work_note && <p className="mt-2 text-sm leading-6 text-slate-600">{entry.work_note}</p>}<dl className="mt-4 grid grid-cols-3 gap-3 text-sm">{[["Hours", displayQuantity(entry.hours_used)], ["Hourly rate", displayMoney(entry.hourly_rate_snapshot)], ["Project cost", entry.reversal ? "Reversed" : displayMoney(entry.cost_total)]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums text-slate-800">{value}</dd></div>)}</dl>{entry.reversal && <p className="mt-3 text-sm text-red-700">Reversed: {entry.reversal.reason}</p>}</li>)}</ul>}
      {(usage.count > 20 || usage.page > 1) && <div className="border-t border-slate-100 px-5 pb-4"><HistoryPagination replace path={`${base}/${asset.id}`} parameter="usagePage" page={usage.page} count={usage.count} filters={{ section: "project-use", eventPage: String(data.eventPage) }} /></div>}
    </section>{projectFuel}
  </>;
  const sections: RecordSection[] = [
    ...(expenses ? [{ id: "expenses", label: "Expenses", content: expenses }] : []),
    { id: "details", label: "Details", content: details },
    ...(projectUse ? [{ id: "project-use", label: "Project use", content: projectUse }] : []),
    { id: "history", label: "History", content: history },
  ];
  return <>
    <header className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
        {asset.photo_path && <div className="size-20 shrink-0 overflow-hidden rounded-xl sm:size-24"><PhotoViewer src={recordPhotoUrl("assets", asset.id, asset.updated_at)} alt={`${asset.name} photo`} sizes="96px" /></div>}
        <div className="min-w-0"><p className="text-sm text-slate-500">{isEquipment ? "Equipment" : "Vehicle"} · {asset.code}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{asset.name}</h1><AssetStatusBadge status={asset.status} /></div></div>
      </div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link data-detail-back href={base}>Back</Link></Button>{canManage && !asset.archived_at && !["assigned", "in_use"].includes(asset.status) && <RecordCreateDialog confirmDiscard title={`Edit ${kind}`} triggerLabel="Edit details" triggerVariant="outline" triggerSize="sm" initialOpen={editing} closeHref={`${base}/${asset.id}`}><AssetForm kind={kind} asset={asset} /></RecordCreateDialog>}</div></div>
      <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Current location</dt><dd className="mt-1 font-medium text-slate-800">{asset.location?.displayName ?? "Location unavailable"}</dd></div>{asset.vehicle?.plate_number && <div><dt className="text-xs text-slate-500">Plate number</dt><dd className="mt-1 font-medium text-slate-800">{asset.vehicle.plate_number}</dd></div>}</dl>
    </header>
    {drivers}
    <RecordSectionTabs key={asset.id} sections={sections} initialSection={initialSection ?? (expenses ? "expenses" : "details")} />
  </>;
}
