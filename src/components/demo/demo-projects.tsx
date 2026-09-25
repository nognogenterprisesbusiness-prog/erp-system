"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { DatePicker } from "@/components/ui/date-picker";
import { LocationPicker } from "@/components/ui/location-picker";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import { ProjectSummaryCard } from "@/components/projects/project-summary-card";
import { deleteDemoRecord, getDemoDatabase, registerDemoProject, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { demoProjectOverview, formatDemoCentavos, parseDemoProjectAmount } from "@/lib/demo/project-overview";
import { visibleDemoProjectIds } from "@/lib/demo/visibility";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { DemoProjectDetail } from "./demo-project-detail";

type Project = DemoData["projects"][number];
type SortKey = "name" | "code" | "location" | "status" | "initialBudgetCentavos";
type Status = "all" | Project["status"];
const statuses: { value: Status; label: string }[] = [
  { value: "all", label: "All" }, { value: "active", label: "Ongoing" },
  { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" },
];
const sortOptions: { value: string; label: string; key: SortKey; direction: "asc" | "desc" }[] = [
  { value: "code:asc", label: "Code A–Z", key: "code", direction: "asc" },
  { value: "code:desc", label: "Code Z–A", key: "code", direction: "desc" },
  { value: "name:asc", label: "Name A–Z", key: "name", direction: "asc" },
  { value: "name:desc", label: "Name Z–A", key: "name", direction: "desc" },
  { value: "location:asc", label: "Location A–Z", key: "location", direction: "asc" },
  { value: "location:desc", label: "Location Z–A", key: "location", direction: "desc" },
  { value: "status:asc", label: "Status A–Z", key: "status", direction: "asc" },
  { value: "status:desc", label: "Status Z–A", key: "status", direction: "desc" },
  { value: "initialBudgetCentavos:asc", label: "Budget low–high", key: "initialBudgetCentavos", direction: "asc" },
  { value: "initialBudgetCentavos:desc", label: "Budget high–low", key: "initialBudgetCentavos", direction: "desc" },
];
const shortDate = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const displayDate = (value?: string) => value ? shortDate.format(new Date(`${value}T12:00:00Z`)) : "Not set";
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

export function DemoProjects({ tables, role, userId, action, projectId, tab, onChanged }: { tables: DemoData; role: DemoRole; userId: string; action?: string | null; projectId?: string | null; tab?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [page, setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const canManage = isDemoManager(role);
  const canViewFinance = canManage || role === "project_manager" || role === "accounting";
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
      const changes = { code: String(form.get("code") ?? "").toUpperCase(), name: String(form.get("name") ?? ""), location: String(form.get("location") ?? ""), municipalityCode, address: String(form.get("address") ?? ""), status: String(form.get("status") ?? "active"), startDate: String(form.get("startDate") ?? "") || undefined, targetCompletionDate: String(form.get("targetCompletionDate") ?? "") || undefined, contractValueCentavos: parseDemoProjectAmount(String(form.get("contractValue") ?? ""), "Contract value"), initialBudgetCentavos: parseDemoProjectAmount(String(form.get("initialBudget") ?? ""), "Initial budget"), ...(photo ? { photo } : {}) };
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
    try { await deleteDemoRecord(getDemoDatabase(), "projects", id); await onChanged("Project deleted."); if (projectId === id) window.history.pushState(null, "", "/demo?view=projects"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete project."); }
    finally { setBusy(false); }
  }

  const visibleIds = visibleDemoProjectIds(tables, role, userId);
  const normalized = query.trim().toLocaleLowerCase();
  const projects = tables.projects.filter((project) => visibleIds.has(project.id) && (status === "all" || project.status === status) && (!normalized || `${project.code} ${project.name} ${project.location}`.toLocaleLowerCase().includes(normalized)))
    .toSorted((a, b) => {
      const comparison = sortKey === "initialBudgetCentavos" ? (a.initialBudgetCentavos ?? -1) - (b.initialBudgetCentavos ?? -1) : a[sortKey].localeCompare(b[sortKey]);
      return direction === "asc" ? comparison : -comparison;
    });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(projects.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleProjects = projects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const viewing = tables.projects.find((project) => project.id === projectId && visibleIds.has(project.id));
  const editing = tables.projects.find((project) => project.id === editingId);
  const count = tables.projects.filter((project) => visibleIds.has(project.id)).length;

  return <>
    {error && projectId ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {projectId ? viewing ? <DemoProjectDetail key={viewing.id} project={viewing} tables={tables} role={role} userId={userId} tab={tab} onChanged={onChanged} onEdit={() => openEdit(viewing.id)} onDelete={() => void remove(viewing.id, viewing.name)} busy={busy} /> : <div><EmptyState kind="results" title="Project unavailable" description="This project does not exist or is not available to this account." /><Button variant="outline" onClick={() => window.history.pushState(null, "", "/demo?view=projects")}>Back to projects</Button></div> : <>
    <div className="flex flex-wrap items-center gap-3">
      <SearchField label="Search projects" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search project, code or location" wrapperClassName="min-w-[210px] max-w-sm flex-1" />
      <div className="w-full sm:w-40"><SelectPicker label="Filter projects by status" value={status} onValueChange={(value) => { const selected = statuses.find((item) => item.value === value); if (selected) { setStatus(selected.value); setPage(1); } }} options={statuses} /></div>
      <div className="w-full sm:w-44"><SelectPicker label="Sort projects" value={`${sortKey}:${direction}`} onValueChange={(value) => { const selected = sortOptions.find((item) => item.value === value); if (selected) { setSortKey(selected.key); setDirection(selected.direction); setPage(1); } }} options={canViewFinance ? sortOptions : sortOptions.filter((item) => item.key !== "initialBudgetCentavos")} /></div>
      {canManage ? <Button className="rounded-full px-5 sm:ml-auto" onClick={() => { setEditingId(null); dialog.current?.showModal(); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />Add project</Button> : null}
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {projects.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProjects.map((project) => {
      const overview = demoProjectOverview(tables, project.id);
      const assignedCount = tables.projectAssignments.filter((assignment) => assignment.projectId === project.id).length;
      return <ProjectSummaryCard key={project.id} navigation="history" href={`/demo?view=projects&project=${encodeURIComponent(project.id)}`} code={project.code} name={project.name} location={project.location} photo={project.photo} status={project.status === "active" ? "Ongoing" : project.status === "on_hold" ? "On hold" : "Completed"} statusTone={project.status === "active" ? "active" : project.status === "on_hold" ? "warning" : "neutral"} progress={overview.latestProgress?.progressPercent} showProgress details={[
        { label: "Target date", value: displayDate(project.targetCompletionDate) },
        { label: "Assigned staff", value: String(assignedCount) },
        ...(canViewFinance ? [{ label: "Initial budget", value: project.initialBudgetCentavos === undefined ? "Not set" : formatDemoCentavos(project.initialBudgetCentavos) }, { label: "Materials used cost", value: formatDemoCentavos(overview.materialCostCentavos) }] : []),
      ]} />;
    })}</div> : <div className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={count ? "results" : "items"} title={count ? "No matching projects" : "No projects yet"} description={count ? "Try another search or status." : "Add the first project to start tracking work."} /></div>}
    <p className="mt-3 text-sm text-slate-500">{projects.length} of {count} projects</p>
    {pageCount > 1 && <div className="mt-3 flex items-center justify-end gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-sm text-slate-500">{currentPage} / {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
    </>}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-add-project-title" className="m-auto w-[min(100%-2rem,500px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${formKey}:${editingId ?? "new"}`} onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeading id="demo-add-project-title" title={editingId ? "Edit project" : "Add project"} onClose={close} disabled={busy} />
      <label className="grid gap-1.5 text-xs font-semibold">Project code<input className={inputClass} name="code" required maxLength={160} placeholder="DEMO-003" defaultValue={editing?.code} /></label>
      <label className="grid gap-1.5 text-xs font-semibold">Project name<input className={inputClass} name="name" required maxLength={160} defaultValue={editing?.name} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><PesoAmountInput name="contractValue" label="Contract value" defaultValue={editing?.contractValueCentavos === undefined ? "" : (editing.contractValueCentavos / 100).toFixed(2)} placeholder="Optional" /><PesoAmountInput name="initialBudget" label="Initial budget" defaultValue={editing?.initialBudgetCentavos === undefined ? "" : (editing.initialBudgetCentavos / 100).toFixed(2)} placeholder="Optional" /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5 text-xs font-semibold"><span>Start date</span><DatePicker label="Start date" name="startDate" defaultValue={editing?.startDate} /></div><div className="grid gap-1.5 text-xs font-semibold"><span>Target completion</span><DatePicker label="Target completion" name="targetCompletionDate" defaultValue={editing?.targetCompletionDate} /></div></div>
      <LocationPicker demo displayNameName="location" initialCode={editing?.municipalityCode ?? ""} initialLabel={editing?.location ?? ""} />
      <label className="grid gap-1.5 text-xs font-semibold">Street / site address<input className={inputClass} name="address" maxLength={300} defaultValue={editing?.address} /></label>
      {editingId ? <div className="grid gap-1.5 text-xs font-semibold"><span>Status</span><SelectPicker label="Project status" name="status" defaultValue={editing?.status} options={statuses.filter((item) => item.value !== "all")} /></div> : <label className="grid gap-1.5 text-xs font-semibold">First site name<input className={inputClass} name="siteName" required maxLength={160} /></label>}
      <RecordPhotoInput label="Project photo (optional)" currentPhoto={editing?.photo} />
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </form></dialog>
  </>;
}
