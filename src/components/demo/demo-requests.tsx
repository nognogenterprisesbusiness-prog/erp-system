"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { RegistryToolbar } from "@/components/ui/registry-toolbar";
import { consumeDemoMaterialRequest, decideDemoMaterialRequest, dispatchDemoMaterialRequest, getDemoDatabase, receiveDemoMaterialRequest, submitDemoMaterialRequest } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { demoRequestProgress, demoRequestStatusLabel, type ActiveDemoRequest } from "@/lib/demo/workflow";
import { visibleDemoProjectIds, visibleDemoWarehouseIds } from "@/lib/demo/visibility";

type Mode = "new" | "approve" | "reject" | "dispatch" | "receipt" | "consumption";
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/20";
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

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
  const manager = isDemoManager(role);
  const projectIds = visibleDemoProjectIds(tables, role, userId);
  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId);
  const requestProjects = tables.projects.filter((row) => projectIds.has(row.id) && row.status !== "completed");
  const [projectId, setProjectId] = useState(requestProjects[0]?.id ?? "");
  const [mode, setMode] = useState<Mode | null>(() => action === "new" && (manager || ["project_manager", "engineer", "foreman"].includes(role) && requestProjects.length > 0) ? "new" : null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const operationId = useRef("");
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
  const canCreate = manager || ["project_manager", "engineer", "foreman"].includes(role) && requestProjects.length > 0;

  useEffect(() => { if (mode && !dialog.current?.open) dialog.current?.showModal(); }, [mode]);

  function openModal(next: Mode, request?: ActiveDemoRequest) {
    setError("");
    setRequestId(request?.id ?? null);
    operationId.current = `demo-move-${crypto.randomUUID()}`;
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
          const movement = { requestId: selected.id, quantity: Number(value("quantity")), operationId: operationId.current };
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
    <RegistryToolbar className="mb-3" search={<SearchField label="Search material requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, project or status" />} actions={canCreate ? <Button onClick={() => openModal("new")}><HugeiconsIcon icon={PlusSignIcon} size={17} />New request</Button> : null} />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {visible.length ? <div className="divide-y divide-slate-100">{visible.map((request) => {
        if (request.legacy) { const material = tables.materials.find((row) => row.id === request.materialId); return <div key={request.id} className="px-5 py-4 text-sm text-slate-500 sm:px-6">Legacy request · {material?.name ?? "Material"} · SKU {material?.code ?? "—"} · Read-only after demo upgrade</div>; }
        const progress = demoRequestProgress(tables, request);
        const project = tables.projects.find((row) => row.id === request.projectId);
        const site = tables.sites.find((row) => row.id === request.siteId);
        const material = tables.materials.find((row) => row.id === request.materialId);
        const canDispatch = request.status === "approved" && progress.toDispatch > 0 && (manager || role === "warehouse_staff" && warehouseIds.has(request.warehouseId));
        const canHandleSite = manager || projectIds.has(request.projectId) && ["project_manager", "engineer", "foreman"].includes(role);
        return <div key={request.id} className="px-5 py-4 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{material?.name ?? "Material"} · {request.quantity.toLocaleString()} {material?.unit}</p><p className="mt-1 text-xs font-medium text-slate-500">SKU {material?.code ?? "—"}</p><p className="mt-1 text-xs text-slate-500">{project?.name} · {site?.name} · from {tables.warehouses.find((row) => row.id === request.warehouseId)?.name}</p><p className="mt-1 text-xs text-slate-500">{request.purpose}</p></div><RequestStatus request={request} progress={progress} /></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Approved {request.approvedQuantity}{material?.unit ? ` ${material.unit}` : ""}</span><span>In transit {progress.inTransit}</span><span>At site {progress.atSite}</span><span>Used {progress.consumed}</span>{progress.costCentavos > 0 ? <span className="font-semibold text-slate-700">Illustrative cost {money.format(progress.costCentavos / 100)}</span> : null}</div>
          <div className="mt-3 flex flex-wrap gap-2">{manager && request.status === "submitted" ? <><Button size="sm" onClick={() => openModal("approve", request)}>Approve</Button><Button size="sm" variant="outline" onClick={() => openModal("reject", request)}>Reject</Button></> : null}{canDispatch ? <Button size="sm" variant="outline" onClick={() => openModal("dispatch", request)}>Dispatch</Button> : null}{request.status === "approved" && canHandleSite && progress.inTransit > 0 ? <Button size="sm" variant="outline" onClick={() => openModal("receipt", request)}>Receive</Button> : null}{request.status === "approved" && canHandleSite && progress.atSite > 0 ? <Button size="sm" variant="outline" onClick={() => openModal("consumption", request)}>Record use</Button> : null}</div>
          <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer font-medium text-cyan-700">View history and quantities</summary><div className="mt-2 grid gap-1 rounded-lg bg-slate-50 p-3"><p>Requested by {tables.users.find((row) => row.id === request.requestedBy)?.name ?? "Demo user"} · {new Date(request.requestedAt).toLocaleString()}</p>{request.decidedBy ? <p>Decision by {tables.users.find((row) => row.id === request.decidedBy)?.name ?? "Demo manager"}{request.rejectionReason ? ` · ${request.rejectionReason}` : ""}</p> : null}<p>Dispatched {progress.dispatched} · Received {progress.received} · Used {progress.consumed}</p>{tables.requestMovements.filter((row) => row.requestId === request.id).toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((movement) => <p key={movement.id} className="capitalize">{movement.kind} · {movement.quantity} · {tables.users.find((row) => row.id === movement.actorId)?.name ?? "Demo user"} · {new Date(movement.occurredAt).toLocaleString()}{movement.amountCentavos !== undefined ? ` · ${money.format(movement.amountCentavos / 100)}` : ""}</p>)}</div></details>
        </div>;
      })}</div> : canCreate ? <EmptyState kind="items" title="No material requests yet" description="Use New request to start a material request for an assigned project." /> : <EmptyState kind="items" title="No approved requests for this warehouse" />}
    </section>
    <p className="mt-3 text-sm text-slate-500">{visible.length} request{visible.length === 1 ? "" : "s"}</p>
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-request-dialog-title" className="m-auto w-[min(100%-2rem,480px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${mode}:${requestId ?? ""}`} onSubmit={(event) => void submit(event)} className="grid gap-4"><DialogHeading id="demo-request-dialog-title" title={modalTitle} onClose={close} disabled={busy} />
      {mode === "new" ? <><label className="grid gap-1.5 text-xs font-semibold">Project<SelectPicker label="Project" value={projectId} onValueChange={setProjectId} options={requestProjects.map((project) => ({ value: project.id, label: project.name }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Site<SelectPicker key={projectId} name="siteId" label="Site" defaultValue={tables.sites.find((site) => site.projectId === projectId)?.id} options={tables.sites.filter((site) => site.projectId === projectId).map((site) => ({ value: site.id, label: site.name }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Source warehouse<SelectPicker name="warehouseId" label="Source warehouse" defaultValue={tables.warehouses.find((warehouse) => warehouse.name === "Main Warehouse")?.id ?? tables.warehouses[0]?.id} options={tables.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Material / SKU<SelectPicker name="materialId" label="Material / SKU" defaultValue={tables.materials[0]?.id} options={tables.materials.map((material) => ({ value: material.id, label: `${material.name} · SKU ${material.code}` }))} /></label><label className="grid gap-1.5 text-xs font-semibold">Quantity<input className={inputClass} name="quantity" type="number" min="0.001" max="1000000000" step="0.001" required /></label><label className="grid gap-1.5 text-xs font-semibold">Purpose<textarea className="min-h-20 rounded-lg border border-slate-200 p-3 text-sm" name="purpose" maxLength={300} required /></label></> : null}
      {mode === "approve" ? <><label className="grid gap-1.5 text-xs font-semibold">Approved quantity<input className={inputClass} name="quantity" type="number" min="0.001" max={selected?.quantity} step="0.001" defaultValue={defaultQuantity} required /></label><label className="grid gap-1.5 text-xs font-semibold">Illustrative unit cost (₱)<input className={inputClass} name="unitCost" inputMode="decimal" placeholder="250.00" required /></label><p className="text-xs text-slate-500">Partial approval is allowed. Cost posts only when received stock is actually used.</p></> : null}
      {mode === "reject" ? <label className="grid gap-1.5 text-xs font-semibold">Reason<textarea className="min-h-20 rounded-lg border border-slate-200 p-3 text-sm" name="reason" maxLength={300} required /></label> : null}
      {mode === "dispatch" || mode === "receipt" || mode === "consumption" ? <label className="grid gap-1.5 text-xs font-semibold">Quantity<input className={inputClass} name="quantity" type="number" min="0.001" max={defaultQuantity} step="0.001" defaultValue={defaultQuantity} required /></label> : null}
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || mode === "new" && (!projectId || !tables.sites.some((site) => site.projectId === projectId))}>{busy ? "Saving…" : modalTitle}</Button></div></form></dialog>
  </>;
}
