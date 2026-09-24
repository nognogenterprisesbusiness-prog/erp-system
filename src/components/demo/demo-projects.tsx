"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Building03Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { LocationPicker } from "@/components/ui/location-picker";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { TableSortHeading, tableHeadClass } from "@/components/ui/table-sort-heading";
import { deleteDemoRecord, getDemoDatabase, registerDemoProject, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { visibleDemoProjectIds } from "@/lib/demo/visibility";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { DemoRecordActions } from "./demo-record-actions";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";

type Project = DemoData["projects"][number];
type SortKey = "name" | "code" | "location" | "status";
type Status = "all" | Project["status"];
const statuses: { value: Status; label: string }[] = [
  { value: "all", label: "All" }, { value: "active", label: "Ongoing" },
  { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" },
];
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

export function DemoProjects({ tables, role, userId, action, onChanged }: { tables: DemoData; role: DemoRole; userId: string; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [page, setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const canManage = isDemoManager(role);
  useEffect(() => { if (action === "add" && canManage && !dialog.current?.open) { setEditingId(null); dialog.current?.showModal(); } }, [action, canManage]);

  function openEdit(id: string) { setEditingId(id); setFormKey((value) => value + 1); dialog.current?.showModal(); }

  function close() {
    dialog.current?.close();
    setError("");
    setEditingId(null);
    setFormKey((value) => value + 1);
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) { url.searchParams.delete("action"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const photoFile = form.get("photo");
    try {
      const photo = photoFile instanceof File && photoFile.size ? await demoPhotoFromFile(photoFile) : undefined;
      const municipalityCode = String(form.get("municipalityCode") ?? "");
      if (!/^\d{10}$/.test(municipalityCode)) throw new Error("Choose a city or municipality from the list.");
      const changes = { code: String(form.get("code") ?? "").toUpperCase(), name: String(form.get("name") ?? ""), location: String(form.get("location") ?? ""), municipalityCode, address: String(form.get("address") ?? ""), status: String(form.get("status") ?? "active"), ...(photo ? { photo } : {}) };
      if (editingId) await updateDemoRecord(getDemoDatabase(), "projects", editingId, changes);
      else await registerDemoProject(getDemoDatabase(), { ...changes, status: "active", siteName: String(form.get("siteName") ?? ""), photo });
      await onChanged(editingId ? "Project saved." : "Project added.");
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add project."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? Only projects without linked work or history can be removed.`)) return;
    setBusy(true); setError("");
    try { await deleteDemoRecord(getDemoDatabase(), "projects", id); setViewingId(null); await onChanged("Project deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete project."); }
    finally { setBusy(false); }
  }

  const visibleIds = visibleDemoProjectIds(tables, role, userId);
  const normalized = query.trim().toLocaleLowerCase();
  const projects = tables.projects.filter((project) => visibleIds.has(project.id) && (status === "all" || project.status === status) && (!normalized || `${project.code} ${project.name} ${project.location}`.toLocaleLowerCase().includes(normalized)))
    .toSorted((a, b) => direction === "asc" ? a[sortKey].localeCompare(b[sortKey]) : b[sortKey].localeCompare(a[sortKey]));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(projects.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleProjects = projects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const viewing = tables.projects.find((project) => project.id === viewingId && visibleIds.has(project.id));
  const count = tables.projects.filter((project) => visibleIds.has(project.id)).length;
  const toggleSort = (field: SortKey) => { if (sortKey === field) setDirection((value) => value === "asc" ? "desc" : "asc"); else { setSortKey(field); setDirection("asc"); } };

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SearchField label="Search projects" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search project, code or location" wrapperClassName="min-w-[210px] max-w-sm flex-1" />
      {canManage ? <Button className="rounded-full px-5" onClick={() => { setEditingId(null); dialog.current?.showModal(); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />Add project</Button> : null}
    </div>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter projects by status">{statuses.map((item) => <button key={item.value} type="button" onClick={() => { setStatus(item.value); setPage(1); }} aria-pressed={status === item.value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${status === item.value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-cyan-500 hover:text-cyan-700"}`}>{item.label}</button>)}</div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <DataTableShell empty={projects.length ? undefined : count ? <EmptyState kind="results" title="No matching projects" description="Try another search or status." /> : <EmptyState kind="items" title="No projects yet" description="Add the first project to start tracking work." />}>
      <table className="w-full min-w-[700px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <TableSortHeading label="Code" active={sortKey === "code"} direction={direction} onSort={() => toggleSort("code")} />
        <TableSortHeading label="Project" active={sortKey === "name"} direction={direction} onSort={() => toggleSort("name")} />
        <TableSortHeading label="Location" active={sortKey === "location"} direction={direction} onSort={() => toggleSort("location")} />
        <TableSortHeading label="Status" active={sortKey === "status"} direction={direction} onSort={() => toggleSort("status")} />
        <th scope="col" className="px-5 py-3 text-right">Actions</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{visibleProjects.map((project) => {
        return <tr key={project.id} className="hover:bg-slate-50/70">
          <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-600">{project.code}</td>
          <td className="px-5 py-3"><div className="flex items-center gap-3"><button type="button" onClick={() => setViewingId(project.id)} aria-label={`View ${project.name}`} className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{project.photo ? <Image src={project.photo} alt="" fill sizes="56px" unoptimized={project.photo.startsWith("data:")} className="object-cover" /> : <HugeiconsIcon icon={Building03Icon} size={23} />}</button><button type="button" onClick={() => setViewingId(project.id)} className="text-left font-semibold text-slate-800 hover:text-cyan-700">{project.name}</button></div></td>
          <td className="px-5 py-3 text-slate-600">{project.location}</td>
          <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${project.status === "active" ? "bg-emerald-50 text-emerald-700" : project.status === "on_hold" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{project.status === "active" ? "Ongoing" : project.status === "on_hold" ? "On hold" : "Completed"}</span></td>
          <td className="px-5 py-3 text-right"><div className="flex items-center justify-end gap-4">{canManage ? <DemoRecordActions name={project.name} busy={busy} onView={() => setViewingId(project.id)} onEdit={() => openEdit(project.id)} onDelete={() => void remove(project.id, project.name)} /> : <button type="button" onClick={() => setViewingId(project.id)} className="text-sm font-semibold text-cyan-700 hover:underline">View</button>}</div></td>
        </tr>;
      })}</tbody></table>
    </DataTableShell>
    <p className="mt-3 text-sm text-slate-500">{projects.length} of {count} projects</p>
    {pageCount > 1 && <div className="mt-3 flex items-center justify-end gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-sm text-slate-500">{currentPage} / {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
    {viewing && <DemoRecordDetailDialog name={viewing.name} photo={viewing.photo} onClose={() => setViewingId(null)} details={[{ label: "Code", value: viewing.code }, { label: "Status", value: statuses.find((item) => item.value === viewing.status)?.label ?? viewing.status }, { label: "City", value: viewing.location }, { label: "Address", value: viewing.address || viewing.location }, { label: "Sites", value: tables.sites.filter((site) => site.projectId === viewing.id).map((site) => site.name).join(", ") || "None" }, { label: "Daily reports", value: tables.dailyReports.filter((report) => report.projectId === viewing.id).length }, { label: "Material requests", value: tables.materialRequests.filter((request) => request.projectId === viewing.id).length }]} />}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-add-project-title" className="m-auto w-[min(100%-2rem,500px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${formKey}:${editingId ?? "new"}`} onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeading id="demo-add-project-title" title={editingId ? "Edit project" : "Add project"} onClose={close} disabled={busy} />
      <label className="grid gap-1.5 text-xs font-semibold">Project code<input className={inputClass} name="code" required maxLength={160} placeholder="DEMO-003" defaultValue={tables.projects.find((item) => item.id === editingId)?.code} /></label>
      <label className="grid gap-1.5 text-xs font-semibold">Project name<input className={inputClass} name="name" required maxLength={160} defaultValue={tables.projects.find((item) => item.id === editingId)?.name} /></label>
      <LocationPicker demo displayNameName="location" initialCode={tables.projects.find((item) => item.id === editingId)?.municipalityCode ?? ""} initialLabel={tables.projects.find((item) => item.id === editingId)?.location ?? ""} />
      <label className="grid gap-1.5 text-xs font-semibold">Street / site address<input className={inputClass} name="address" maxLength={300} defaultValue={tables.projects.find((item) => item.id === editingId)?.address} /></label>
      {editingId ? <div className="grid gap-1.5 text-xs font-semibold"><span>Status</span><SelectPicker label="Project status" name="status" defaultValue={tables.projects.find((item) => item.id === editingId)?.status} options={statuses.filter((item) => item.value !== "all")} /></div> : <label className="grid gap-1.5 text-xs font-semibold">First site name<input className={inputClass} name="siteName" required maxLength={160} /></label>}
      <RecordPhotoInput label="Project photo (optional)" currentPhoto={tables.projects.find((item) => item.id === editingId)?.photo} />
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </form></dialog>
  </>;
}
