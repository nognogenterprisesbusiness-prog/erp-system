"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordActionMenu, type RecordAction } from "@/components/ui/record-action-menu";
import { SelectPicker } from "@/components/ui/select-picker";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { checkoutDemoEquipmentRequest, decideDemoEquipmentRequest, getDemoDatabase, returnDemoEquipmentRequest, submitDemoEquipmentRequest } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { visibleDemoProjectIds } from "@/lib/demo/visibility";

type Request = DemoData["equipmentRequests"][number];
type ActionKind = "view" | "approve" | "reject" | "checkout" | "return";
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800";
const pageSize = 10;

export function DemoEquipmentRequests({ tables, role, userId, onChanged }: {
  tables: DemoData;
  role: DemoRole;
  userId: string;
  onChanged: (message: string) => Promise<void>;
}) {
  const canManage = isDemoManager(role);
  const canRequest = ["project_manager", "engineer", "foreman"].includes(role);
  const projectIds = visibleDemoProjectIds(tables, role, userId);
  const projects = tables.projects.filter((item) => item.status === "active" && projectIds.has(item.id));
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const sites = tables.sites.filter((item) => item.projectId === projectId);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [assetId, setAssetId] = useState("");
  const [neededOn, setNeededOn] = useState("");
  const [returnOn, setReturnOn] = useState("");
  const [purpose, setPurpose] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ kind: ActionKind; request: Request } | null>(null);
  const [note, setNote] = useState("");
  const [needsMaintenance, setNeedsMaintenance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);

  useEffect(() => { if (action && !dialog.current?.open) dialog.current?.showModal(); }, [action]);

  const selectedSite = sites.find((item) => item.id === siteId);
  const available = tables.equipment.filter((asset) => asset.status === "available"
    && (tables.warehouses.some((warehouse) => warehouse.name === asset.location) || asset.location === selectedSite?.name)
    && !tables.equipmentRequests.some((request) => request.assetId === asset.id && (["approved", "checked_out"].includes(request.status)
      || (request.status === "submitted" && request.projectId === projectId && request.siteId === siteId && request.requestedBy === userId))));
  const visible = tables.equipmentRequests.filter((item) => canManage || projectIds.has(item.projectId))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const rows = visible.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  const projectName = (id: string) => tables.projects.find((item) => item.id === id)?.name ?? "Project";
  const assetName = (id: string) => tables.equipment.find((item) => item.id === id)?.name ?? "Equipment";
  const userName = (id?: string) => tables.users.find((item) => item.id === id)?.name ?? "—";

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      await submitDemoEquipmentRequest(getDemoDatabase(), { assetId, projectId, siteId, neededOn, expectedReturnOn: returnOn, purpose });
      await onChanged("Equipment request submitted.");
      setPurpose(""); setNeededOn(""); setReturnOn(""); setAssetId(""); setPage(1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit the equipment request."); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const db = getDemoDatabase();
      if (action.kind === "approve" || action.kind === "reject") await decideDemoEquipmentRequest(db, action.request.id, action.kind === "approve", note);
      else if (action.kind === "checkout") await checkoutDemoEquipmentRequest(db, action.request.id);
      else if (action.kind === "return") await returnDemoEquipmentRequest(db, action.request.id, needsMaintenance, note);
      await onChanged("Equipment handover updated.");
      dialog.current?.close(); setAction(null); setNote(""); setNeedsMaintenance(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the equipment handover."); }
    finally { submitting.current = false; setBusy(false); }
  }

  function open(request: Request, kind: ActionKind) { setError(""); setNote(""); setNeedsMaintenance(false); setAction({ request, kind }); }
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">{canManage ? "Equipment handovers" : "Equipment requests"}</h2><p className="mt-1 text-sm text-slate-500">{canManage ? "Review requests, approve handovers, and record returns." : "Follow approval, site handover, and return."}</p></div><span className="text-xs text-slate-500">{visible.length} requests</span></div>
    {canRequest && projects.length > 0 && <form onSubmit={(event) => void submitRequest(event)} className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">Request equipment</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-slate-600">Project<SelectPicker label="Project" value={projectId} options={projects.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} onValueChange={(value) => { setProjectId(value); setSiteId(tables.sites.find((site) => site.projectId === value)?.id ?? ""); setAssetId(""); }} /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">Site<SelectPicker key={projectId} label="Site" value={siteId} options={sites.map((item) => ({ value: item.id, label: item.name }))} onValueChange={(value) => { setSiteId(value); setAssetId(""); }} /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">Equipment<SelectPicker label="Equipment" value={assetId} options={available.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} onValueChange={setAssetId} placeholder="Select available equipment" /></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">Purpose<input className={inputClass} value={purpose} onChange={(event) => setPurpose(event.target.value)} minLength={3} maxLength={500} required placeholder="Work requiring the asset" /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><DateRangePicker startDate={neededOn} endDate={returnOn} onStartChange={setNeededOn} onEndChange={setReturnOn} startLabel="Needed on" endLabel="Expected return" groupLabel="Equipment request dates" className="w-full sm:w-[300px]" /><Button type="submit" disabled={busy || !siteId || !assetId || !neededOn || !returnOn || purpose.trim().length < 3}>{busy ? "Submitting…" : "Submit request"}</Button></div>
      {available.length === 0 && <p className="mt-3 text-xs text-slate-500">No available equipment is at the selected site or a warehouse.</p>}
    </form>}
    {error && !action && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="mt-4"><DataTableShell empty={visible.length === 0 ? <EmptyState kind="items" title="No equipment requests yet" /> : undefined}>
      <table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Equipment</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((request) => {
        const actions: RecordAction[] = [{ label: "View", onSelect: () => open(request, "view") }];
        if (canManage && request.status === "submitted") actions.push({ label: "Approve", onSelect: () => open(request, "approve") }, { label: "Reject", onSelect: () => open(request, "reject"), destructive: true });
        if (canManage && request.status === "approved") actions.push({ label: "Withdraw approval", onSelect: () => open(request, "reject"), destructive: true });
        if (canManage && request.status === "approved") actions.push({ label: "Check out", onSelect: () => open(request, "checkout") });
        if (canManage && request.status === "checked_out") actions.push({ label: "Record return", onSelect: () => open(request, "return") });
        return <tr key={request.id}><td className="px-5 py-4"><span className="font-medium text-slate-800">{assetName(request.assetId)}</span><span className="block text-xs text-slate-500">{tables.equipment.find((item) => item.id === request.assetId)?.code}</span></td><td className="px-4 py-4 text-slate-600">{projectName(request.projectId)}<span className="block text-xs text-slate-500">{tables.sites.find((item) => item.id === request.siteId)?.name}</span></td><td className="px-4 py-4 text-xs text-slate-600">{request.neededOn}<span className="block text-slate-500">Return {request.expectedReturnOn}</span></td><td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">{request.status.replaceAll("_", " ")}</span></td><td className="px-5 py-4 text-right"><RecordActionMenu name={`${assetName(request.assetId)} request`} actions={actions} disabled={busy} /></td></tr>;
      })}</tbody></table>
    </DataTableShell></div>
    {pageCount > 1 && <nav aria-label="Equipment request pages" className="mt-3 flex items-center justify-end gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs text-slate-500">Page {page} of {pageCount}</span><Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</Button></nav>}
    <dialog ref={dialog} onClose={() => setAction(null)} aria-labelledby="equipment-request-action-title" className="m-auto w-[min(100%-2rem,430px)] rounded-2xl border border-slate-200 bg-white p-0 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      {action && <form onSubmit={(event) => void submitAction(event)} className="p-6"><DialogHeading id="equipment-request-action-title" title={action.kind === "view" ? "Equipment request" : action.kind === "return" ? "Record return" : action.kind === "checkout" ? "Check out equipment" : action.kind === "reject" && action.request.status === "approved" ? "Withdraw approval" : `${action.kind === "approve" ? "Approve" : "Reject"} request`} onClose={() => dialog.current?.close()} disabled={busy} />
        <dl className="mt-5 grid grid-cols-[100px_1fr] gap-2 text-sm"><dt className="text-slate-500">Equipment</dt><dd className="font-medium">{assetName(action.request.assetId)}</dd><dt className="text-slate-500">Project</dt><dd>{projectName(action.request.projectId)}</dd><dt className="text-slate-500">Requester</dt><dd>{userName(action.request.requestedBy)}</dd><dt className="text-slate-500">Purpose</dt><dd>{action.request.purpose}</dd><dt className="text-slate-500">Status</dt><dd className="capitalize">{action.request.status.replaceAll("_", " ")}</dd><dt className="text-slate-500">Needed</dt><dd>{action.request.neededOn} – {action.request.expectedReturnOn}</dd>{action.request.decidedBy && <><dt className="text-slate-500">Decision</dt><dd>{userName(action.request.decidedBy)} · {action.request.decisionNote ?? "Approved"}</dd></>}{action.request.checkedOutAt && <><dt className="text-slate-500">Checked out</dt><dd>{userName(action.request.checkedOutBy)} · {new Date(action.request.checkedOutAt).toLocaleString()}</dd></>}{action.request.returnedAt && <><dt className="text-slate-500">Returned</dt><dd>{userName(action.request.returnedBy)} · {new Date(action.request.returnedAt).toLocaleString()}</dd></>}</dl>
        {action.kind === "approve" || action.kind === "reject" || action.kind === "return" ? <label className="mt-5 grid gap-1 text-xs font-medium text-slate-600">{action.kind === "return" ? "Return condition" : action.kind === "reject" ? action.request.status === "approved" ? "Withdrawal reason" : "Rejection reason" : "Approval note (optional)"}<textarea className="min-h-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} minLength={action.kind === "approve" ? undefined : 3} maxLength={500} required={action.kind !== "approve"} /></label> : null}
        {action.kind === "return" && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={needsMaintenance} onChange={(event) => setNeedsMaintenance(event.target.checked)} />Needs maintenance</label>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>{action.kind === "view" ? "Close" : "Cancel"}</Button>{action.kind !== "view" && <Button type="submit" disabled={busy}>{busy ? "Saving…" : action.kind === "checkout" ? "Check out" : action.kind === "return" ? "Record return" : action.kind === "approve" ? "Approve" : action.kind === "reject" && action.request.status === "approved" ? "Withdraw approval" : "Reject"}</Button>}</div>
      </form>}
    </dialog>
  </section>;
}
