"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { TableSortHeading, tableHeadClass } from "@/components/ui/table-sort-heading";
import { deleteDemoRecord, getDemoDatabase, registerDemoDailyReport, registerDemoSupplier, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { visibleDemoProjectIds } from "@/lib/demo/visibility";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { DemoRecordActions } from "./demo-record-actions";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";

type Kind = "suppliers" | "reports";
type SortKey = "name" | "category" | "date" | "project";
const labels = { suppliers: { title: "Suppliers", add: "Add supplier", empty: "No suppliers yet" }, reports: { title: "Daily reports", add: "Add report", empty: "No daily reports yet" } } as const;
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

export function DemoDataset({ kind, tables, role, userId, action, onChanged }: { kind: Kind; tables: DemoData; role: DemoRole; userId: string; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(kind === "suppliers" ? "name" : "date");
  const [direction, setDirection] = useState<"asc" | "desc">(kind === "suppliers" ? "asc" : "desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const canManage = isDemoManager(role);
  const projectIds = visibleDemoProjectIds(tables, role, userId);
  const availableProjects = tables.projects.filter((project) => projectIds.has(project.id));
  const canCreate = canManage || kind === "reports" && ["project_manager", "engineer", "foreman"].includes(role) && availableProjects.length > 0;
  const selected = kind === "suppliers" ? tables.suppliers.find((row) => row.id === editingId) : tables.dailyReports.find((row) => row.id === editingId);

  useEffect(() => { if (action === "add" && canCreate && !dialog.current?.open) { setEditingId(null); dialog.current?.showModal(); } }, [action, canCreate]);
  function openEdit(id: string) { setEditingId(id); setFormKey((value) => value + 1); dialog.current?.showModal(); }
  function close() {
    dialog.current?.close(); setEditingId(null); setError(""); setFormKey((value) => value + 1);
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) { url.searchParams.delete("action"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }
  }
  function toggleSort(key: SortKey) { if (sortKey === key) setDirection((current) => current === "asc" ? "desc" : "asc"); else { setSortKey(key); setDirection("asc"); } }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    try {
      if (kind === "suppliers") {
        const changes = { name: value("name"), category: value("category") };
        if (editingId) await updateDemoRecord(getDemoDatabase(), "suppliers", editingId, changes);
        else await registerDemoSupplier(getDemoDatabase(), changes);
      } else {
        const photoFile = data.get("photo");
        const photo = photoFile instanceof File && photoFile.size ? await demoPhotoFromFile(photoFile) : undefined;
        const changes = { projectId: value("projectId"), date: value("date"), summary: value("summary"), ...(photo ? { photo } : {}) };
        if (editingId) await updateDemoRecord(getDemoDatabase(), "dailyReports", editingId, changes);
        else await registerDemoDailyReport(getDemoDatabase(), changes);
      }
      await onChanged(`${kind === "suppliers" ? "Supplier" : "Daily report"} saved.`);
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this record."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone unless you restore an earlier snapshot.`)) return;
    setBusy(true); setError("");
    try { await deleteDemoRecord(getDemoDatabase(), kind === "suppliers" ? "suppliers" : "dailyReports", id); await onChanged(`${kind === "suppliers" ? "Supplier" : "Daily report"} deleted.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete this record."); }
    finally { setBusy(false); }
  }

  const needle = query.trim().toLowerCase();
  const suppliers = tables.suppliers.filter((row) => !needle || `${row.name} ${row.category}`.toLowerCase().includes(needle))
    .toSorted((a, b) => { const key = sortKey === "category" ? "category" : "name"; return (direction === "asc" ? 1 : -1) * a[key].localeCompare(b[key]); });
  const reports = tables.dailyReports.filter((row) => projectIds.has(row.projectId) && (!reportDateFrom || row.date >= reportDateFrom) && (!reportDateTo || row.date <= reportDateTo) && (!needle || `${row.date} ${row.summary} ${tables.projects.find((project) => project.id === row.projectId)?.name ?? ""}`.toLowerCase().includes(needle)))
    .toSorted((a, b) => { const left = sortKey === "project" ? tables.projects.find((project) => project.id === a.projectId)?.name ?? "" : a.date; const right = sortKey === "project" ? tables.projects.find((project) => project.id === b.projectId)?.name ?? "" : b.date; return (direction === "asc" ? 1 : -1) * left.localeCompare(right); });
  const count = kind === "suppliers" ? suppliers.length : reports.length;
  const viewing = reports.find((row) => row.id === viewingId);

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SearchField label={`Search ${labels[kind].title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${labels[kind].title.toLowerCase()}`} wrapperClassName="min-w-[210px] max-w-sm flex-1" />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {kind === "reports" && <DateRangePicker startDate={reportDateFrom} endDate={reportDateTo} onStartChange={setReportDateFrom} onEndChange={setReportDateTo} className="w-full sm:w-[292px]" />}
        {canCreate ? <Button onClick={() => { setEditingId(null); dialog.current?.showModal(); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />{labels[kind].add}</Button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <DataTableShell empty={count ? undefined : needle || reportDateFrom || reportDateTo ? <EmptyState kind="results" title="No matching records" description="Try a different search or date." /> : <EmptyState kind="items" title={labels[kind].empty} description={canCreate ? `Use “${labels[kind].add}” to create a record.` : "No records available to this account."} />}>
      {kind === "suppliers" ? <table className="w-full min-w-[640px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <TableSortHeading label="Supplier" active={sortKey === "name"} direction={direction} onSort={() => toggleSort("name")} />
        <TableSortHeading label="Category" active={sortKey === "category"} direction={direction} onSort={() => toggleSort("category")} />
        <th scope="col" className="px-5 py-3 text-right">Purchase orders</th>{canManage && <th scope="col" className="px-5 py-3 text-right">Actions</th>}
      </tr></thead><tbody className="divide-y divide-slate-100">{suppliers.map((row) => <tr key={row.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-semibold text-slate-800">{row.name}</td><td className="px-5 py-4 text-slate-600">{row.category}</td><td className="px-5 py-4 text-right text-slate-600">{tables.purchaseOrders.filter((order) => order.supplierId === row.id).length}</td>{canManage && <td className="px-5 py-4 text-right"><DemoRecordActions name={row.name} busy={busy} details={[{ label: "Category", value: row.category }, { label: "Purchase orders", value: tables.purchaseOrders.filter((order) => order.supplierId === row.id).length }]} onEdit={() => openEdit(row.id)} onDelete={() => void remove(row.id, row.name)} /></td>}</tr>)}</tbody></table>
        : <table className="w-full min-w-[700px] text-left text-sm"><thead className={tableHeadClass}><tr>
          <TableSortHeading label="Date" active={sortKey === "date"} direction={direction} onSort={() => toggleSort("date")} />
          <TableSortHeading label="Project" active={sortKey === "project"} direction={direction} onSort={() => toggleSort("project")} />
          <th scope="col" className="px-5 py-3">Summary</th>{canManage && <th scope="col" className="px-5 py-3 text-right">Actions</th>}
        </tr></thead><tbody className="divide-y divide-slate-100">{reports.map((row) => { const projectName = tables.projects.find((project) => project.id === row.projectId)?.name ?? "Unavailable project"; return <tr key={row.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-medium text-slate-600">{row.date}</td><td className="px-5 py-4"><button type="button" onClick={() => setViewingId(row.id)} className="flex items-center gap-3 text-left font-semibold text-slate-800 hover:text-cyan-700"><span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{row.photo ? <Image src={row.photo} alt="" fill sizes="48px" unoptimized={row.photo.startsWith("data:")} className="object-cover" /> : "—"}</span>{projectName}</button></td><td className="max-w-lg px-5 py-4 text-slate-600">{row.summary}</td>{canManage && <td className="px-5 py-4 text-right"><DemoRecordActions name={`${projectName} report`} busy={busy} onView={() => setViewingId(row.id)} onEdit={() => openEdit(row.id)} onDelete={() => void remove(row.id, `${projectName} report`)} /></td>}</tr>; })}</tbody></table>}
    </DataTableShell>
    <p className="mt-3 text-sm text-slate-500">{count} {count === 1 ? "record" : "records"}</p>
    {viewing && <DemoRecordDetailDialog name={`${tables.projects.find((project) => project.id === viewing.projectId)?.name ?? "Project"} report`} photo={viewing.photo} onClose={() => setViewingId(null)} details={[{ label: "Date", value: viewing.date }, { label: "Project", value: tables.projects.find((project) => project.id === viewing.projectId)?.name ?? "Unavailable project" }, { label: "Summary", value: viewing.summary }]} />}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-dataset-title" className="m-auto w-[min(100%-2rem,460px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${formKey}:${editingId ?? "new"}`} onSubmit={(event) => void submit(event)} className="grid gap-4"><DialogHeading id="demo-dataset-title" title={editingId ? `Edit ${kind === "suppliers" ? "supplier" : "daily report"}` : labels[kind].add} onClose={close} disabled={busy} />
      {kind === "suppliers" ? <><label className="grid gap-1.5 text-xs font-semibold">Supplier name<input className={inputClass} name="name" required maxLength={160} defaultValue={selected && "name" in selected ? selected.name : ""} /></label><label className="grid gap-1.5 text-xs font-semibold">Category<input className={inputClass} name="category" required maxLength={160} defaultValue={selected && "category" in selected ? selected.category : ""} /></label></> : null}
      {kind === "reports" ? <><label className="grid gap-1.5 text-xs font-semibold">Project<SelectPicker key={editingId ?? "new"} name="projectId" label="Project" defaultValue={selected && "projectId" in selected ? selected.projectId : availableProjects[0]?.id} options={availableProjects.map((project) => ({ value: project.id, label: project.name }))} /></label><div className="grid gap-1.5 text-xs font-semibold"><span>Report date</span><DatePicker key={editingId ?? "new"} label="Report date" name="date" defaultValue={selected && "date" in selected ? selected.date : new Date().toISOString().slice(0, 10)} allowClear={false} required /></div><label className="grid gap-1.5 text-xs font-semibold">Summary<textarea className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" name="summary" required maxLength={500} defaultValue={selected && "summary" in selected ? selected.summary : ""} /></label><RecordPhotoInput label="Site photo (optional)" currentPhoto={selected && "photo" in selected ? selected.photo : undefined} /></> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || (kind === "reports" && !availableProjects.length)}>{busy ? "Saving…" : "Save"}</Button></div></form></dialog>
  </>;
}
