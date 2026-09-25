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
import { PercentageInput } from "@/components/ui/percentage-input";
import { TableSortHeading, tableHeadClass } from "@/components/ui/table-sort-heading";
import { deleteDemoRecord, getDemoDatabase, recordDemoSupplierPrice, registerDemoDailyReport, registerDemoSupplier, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { visibleDemoProjectIds } from "@/lib/demo/visibility";
import { todayInManila } from "@/lib/date";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { DemoRecordActions } from "./demo-record-actions";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";
import { SupplierPhoto } from "@/components/suppliers/supplier-photo";

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
  const [priceError, setPriceError] = useState("");
  const [priceBusy, setPriceBusy] = useState(false);
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
        const photoFile = data.get("photo");
        const photo = photoFile instanceof File && photoFile.size ? await demoPhotoFromFile(photoFile) : undefined;
        const changes = { name: value("name"), category: value("category"), ...(photo ? { photo } : {}) };
        if (editingId) await updateDemoRecord(getDemoDatabase(), "suppliers", editingId, changes);
        else await registerDemoSupplier(getDemoDatabase(), changes);
      } else {
        const photoFile = data.get("photo");
        const photo = photoFile instanceof File && photoFile.size ? await demoPhotoFromFile(photoFile) : undefined;
        const progressValue = value("progressPercent").trim();
        const changes = { projectId: value("projectId"), date: value("date"), summary: value("summary"), progressPercent: progressValue === "" ? undefined : Number(progressValue), ...(photo ? { photo } : {}) };
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

  async function savePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewingId || priceBusy) return;
    const formElement = event.currentTarget;
    setPriceBusy(true); setPriceError("");
    const form = new FormData(formElement);
    const input = String(form.get("price") ?? "").trim();
    try {
      if (!/^\d+(?:\.\d{1,2})?$/.test(input)) throw new Error("Enter a price with at most two decimal places.");
      const [whole, fraction = ""] = input.split(".");
      const priceCentavos = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (!Number.isSafeInteger(priceCentavos) || priceCentavos <= 0 || priceCentavos > 1_000_000_000) throw new Error("Enter a valid positive price.");
      await recordDemoSupplierPrice(getDemoDatabase(), { supplierId: viewingId, materialId: String(form.get("materialId") ?? ""), effectiveOn: String(form.get("effectiveOn") ?? ""), priceCentavos });
      await onChanged("Supplier price recorded.");
      formElement.reset();
    } catch (cause) { setPriceError(cause instanceof Error ? cause.message : "Unable to record price."); }
    finally { setPriceBusy(false); }
  }

  const needle = query.trim().toLowerCase();
  const suppliers = tables.suppliers.filter((row) => !needle || `${row.name} ${row.category}`.toLowerCase().includes(needle))
    .toSorted((a, b) => { const key = sortKey === "category" ? "category" : "name"; return (direction === "asc" ? 1 : -1) * a[key].localeCompare(b[key]); });
  const reports = tables.dailyReports.filter((row) => projectIds.has(row.projectId) && (!reportDateFrom || row.date >= reportDateFrom) && (!reportDateTo || row.date <= reportDateTo) && (!needle || `${row.date} ${row.summary} ${tables.projects.find((project) => project.id === row.projectId)?.name ?? ""}`.toLowerCase().includes(needle)))
    .toSorted((a, b) => { const left = sortKey === "project" ? tables.projects.find((project) => project.id === a.projectId)?.name ?? "" : a.date; const right = sortKey === "project" ? tables.projects.find((project) => project.id === b.projectId)?.name ?? "" : b.date; return (direction === "asc" ? 1 : -1) * left.localeCompare(right); });
  const count = kind === "suppliers" ? suppliers.length : reports.length;
  const viewing = reports.find((row) => row.id === viewingId);
  const viewingSupplier = suppliers.find((row) => row.id === viewingId);
  const supplierPrices = viewingSupplier ? tables.supplierPrices.filter((row) => row.supplierId === viewingSupplier.id).toSorted((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.createdAt.localeCompare(a.createdAt)) : [];

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SearchField label={`Search ${labels[kind].title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${labels[kind].title.toLowerCase()}`} wrapperClassName="min-w-[210px] max-w-sm flex-1" />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {kind === "reports" && <DateRangePicker startDate={reportDateFrom} endDate={reportDateTo} onStartChange={setReportDateFrom} onEndChange={setReportDateTo} className="w-full sm:w-[292px]" />}
        {canCreate ? <Button onClick={() => { setEditingId(null); dialog.current?.showModal(); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />{labels[kind].add}</Button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {kind === "suppliers" ? suppliers.length ? <section aria-label="Suppliers" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{suppliers.map((row) => <article key={row.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><div className="flex min-w-0 items-center gap-3"><SupplierPhoto name={row.name} photo={row.photo} className="size-14" sizes="56px" /><div className="min-w-0"><button type="button" onClick={() => setViewingId(row.id)} className="block max-w-full truncate text-left text-base font-semibold text-slate-900 hover:text-cyan-700">{row.name}</button><p className="mt-0.5 truncate text-xs text-slate-500">{row.category}</p></div></div><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Purchase orders</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{tables.purchaseOrders.filter((order) => order.supplierId === row.id).length}</p></div><div className="mt-auto flex justify-end pt-3">{canManage ? <DemoRecordActions name={row.name} busy={busy} onView={() => setViewingId(row.id)} onEdit={() => openEdit(row.id)} onDelete={() => void remove(row.id, row.name)} /> : <button type="button" onClick={() => setViewingId(row.id)} className="text-sm font-medium text-cyan-700 hover:underline">View details</button>}</div></article>)}</section> : <section className="mt-4 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={needle ? "results" : "items"} title={needle ? "No matching suppliers" : labels.suppliers.empty} description={needle ? "Try a different search." : canCreate ? "Use “Add supplier” to create a record." : "No records available to this account."} /></section> : <DataTableShell empty={count ? undefined : needle || reportDateFrom || reportDateTo ? <EmptyState kind="results" title="No matching records" description="Try a different search or date." /> : <EmptyState kind="items" title={labels.reports.empty} description={canCreate ? `Use “${labels.reports.add}” to create a record.` : "No records available to this account."} />}>
      <table className="w-full min-w-[700px] text-left text-sm"><thead className={tableHeadClass}><tr>
          <TableSortHeading label="Date" active={sortKey === "date"} direction={direction} onSort={() => toggleSort("date")} />
          <TableSortHeading label="Project" active={sortKey === "project"} direction={direction} onSort={() => toggleSort("project")} />
          <th scope="col" className="px-5 py-3">Summary</th>{canManage && <th scope="col" className="px-5 py-3 text-right">Actions</th>}
        </tr></thead><tbody className="divide-y divide-slate-100">{reports.map((row) => { const projectName = tables.projects.find((project) => project.id === row.projectId)?.name ?? "Unavailable project"; return <tr key={row.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-medium text-slate-600">{row.date}</td><td className="px-5 py-4"><button type="button" onClick={() => setViewingId(row.id)} className="flex items-center gap-3 text-left font-semibold text-slate-800 hover:text-cyan-700"><span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{row.photo ? <Image src={row.photo} alt="" fill sizes="48px" unoptimized={row.photo.startsWith("data:")} className="object-cover" /> : "—"}</span>{projectName}</button></td><td className="max-w-lg px-5 py-4 text-slate-600">{row.summary}</td>{canManage && <td className="px-5 py-4 text-right"><DemoRecordActions name={`${projectName} report`} busy={busy} onView={() => setViewingId(row.id)} onEdit={() => openEdit(row.id)} onDelete={() => void remove(row.id, `${projectName} report`)} /></td>}</tr>; })}</tbody></table>
    </DataTableShell>}
    <p className="mt-3 text-sm text-slate-500">{count} {count === 1 ? "record" : "records"}</p>
    {viewing && <DemoRecordDetailDialog name={`${tables.projects.find((project) => project.id === viewing.projectId)?.name ?? "Project"} report`} photo={viewing.photo} onClose={() => setViewingId(null)} details={[{ label: "Date", value: viewing.date }, { label: "Project", value: tables.projects.find((project) => project.id === viewing.projectId)?.name ?? "Unavailable project" }, ...(viewing.progressPercent === undefined ? [] : [{ label: "Progress", value: `${viewing.progressPercent}%` }]), { label: "Summary", value: viewing.summary }]} />}
    {viewingSupplier && <DemoRecordDetailDialog name={viewingSupplier.name} photo={viewingSupplier.photo} showPhotoPlaceholder onClose={() => { setViewingId(null); setPriceError(""); }} details={[{ label: "Category", value: viewingSupplier.category }, { label: "Purchase orders", value: tables.purchaseOrders.filter((order) => order.supplierId === viewingSupplier.id).length }]}>
      <section className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">Material price history</h3>{supplierPrices.length ? <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[390px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">Effective date</th><th className="px-3 py-2">Material</th><th className="px-3 py-2 text-right">Price / unit</th></tr></thead><tbody className="divide-y divide-slate-100">{supplierPrices.map((price) => <tr key={price.id}><td className="px-3 py-2 text-slate-600">{price.effectiveOn}</td><td className="px-3 py-2">{tables.materials.find((material) => material.id === price.materialId)?.name ?? "Material"}</td><td className="px-3 py-2 text-right font-semibold">₱{(price.priceCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td></tr>)}</tbody></table></div> : <EmptyState compact kind="items" title="No prices recorded" />}
        {canManage && <form onSubmit={(event) => void savePrice(event)} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3"><h4 className="text-xs font-semibold">Record new price</h4><label className="grid gap-1 text-xs font-medium">Material<SelectPicker label="Material" name="materialId" defaultValue={tables.materials[0]?.id} options={tables.materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}` }))} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium">Unit price (PHP)<input name="price" inputMode="decimal" required placeholder="120.00" className={inputClass} /></label><label className="grid gap-1 text-xs font-medium">Effective date<DatePicker label="Effective date" name="effectiveOn" defaultValue={todayInManila()} allowClear={false} required /></label></div>{priceError && <p role="alert" className="text-xs text-red-700">{priceError}</p>}<Button type="submit" disabled={priceBusy || !tables.materials.length}>{priceBusy ? "Saving…" : "Record price"}</Button></form>}
      </section>
    </DemoRecordDetailDialog>}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-dataset-title" className="m-auto w-[min(100%-2rem,460px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${formKey}:${editingId ?? "new"}`} onSubmit={(event) => void submit(event)} className="grid gap-4"><DialogHeading id="demo-dataset-title" title={editingId ? `Edit ${kind === "suppliers" ? "supplier" : "daily report"}` : labels[kind].add} onClose={close} disabled={busy} />
      {kind === "suppliers" ? <><label className="grid gap-1.5 text-xs font-semibold">Supplier name<input className={inputClass} name="name" required maxLength={160} defaultValue={selected && "name" in selected ? selected.name : ""} /></label><label className="grid gap-1.5 text-xs font-semibold">Category<input className={inputClass} name="category" required maxLength={160} defaultValue={selected && "category" in selected ? selected.category : ""} /></label><RecordPhotoInput label="Supplier photo (optional)" currentPhoto={selected && "photo" in selected ? selected.photo : undefined} /></> : null}
      {kind === "reports" ? <><label className="grid gap-1.5 text-xs font-semibold">Project<SelectPicker key={editingId ?? "new"} name="projectId" label="Project" defaultValue={selected && "projectId" in selected ? selected.projectId : availableProjects[0]?.id} options={availableProjects.map((project) => ({ value: project.id, label: project.name }))} /></label><div className="grid gap-1.5 text-xs font-semibold"><span>Report date</span><DatePicker key={editingId ?? "new"} label="Report date" name="date" defaultValue={selected && "date" in selected ? selected.date : new Date().toISOString().slice(0, 10)} allowClear={false} required /></div><label className="grid gap-1.5 text-xs font-semibold">Progress % (optional)<PercentageInput className={inputClass} name="progressPercent" placeholder="0–100" defaultValue={selected && "progressPercent" in selected ? selected.progressPercent : undefined} /></label><label className="grid gap-1.5 text-xs font-semibold">Summary<textarea className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" name="summary" required maxLength={500} defaultValue={selected && "summary" in selected ? selected.summary : ""} /></label><RecordPhotoInput label="Site photo (optional)" currentPhoto={selected && "photo" in selected ? selected.photo : undefined} /></> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || (kind === "reports" && !availableProjects.length)}>{busy ? "Saving…" : "Save"}</Button></div></form></dialog>
  </>;
}
