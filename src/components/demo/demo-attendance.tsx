"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Calendar03Icon, CancelCircleIcon, CheckmarkCircle02Icon, Download04Icon, PlusSignIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { assignDemoEmployee, endDemoEmployeeAssignment, getDemoDatabase, postDemoAttendance, reverseDemoAttendance } from "@/lib/demo/database";
import { formatDemoCentavos } from "@/lib/demo/project-overview";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { downloadCsv } from "@/lib/export/csv";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";

type Assignment = DemoData["employeeAssignments"][number];
type Attendance = DemoData["attendance"][number];
type StatusFilter = "all" | "present" | "absent" | "unmarked";
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20";
const dateLabel = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function DemoAttendance({ tables, role, action, projectId, onChanged }: {
  tables: DemoData;
  role: DemoRole;
  action?: string | null;
  projectId?: string | null;
  onChanged: (message: string) => Promise<void>;
}) {
  const canManage = isDemoManager(role);
  const canViewCost = canManage || role === "accounting";
  const [date, setDate] = useState(() => tables.attendance.toSorted((a, b) => b.date.localeCompare(a.date))[0]?.date ?? today());
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => projectId && tables.projects.some((item) => item.id === projectId) ? projectId : "all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formDate, setFormDate] = useState(date);
  const [formAssignmentId, setFormAssignmentId] = useState("");
  const [formStatus, setFormStatus] = useState<"present" | "absent">("present");
  const [assignmentProjectId, setAssignmentProjectId] = useState(tables.projects.find((item) => item.status === "active")?.id ?? "");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const markDialog = useRef<HTMLDialogElement>(null);
  const assignDialog = useRef<HTMLDialogElement>(null);
  const reverseDialog = useRef<HTMLDialogElement>(null);
  const submitLock = useRef(false);
  const reversedIds = useMemo(() => new Set(tables.attendanceReversals.map((item) => item.attendanceId)), [tables.attendanceReversals]);

  useEffect(() => {
    if (action === "mark" && canManage && !markDialog.current?.open) markDialog.current?.showModal();
  }, [action, canManage]);

  function closeDialog(dialog: HTMLDialogElement | null) {
    dialog?.close();
    setError("");
    if (action) {
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }

  const currentAssignments = tables.employeeAssignments.filter((item) => item.startDate <= date && (!item.endDate || item.endDate >= date));
  const activeEntries = tables.attendance.filter((item) => item.date === date && !reversedIds.has(item.id));
  const entryFor = (assignment: Assignment): Attendance | undefined => activeEntries.find((item) => item.employeeId === assignment.employeeId && item.projectId === assignment.projectId);
  const scope = currentAssignments.filter((item) => (projectFilter === "all" || item.projectId === projectFilter) && (siteFilter === "all" || item.siteId === siteFilter));
  const scopedWorkers = new Set(scope.map((item) => item.employeeId));
  const marked = new Map<string, Array<Attendance["status"] | undefined>>();
  for (const item of scope) marked.set(item.employeeId, [...(marked.get(item.employeeId) ?? []), entryFor(item)?.status]);
  const metrics = [
    { label: "Assigned workers", value: scopedWorkers.size, icon: UserGroupIcon, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Present", value: [...marked.values()].filter((values) => values.includes("present")).length, icon: CheckmarkCircle02Icon, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Absent", value: [...marked.values()].filter((values) => values.every((value) => value === "absent")).length, icon: CancelCircleIcon, tone: "bg-red-50 text-red-700" },
    { label: "Not marked", value: [...marked.values()].filter((values) => !values.includes("present") && values.some((value) => !value)).length, icon: Calendar03Icon, tone: "bg-amber-50 text-amber-700" },
  ];
  const rows = scope.filter((assignment) => {
    const employee = tables.employees.find((item) => item.id === assignment.employeeId);
    const project = tables.projects.find((item) => item.id === assignment.projectId);
    const site = tables.sites.find((item) => item.id === assignment.siteId);
    const status = entryFor(assignment)?.status ?? "unmarked";
    return employee && (tradeFilter === "all" || employee.trade === tradeFilter) && (statusFilter === "all" || status === statusFilter)
      && `${employee.name} ${employee.trade} ${project?.name ?? ""} ${site?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
  }).toSorted((a, b) => (tables.employees.find((item) => item.id === a.employeeId)?.name ?? "").localeCompare(tables.employees.find((item) => item.id === b.employeeId)?.name ?? ""));
  const assignable = tables.employeeAssignments.filter((item) => item.startDate <= formDate && (!item.endDate || item.endDate >= formDate) && tables.projects.find((project) => project.id === item.projectId)?.status === "active");
  const selectedFormAssignment = assignable.find((item) => item.id === formAssignmentId) ?? assignable[0];
  const selectedEmployee = tables.employees.find((item) => item.id === selectedFormAssignment?.employeeId);
  const assignmentSites = tables.sites.filter((item) => item.projectId === assignmentProjectId);
  const trades = [...new Set(tables.employees.map((item) => item.trade))].toSorted();
  const filteredSites = tables.sites.filter((item) => projectFilter === "all" || item.projectId === projectFilter);

  function openMark(assignment?: Assignment) {
    setError(""); setFormDate(date); setFormStatus("present"); setFormAssignmentId(assignment?.id ?? ""); markDialog.current?.showModal();
  }

  async function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const status = formStatus;
      const hoursWorked = status === "absent" ? 0 : Number(form.get("hoursWorked"));
      const dayFraction = status === "absent" ? 0 : Number(form.get("paidDayFraction"));
      if (!Number.isFinite(hoursWorked) || !Number.isFinite(dayFraction) || Math.abs(dayFraction * 10000 - Math.round(dayFraction * 10000)) > 0.000001) throw new Error("Use a paid-day fraction with at most four decimal places.");
      await postDemoAttendance(getDemoDatabase(), { assignmentId: String(form.get("assignmentId") ?? ""), date: formDate, status, hoursWorked, paidDayBasisPoints: Math.round(dayFraction * 10000), note: String(form.get("note") ?? "") });
      setDate(formDate);
      await onChanged("Attendance and labor cost posted.");
      closeDialog(markDialog.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to post attendance."); }
    finally { setBusy(false); submitLock.current = false; }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await assignDemoEmployee(getDemoDatabase(), { employeeId: String(form.get("employeeId") ?? ""), projectId: assignmentProjectId, siteId: String(form.get("siteId") ?? ""), startDate: String(form.get("startDate") ?? "") });
      await onChanged("Employee assigned to the project site.");
      closeDialog(assignDialog.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to assign employee."); }
    finally { setBusy(false); submitLock.current = false; }
  }

  async function submitReversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reversingId || submitLock.current) return;
    submitLock.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await reverseDemoAttendance(getDemoDatabase(), reversingId, String(form.get("reason") ?? ""));
      await onChanged("Attendance reversed; the original remains in history.");
      closeDialog(reverseDialog.current);
      setReversingId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reverse attendance."); }
    finally { setBusy(false); submitLock.current = false; }
  }

  async function endAssignment(assignment: Assignment) {
    if (!window.confirm("End this employee's project-site assignment on the selected date? Past attendance remains unchanged.")) return;
    setBusy(true); setError(""); setEndingId(assignment.id);
    try { await endDemoEmployeeAssignment(getDemoDatabase(), assignment.id, date); await onChanged("Employee assignment ended."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to end assignment."); }
    finally { setBusy(false); setEndingId(null); }
  }

  function exportRows() {
    downloadCsv(`attendance-${date}.csv`, ["Date", "Employee", "Trade", "Project", "Site", "Status", "Hours", "Daily rate (PHP)", "Posted cost (PHP)"], rows.map((assignment) => {
      const employee = tables.employees.find((item) => item.id === assignment.employeeId);
      const entry = entryFor(assignment);
      return [date, employee?.name ?? "Employee", employee?.trade ?? "", tables.projects.find((item) => item.id === assignment.projectId)?.name ?? "", tables.sites.find((item) => item.id === assignment.siteId)?.name ?? "", entry?.status ?? "Not marked", entry?.hoursWorked ?? "", entry?.rateSnapshotCentavos === undefined ? "" : (entry.rateSnapshotCentavos / 100).toFixed(2), entry?.costCentavos === undefined ? "" : (entry.costCentavos / 100).toFixed(2)];
    }));
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-slate-500">Select a date to review assigned workers and posted hours.</p></div><div className="flex flex-wrap gap-2">{canViewCost && <Button variant="outline" onClick={exportRows}><HugeiconsIcon icon={Download04Icon} size={16} />Export CSV</Button>}{canManage && <><Button variant="outline" onClick={() => { setError(""); assignDialog.current?.showModal(); }}><HugeiconsIcon icon={UserGroupIcon} size={16} />Assign employee</Button><Button onClick={() => openMark()}><HugeiconsIcon icon={PlusSignIcon} size={16} />Mark attendance</Button></>}</div></div>
    <div className="w-full max-w-[220px]"><DatePicker label="Attendance date" value={date} onValueChange={setDate} allowClear={false} /></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]"><div className="2xl:col-span-1"><SearchField label="Search workers" placeholder="Search name, trade or site" value={query} onChange={(event) => setQuery(event.target.value)} /></div><SelectPicker label="Filter by project" value={projectFilter} onValueChange={(value) => { setProjectFilter(value); setSiteFilter("all"); }} options={[{ value: "all", label: "All projects" }, ...tables.projects.map((item) => ({ value: item.id, label: item.name }))]} /><SelectPicker label="Filter by site" value={siteFilter} onValueChange={setSiteFilter} options={[{ value: "all", label: "All sites" }, ...filteredSites.map((item) => ({ value: item.id, label: item.name }))]} /><SelectPicker label="Filter by status" value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)} options={[{ value: "all", label: "All statuses" }, { value: "present", label: "Present" }, { value: "absent", label: "Absent" }, { value: "unmarked", label: "Not marked" }]} /><div className="min-w-0"><SelectPicker label="Filter by trade" value={tradeFilter} onValueChange={setTradeFilter} options={[{ value: "all", label: "All trades" }, ...trades.map((trade) => ({ value: trade, label: trade }))]} /></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <DataTableShell empty={rows.length === 0 ? <EmptyState kind="results" title="No workers match these filters" /> : undefined} footer={<span className="text-xs text-slate-500">{rows.length} assignment{rows.length === 1 ? "" : "s"} · {dateLabel.format(new Date(`${date}T12:00:00Z`))}</span>}>
      <table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Worker</th><th className="px-4 py-3">Trade</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Hours</th>{canViewCost && <><th className="px-4 py-3 text-right">Daily rate</th><th className="px-4 py-3 text-right">Posted cost</th></>}{canManage && <th className="px-5 py-3 text-right">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((assignment) => {
        const employee = tables.employees.find((item) => item.id === assignment.employeeId)!;
        const project = tables.projects.find((item) => item.id === assignment.projectId);
        const site = tables.sites.find((item) => item.id === assignment.siteId);
        const entry = entryFor(assignment);
        return <tr key={assignment.id} className="hover:bg-slate-50/60"><td className="px-5 py-3"><div className="flex items-center gap-3"><span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{employee.photo ? <Image src={employee.photo} alt="" fill sizes="36px" unoptimized={employee.photo.startsWith("data:")} className="object-cover" /> : employee.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="font-medium text-slate-900">{employee.name}</span></div></td><td className="px-4 py-3 text-slate-600">{employee.trade}</td><td className="px-4 py-3"><span className="block font-medium text-slate-800">{project?.name}</span><span className="text-xs text-slate-500">{site?.name}</span></td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry?.status === "present" ? "bg-emerald-50 text-emerald-700" : entry?.status === "absent" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{entry ? entry.status === "present" ? "Present" : "Absent" : "Not marked"}</span></td><td className="px-4 py-3 text-right tabular-nums">{entry?.hoursWorked === undefined ? "—" : `${entry.hoursWorked} h`}</td>{canViewCost && <><td className="px-4 py-3 text-right tabular-nums">{entry?.rateSnapshotCentavos === undefined ? "—" : formatDemoCentavos(entry.rateSnapshotCentavos)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{entry?.costCentavos === undefined ? "—" : formatDemoCentavos(entry.costCentavos)}</td></>}{canManage && <td className="px-5 py-3 text-right">{entry ? <Button variant="outline" size="sm" disabled={busy} onClick={() => { setError(""); setReversingId(entry.id); reverseDialog.current?.showModal(); }}>Reverse</Button> : <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => openMark(assignment)}>Mark</Button>{!assignment.endDate && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void endAssignment(assignment)}>{endingId === assignment.id ? "Ending…" : "End"}</Button>}</div>}</td>}</tr>;
      })}</tbody></table>
    </DataTableShell>
    <dialog ref={markDialog} className="m-auto w-[min(100%-2rem,540px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45" aria-labelledby="mark-attendance-title"><form onSubmit={(event) => void submitAttendance(event)} className="grid gap-4"><DialogHeading id="mark-attendance-title" title="Mark attendance" onClose={() => closeDialog(markDialog.current)} disabled={busy} /><label className="grid gap-1.5 text-sm font-medium">Work date<DatePicker label="Work date" value={formDate} onValueChange={(next) => { setFormDate(next); setFormAssignmentId(""); }} allowClear={false} required /></label><label className="grid gap-1.5 text-sm font-medium">Assigned worker / site<SelectPicker label="Assigned worker and site" name="assignmentId" value={selectedFormAssignment?.id ?? ""} onValueChange={setFormAssignmentId} options={assignable.map((item) => ({ value: item.id, label: `${tables.employees.find((employee) => employee.id === item.employeeId)?.name ?? "Worker"} · ${tables.projects.find((project) => project.id === item.projectId)?.name ?? "Project"} · ${tables.sites.find((site) => site.id === item.siteId)?.name ?? "Site"}` }))} /></label><label className="grid gap-1.5 text-sm font-medium">Status<SelectPicker label="Attendance status" value={formStatus} onValueChange={(value) => setFormStatus(value as "present" | "absent")} options={[{ value: "present", label: "Present" }, { value: "absent", label: "Absent" }]} /></label>{formStatus === "present" && <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Hours worked<input key={formStatus} className={inputClass} name="hoursWorked" type="number" min="0.01" max="24" step="0.01" defaultValue="8" required /></label><label className="grid gap-1.5 text-sm font-medium">Paid-day fraction<input className={inputClass} name="paidDayFraction" type="number" min="0.0001" max="1" step="0.0001" defaultValue="1" required /></label></div>}{formStatus === "present" && <p className="text-xs text-slate-500">{selectedEmployee?.dailyWageCentavos === undefined ? "Set this worker's daily wage in Employees before posting." : `Current daily rate ${formatDemoCentavos(selectedEmployee.dailyWageCentavos)}. Cost uses a saved rate snapshot × the explicit paid-day fraction; hours are tracked separately.`}</p>}<label className="grid gap-1.5 text-sm font-medium">Work note<input className={inputClass} name="note" minLength={3} maxLength={500} placeholder={formStatus === "present" ? "Work completed at the site" : "Reason for absence"} required /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => closeDialog(markDialog.current)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !selectedFormAssignment || formStatus === "present" && !selectedEmployee?.dailyWageCentavos}>{busy ? "Posting…" : "Post attendance"}</Button></div></form></dialog>
    <dialog ref={assignDialog} className="m-auto w-[min(100%-2rem,500px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45" aria-labelledby="assign-employee-title"><form onSubmit={(event) => void submitAssignment(event)} className="grid gap-4"><DialogHeading id="assign-employee-title" title="Assign employee" onClose={() => closeDialog(assignDialog.current)} disabled={busy} /><label className="grid gap-1.5 text-sm font-medium">Employee<SelectPicker label="Employee" name="employeeId" defaultValue={tables.employees[0]?.id} options={tables.employees.map((item) => ({ value: item.id, label: `${item.name} · ${item.trade}` }))} /></label><label className="grid gap-1.5 text-sm font-medium">Project<SelectPicker label="Project" value={assignmentProjectId} onValueChange={setAssignmentProjectId} options={tables.projects.filter((item) => item.status === "active").map((item) => ({ value: item.id, label: item.name }))} /></label><label className="grid gap-1.5 text-sm font-medium">Site<SelectPicker key={assignmentProjectId} label="Site" name="siteId" defaultValue={assignmentSites[0]?.id} options={assignmentSites.map((item) => ({ value: item.id, label: item.name }))} /></label><label className="grid gap-1.5 text-sm font-medium">Assignment starts<DatePicker label="Assignment start date" name="startDate" defaultValue={date} allowClear={false} required /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => closeDialog(assignDialog.current)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !assignmentSites.length}>{busy ? "Assigning…" : "Assign"}</Button></div></form></dialog>
    <dialog ref={reverseDialog} className="m-auto w-[min(100%-2rem,440px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45" aria-labelledby="reverse-attendance-title"><form onSubmit={(event) => void submitReversal(event)} className="grid gap-4"><DialogHeading id="reverse-attendance-title" title="Reverse attendance" onClose={() => closeDialog(reverseDialog.current)} disabled={busy} /><p className="text-sm text-slate-600">The original entry stays in history. Its posted cost is removed from project totals.</p><label className="grid gap-1.5 text-sm font-medium">Reason<input className={inputClass} name="reason" minLength={3} maxLength={500} required /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => closeDialog(reverseDialog.current)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Reversing…" : "Reverse entry"}</Button></div></form></dialog>
  </div>;
}
