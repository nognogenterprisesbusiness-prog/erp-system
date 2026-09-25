"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { RegistryToolbar } from "@/components/ui/registry-toolbar";
import { RecordActionMenu, type RecordAction } from "@/components/ui/record-action-menu";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";
import { consumeDemoMaterialRequest, decideDemoMaterialRequest, dispatchDemoMaterialRequest, getDemoDatabase, receiveDemoMaterialRequest, submitDemoMaterialRequest } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { demoRequestProgress, demoRequestStatusLabel, type ActiveDemoRequest } from "@/lib/demo/workflow";
import { visibleDemoProjectIds, visibleDemoWarehouseIds } from "@/lib/demo/visibility";
import { DemoRequestDetailDialog } from "./demo-request-detail-dialog";

type Mode = "new" | "approve" | "reject" | "dispatch" | "receipt" | "consumption";
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/20";
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 });
const pageSize = 10;

function costCentavos(value: string): number {
  const trimmed = value.trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(trimmed)) throw new Error("Enter a valid peso amount with up to two decimals.");
  const [pesos, centavos = ""] = trimmed.split(".");
  return Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
}

function RequestStatus({ request, progress }: { request: ActiveDemoRequest; progress: ReturnType<typeof demoRequestProgress> }) {
  const label = demoRequestStatusLabel(request, progress);
  const tone = request.status === "rejected" ? "bg-red-50 text-red-700" : request.status === "submitted" ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-800";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

export function DemoRequests({ tables, role, userId, action, onChanged }: { tables: DemoData; role: DemoRole; userId: string; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const searchParams = useSearchParams();
  const manager = isDemoManager(role);
  const projectIds = visibleDemoProjectIds(tables, role, userId);
  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId);
  const requestProjects = tables.projects.filter((row) => projectIds.has(row.id) && row.status !== "completed");
  const [projectId, setProjectId] = useState(requestProjects.find((project) => project.id === searchParams.get("project"))?.id ?? requestProjects[0]?.id ?? "");
  const prefillSite = tables.sites.find((site) => site.id === searchParams.get("site") && site.projectId === projectId)?.id;
  const prefillWarehouse = tables.warehouses.find((warehouse) => warehouse.id === searchParams.get("warehouse"))?.id;
  const prefillMaterial = tables.materials.find((material) => material.id === searchParams.get("material"))?.id;
  const requestedQuantity = Number(searchParams.get("quantity"));
  const prefillQuantity = requestedQuantity > 0 && requestedQuantity <= 1_000_000_000 && Number.isInteger(requestedQuantity * 1000) ? requestedQuantity : undefined;
  const canCreate = !manager && ["project_manager", "engineer", "foreman"].includes(role) && requestProjects.length > 0;
  const [mode, setMode] = useState<Mode | null>(() => action === "new" && canCreate ? "new" : null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [operationId, setOperationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const needle = query.trim().toLowerCase();
  const visible = tables.materialRequests.filter((request) => {
    if (manager) return true;
    if (request.legacy) return false;
    return role === "warehouse_staff" ? request.status === "approved" && warehouseIds.has(request.warehouseId) : projectIds.has(request.projectId);
  }).filter((request) => {
    if (!needle) return true;
    const material = tables.materials.find((row) => row.id === request.materialId);
    const project = tables.projects.find((row) => row.id === request.projectId);
    const site = !request.legacy ? tables.sites.find((row) => row.id === request.siteId) : undefined;
    const warehouse = !request.legacy ? tables.warehouses.find((row) => row.id === request.warehouseId) : undefined;
    return `${material?.name ?? ""} ${material?.code ?? ""} ${project?.name ?? ""} ${project?.code ?? ""} ${site?.name ?? ""} ${warehouse?.name ?? ""} ${request.status} ${request.legacy ? "" : request.purpose}`.toLowerCase().includes(needle);
  }).toSorted((a, b) => ("requestedAt" in b ? b.requestedAt : "").localeCompare("requestedAt" in a ? a.requestedAt : ""));
  const selectedRequest = tables.materialRequests.find((row) => row.id === requestId);
  const selected = selectedRequest && !selectedRequest.legacy ? selectedRequest : undefined;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const detailRequest = tables.materialRequests.find((row) => row.id === detailId && !row.legacy);

  useEffect(() => { if (mode && !dialog.current?.open) dialog.current?.showModal(); }, [mode]);

  function openModal(next: Mode, request?: ActiveDemoRequest) {
    setError("");
    setRequestId(request?.id ?? null);
    setOperationId(`demo-move-${crypto.randomUUID()}`);
    setMode(next);
  }

  function close() {
    dialog.current?.close();
    setMode(null);
    setRequestId(null);
    setError("");
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) { url.searchParams.delete("action"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    try {
      const db = getDemoDatabase();
      if (mode === "new") await submitDemoMaterialRequest(db, { projectId, siteId: value("siteId"), warehouseId: value("warehouseId"), materialId: value("materialId"), quantity: Number(value("quantity")), purpose: value("purpose") });
      else if (selected) {
        if (mode === "approve") await decideDemoMaterialRequest(db, { requestId: selected.id, approvedQuantity: Number(value("quantity")), unitCostCentavos: costCentavos(value("unitCost")) });
        else if (mode === "reject") await decideDemoMaterialRequest(db, { requestId: selected.id, approvedQuantity: 0, unitCostCentavos: 0, rejectionReason: value("reason") });
        else {
          const movement = { requestId: selected.id, quantity: Number(value("quantity")), operationId };
          if (mode === "dispatch") await dispatchDemoMaterialRequest(db, movement);
          else if (mode === "receipt") await receiveDemoMaterialRequest(db, movement);
          else await consumeDemoMaterialRequest(db, movement);
        }
      }
      await onChanged(mode === "new" ? "Material request submitted." : mode === "approve" ? "Request approved." : mode === "reject" ? "Request rejected." : mode === "dispatch" ? "Stock dispatched." : mode === "receipt" ? "Stock received at site." : "Site consumption posted.");
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete this demo action."); }
    finally { lock.current = false; setBusy(false); }
  }

  const modalTitle = mode === "new" ? "New material request" : mode === "approve" ? "Approve request" : mode === "reject" ? "Reject request" : mode === "dispatch" ? "Dispatch stock" : mode === "receipt" ? "Receive at site" : "Record site consumption";
  const selectedProgress = selected ? demoRequestProgress(tables, selected) : null;
  const defaultQuantity = mode === "approve" ? selected?.quantity : mode === "dispatch" ? selectedProgress?.toDispatch : mode === "receipt" ? selectedProgress?.inTransit : mode === "consumption" ? selectedProgress?.atSite : undefined;

  return <>
    <RegistryToolbar className="mb-3" search={<SearchField label="Search material requests" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search SKU, project or status" />} actions={canCreate ? <Button onClick={() => openModal("new")}><HugeiconsIcon icon={PlusSignIcon} size={17} />New request</Button> : null} />
    <DataTableShell empty={visible.length === 0 ? <EmptyState kind={needle ? "results" : "items"} title={needle ? "No matching requests" : "No material requests yet"} description={needle ? "Try another material, SKU, project or status." : canCreate ? "Use New request to start a request for an assigned project." : "Requests will appear here when site staff submit them."} /> : undefined} footer={<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{visible.length} request{visible.length === 1 ? "" : "s"}</span>{pageCount > 1 && <nav aria-label="Material request pages" className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage} of {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></nav>}</div>}>
      <table className="w-full min-w-[860px] text-left text-sm"><thead className={tableHeadClass}><tr><th scope="col" className="px-5 py-3">Material</th><th scope="col" className="px-4 py-3">Project / site</th><th scope="col" className="px-4 py-3">Source warehouse</th><th scope="col" className="px-4 py-3 text-right">Requested</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((request) => {
        const material = tables.materials.find((item) => item.id === request.materialId);
        const project = tables.projects.find((item) => item.id === request.projectId);
        if (request.legacy) return <tr key={request.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><MaterialThumbnail name={material?.name ?? "Material"} photo={material?.photo} /><div><p className="font-medium text-slate-800">{material?.name ?? "Material"}</p><p className="text-xs text-slate-500">SKU {material?.code ?? "—"}</p></div></div></td><td className="px-4 py-4 text-slate-600">{project?.name ?? "Project"}</td><td className="px-4 py-4 text-slate-400">—</td><td className="px-4 py-4 text-right tabular-nums">{quantity.format(request.quantity)} {material?.unit}</td><td className="px-4 py-4 text-xs text-slate-500">Legacy · read-only</td><td className="px-5 py-4 text-right text-xs text-slate-400">—</td></tr>;
        const progress = demoRequestProgress(tables, request);
        const site = tables.sites.find((item) => item.id === request.siteId);
        const warehouse = tables.warehouses.find((item) => item.id === request.warehouseId);
        const canDispatch = request.status === "approved" && progress.toDispatch > 0 && (manager || role === "warehouse_staff" && warehouseIds.has(request.warehouseId));
        const canHandleSite = manager || projectIds.has(request.projectId) && ["project_manager", "engineer", "foreman"].includes(role);
        const actions: RecordAction[] = [{ label: "View", onSelect: () => setDetailId(request.id) }];
        if (manager && request.status === "submitted") actions.push({ label: "Approve", onSelect: () => openModal("approve", request) }, { label: "Reject", onSelect: () => openModal("reject", request), destructive: true });
        if (canDispatch) actions.push({ label: "Dispatch", onSelect: () => openModal("dispatch", request) });
        if (request.status === "approved" && canHandleSite && progress.inTransit > 0) actions.push({ label: "Receive", onSelect: () => openModal("receipt", request) });
        if (request.status === "approved" && canHandleSite && progress.atSite > 0) actions.push({ label: "Record use", onSelect: () => openModal("consumption", request) });
        return <tr key={request.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><button type="button" onClick={() => setDetailId(request.id)} className="flex items-center gap-3 text-left hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><MaterialThumbnail name={material?.name ?? "Material"} photo={material?.photo} /><span><span className="block font-semibold text-slate-800">{material?.name ?? "Material"}</span><span className="mt-0.5 block text-xs text-slate-500">SKU {material?.code ?? "—"}</span></span></button></td><td className="px-4 py-4"><p className="font-medium text-slate-800">{project?.name ?? "Project"}</p><p className="mt-1 text-xs text-slate-500">{site?.name ?? "Site"}</p></td><td className="px-4 py-4 text-slate-600">{warehouse?.name ?? "Warehouse"}</td><td className="px-4 py-4 text-right font-medium tabular-nums text-slate-800">{quantity.format(request.quantity)} <span className="font-normal text-slate-500">{material?.unit}</span></td><td className="px-4 py-4"><RequestStatus request={request} progress={progress} /></td><td className="px-5 py-4 text-right"><RecordActionMenu name={`${material?.name ?? "Material"} request`} actions={actions} disabled={busy} /></td></tr>;
      })}</tbody></table>
    </DataTableShell>
    {detailRequest && !detailRequest.legacy && <DemoRequestDetailDialog key={detailRequest.id} request={detailRequest} tables={tables} onClose={() => setDetailId(null)} />}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-request-dialog-title" className="m-auto w-[min(100%-2rem,480px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${mode}:${requestId ?? ""}`} onSubmit={(event) => void submit(event)} className="grid gap-4"><DialogHeading id="demo-request-dialog-title" title={modalTitle} onClose={close} disabled={busy} />
      {mode === "new" ? <><label className="grid gap-1.5 text-xs font-semibold">Project<SelectPicker label="Project" value={projectId} onValueChange={setProjectId} options={requestProjects.map((project) => ({ value: project.id, label: project.name }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Site<SelectPicker key={projectId} name="siteId" label="Site" defaultValue={prefillSite ?? tables.sites.find((site) => site.projectId === projectId)?.id} options={tables.sites.filter((site) => site.projectId === projectId).map((site) => ({ value: site.id, label: site.name }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Source warehouse<SelectPicker name="warehouseId" label="Source warehouse" defaultValue={prefillWarehouse ?? tables.warehouses.find((warehouse) => warehouse.name === "Main Warehouse")?.id ?? tables.warehouses[0]?.id} options={tables.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Material / SKU<SelectPicker name="materialId" label="Material / SKU" defaultValue={prefillMaterial ?? tables.materials[0]?.id} options={tables.materials.map((material) => ({ value: material.id, label: `${material.name} · SKU ${material.code}` }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Quantity<input className={inputClass} name="quantity" type="number" min="0.001" max="1000000000" step="0.001" defaultValue={prefillQuantity} required /></label><label className="grid gap-1.5 text-xs font-semibold">Purpose<textarea className="min-h-20 rounded-lg border border-slate-200 p-3 text-sm" name="purpose" maxLength={300} required /></label></> : null}
      {mode === "approve" ? <><label className="grid gap-1.5 text-xs font-semibold">Approved quantity<input className={inputClass} name="quantity" type="number" min="0.001" max={selected?.quantity} step="0.001" defaultValue={defaultQuantity} required /></label><label className="grid gap-1.5 text-xs font-semibold">Illustrative unit cost (₱)<input className={inputClass} name="unitCost" inputMode="decimal" placeholder="250.00" required /></label><p className="text-xs text-slate-500">Partial approval is allowed. Cost posts only when received stock is actually used.</p></> : null}
      {mode === "reject" ? <label className="grid gap-1.5 text-xs font-semibold">Reason<textarea className="min-h-20 rounded-lg border border-slate-200 p-3 text-sm" name="reason" maxLength={300} required /></label> : null}
      {mode === "dispatch" || mode === "receipt" || mode === "consumption" ? <label className="grid gap-1.5 text-xs font-semibold">Quantity<input className={inputClass} name="quantity" type="number" min="0.001" max={defaultQuantity} step="0.001" defaultValue={defaultQuantity} required /></label> : null}
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || mode === "new" && (!projectId || !tables.sites.some((site) => site.projectId === projectId))}>{busy ? "Saving…" : modalTitle}</Button></div></form></dialog>
  </>;
}
