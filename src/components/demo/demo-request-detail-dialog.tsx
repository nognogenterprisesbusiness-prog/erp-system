"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";
import type { DemoData } from "@/lib/demo/schema";
import { demoRequestProgress, demoRequestStatusLabel, type ActiveDemoRequest } from "@/lib/demo/workflow";

const quantity = (value: number) => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 }).format(value);
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const when = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function DemoRequestDetailDialog({ request, tables, onClose }: { request: ActiveDemoRequest; tables: DemoData; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const material = tables.materials.find((item) => item.id === request.materialId);
  const project = tables.projects.find((item) => item.id === request.projectId);
  const site = tables.sites.find((item) => item.id === request.siteId);
  const warehouse = tables.warehouses.find((item) => item.id === request.warehouseId);
  const progress = demoRequestProgress(tables, request);
  const unit = material?.unit ?? "units";
  const userName = (id: string) => tables.users.find((item) => item.id === id)?.name ?? "User";
  const history = [
    { id: `${request.id}-submitted`, event: "Submitted", quantity: request.quantity, actor: userName(request.requestedBy), date: request.requestedAt, cost: null },
    ...(request.decidedBy && request.decidedAt ? [{ id: `${request.id}-decision`, event: request.status === "rejected" ? "Rejected" : "Approved", quantity: request.approvedQuantity, actor: userName(request.decidedBy), date: request.decidedAt, cost: null }] : []),
    ...tables.requestMovements.filter((item) => item.requestId === request.id).map((item) => ({ id: item.id, event: item.kind === "consumption" ? "Used on site" : item.kind === "receipt" ? "Received at site" : "Dispatched", quantity: item.quantity, actor: userName(item.actorId), date: item.occurredAt, cost: item.amountCentavos ?? null })),
  ].toSorted((a, b) => a.date.localeCompare(b.date));
  const balances = [
    { label: "Requested", quantity: request.quantity }, { label: "Approved", quantity: request.approvedQuantity },
    { label: "Dispatched", quantity: progress.dispatched }, { label: "In transit", quantity: progress.inTransit },
    { label: "Received", quantity: progress.received }, { label: "At site", quantity: progress.atSite },
    { label: "Used", quantity: progress.consumed }, { label: "Still to dispatch", quantity: progress.toDispatch },
  ];

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="demo-request-detail-title" className="m-auto max-h-[90svh] w-[min(100%-2rem,760px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-[#07152d] shadow-2xl backdrop:bg-slate-950/50">
    <div className="p-5 sm:p-6"><DialogHeading id="demo-request-detail-title" title="Material request" onClose={() => dialog.current?.close()} />
      <div className="mt-5 flex items-start gap-4"><MaterialThumbnail name={material?.name ?? "Material"} photo={material?.photo} large /><div className="min-w-0"><h3 className="text-base font-semibold text-slate-900">{material?.name ?? "Material"}</h3><p className="mt-0.5 text-xs text-slate-500">SKU {material?.code ?? "—"} · {quantity(request.quantity)} {unit} requested</p><span className="mt-2 inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800">{demoRequestStatusLabel(request, progress)}</span></div></div>
      <dl className="mt-5 grid gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Project / site</dt><dd className="mt-1 font-medium">{project?.name ?? "Project"} · {site?.name ?? "Site"}</dd></div><div><dt className="text-xs text-slate-500">Source warehouse</dt><dd className="mt-1 font-medium">{warehouse?.name ?? "Warehouse"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Purpose</dt><dd className="mt-1 font-medium">{request.purpose}</dd></div>{request.rejectionReason && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Decision reason</dt><dd className="mt-1 font-medium">{request.rejectionReason}</dd></div>}</dl>
      <h4 className="mt-6 text-sm font-semibold text-slate-900">Quantities</h4><div className="mt-2 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[400px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Stage</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5">Unit</th></tr></thead><tbody className="divide-y divide-slate-100">{balances.map((item) => <tr key={item.label}><th scope="row" className="px-4 py-2 font-medium text-slate-600">{item.label}</th><td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{quantity(item.quantity)}</td><td className="px-4 py-2 text-slate-500">{unit}</td></tr>)}</tbody></table></div>
      {progress.costCentavos > 0 && <p className="mt-3 text-right text-sm font-semibold text-slate-800">Illustrative use cost: {money.format(progress.costCentavos / 100)}</p>}
      <h4 className="mt-6 text-sm font-semibold text-slate-900">History</h4><div className="mt-2 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-4 py-2.5">Event</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5 text-right">Cost</th></tr></thead><tbody className="divide-y divide-slate-100">{history.map((item) => <tr key={item.id}><th scope="row" className="px-4 py-3 font-medium text-slate-800">{item.event}</th><td className="px-4 py-3 text-right tabular-nums">{quantity(item.quantity)} {unit}</td><td className="px-4 py-3 text-slate-600">{item.actor}</td><td className="px-4 py-3 text-xs text-slate-500">{when(item.date)}</td><td className="px-4 py-3 text-right tabular-nums text-slate-600">{item.cost === null ? "—" : money.format(item.cost / 100)}</td></tr>)}</tbody></table></div>
      <div className="mt-6 flex justify-end"><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
    </div>
  </dialog>;
}
