"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowLeft02Icon, Building03Icon, Calendar03Icon, ChartBarLineIcon, Cash01Icon, Delete02Icon, Download04Icon, PencilEdit02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { HistoryLink } from "@/components/layout/history-link";
import { ProjectCostBreakdown } from "@/components/projects/project-cost-breakdown";
import { ShareProjectButton } from "@/components/projects/share-project-button";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { demoProjectOverview, formatDemoCentavos } from "@/lib/demo/project-overview";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { downloadCsv } from "@/lib/export/csv";
import { DemoProjectMaterialPlan } from "./demo-project-material-plan";
import { ProjectDocuments, ProjectFinance, ProjectLabour, ProjectMaterialCoverage, ProjectMaterialRequests, ProjectSites, ProjectSiteStock } from "./demo-project-sections";

type Project = DemoData["projects"][number];
type Section = "overview" | "sites" | "labour" | "materials" | "finance" | "documents";
const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "sites", label: "Sites" },
  { id: "labour", label: "Labour" }, { id: "materials", label: "Materials" },
  { id: "finance", label: "Finance" }, { id: "documents", label: "Documents" },
];
const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const shortDateFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
const compactPeso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 });
const sectionClass = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6";

function displayDate(value?: string) {
  return value ? dateFormatter.format(new Date(`${value}T12:00:00Z`)) : "Not set";
}

export function DemoProjectDetail({ project, tables, role, userId, tab, onChanged, onEdit, onDelete, busy }: {
  project: Project;
  tables: DemoData;
  role: DemoRole;
  userId: string;
  tab?: string | null;
  onChanged: (message: string) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [exportMessage, setExportMessage] = useState("");
  const overview = demoProjectOverview(tables, project.id);
  const canViewFinance = isDemoManager(role) || role === "project_manager" || role === "accounting";
  const canViewLaborCost = isDemoManager(role) || role === "accounting";
  const requestedSection = sections.find((item) => item.id === tab)?.id ?? "overview";
  const activeSection = requestedSection === "finance" && !canViewFinance ? "overview" : requestedSection;
  const assigned = tables.projectAssignments.filter((row) => row.projectId === project.id)
    .map((row) => tables.users.find((user) => user.id === row.userId)).filter((user) => user !== undefined);
  const sites = tables.sites.filter((site) => site.projectId === project.id);
  const progress = overview.latestProgress?.progressPercent;
  const targetDate = project.targetCompletionDate ? shortDateFormatter.format(new Date(`${project.targetCompletionDate}T12:00:00Z`)) : "Not set";
  const metrics = [
    { label: "Target date", value: targetDate, icon: Calendar03Icon, tone: "bg-cyan-50 text-cyan-700", detail: `Started ${displayDate(project.startDate)}` },
    ...(canViewFinance ? [{ label: "Initial budget", value: project.initialBudgetCentavos === undefined ? "Not set" : compactPeso.format(project.initialBudgetCentavos / 100), icon: Cash01Icon, tone: "bg-emerald-50 text-emerald-700", detail: project.initialBudgetCentavos === undefined ? "Add a budget in Edit project" : formatDemoCentavos(project.initialBudgetCentavos) }] : []),
    { label: "Assigned staff", value: assigned.length, icon: UserGroupIcon, tone: "bg-amber-50 text-amber-700", detail: assigned.length === 1 ? "1 team member" : `${assigned.length} team members` },
    { label: "Latest progress", value: `${progress ?? 0}%`, icon: ChartBarLineIcon, tone: "bg-violet-50 text-violet-700", detail: overview.latestProgress ? `Recorded ${displayDate(overview.latestProgress.date)}` : "No dated progress yet" },
  ];

  function exportProject() {
    const requests = tables.materialRequests.filter((request) => request.projectId === project.id);
    const requestIds = new Set(requests.map((request) => request.id));
    const movements = tables.requestMovements.filter((movement) => requestIds.has(movement.requestId) && movement.kind === "consumption");
    const reversedAttendanceIds = new Set(tables.attendanceReversals.map((item) => item.attendanceId));
    const attendance = tables.attendance.filter((entry) => entry.projectId === project.id && !reversedAttendanceIds.has(entry.id));
    const rows: Array<Array<string | number>> = [
      ["Project", "", project.code, project.name, "", "", ""],
      ["Status", "", "", project.status.replaceAll("_", " "), "", "", ""],
      ["Location", "", "", project.location, "", "", ""],
      ["Target date", project.targetCompletionDate ?? "", "", "", "", "", ""],
      ["Initial budget", "", "", "", "", "", project.initialBudgetCentavos === undefined ? "" : (project.initialBudgetCentavos / 100).toFixed(2)],
      ["Contract value", "", "", "", "", "", project.contractValueCentavos === undefined ? "" : (project.contractValueCentavos / 100).toFixed(2)],
      ...overview.reports.map((report) => ["Daily report", report.date, "", report.summary, report.progressPercent === undefined ? "" : report.progressPercent, "%", ""]),
      ...movements.map((movement) => { const material = tables.materials.find((item) => item.id === movement.materialId); return ["Material used", movement.occurredAt.slice(0, 10), material?.code ?? "", material?.name ?? "", movement.quantity, material?.unit ?? "", movement.amountCentavos === undefined ? "" : (movement.amountCentavos / 100).toFixed(2)]; }),
      ...attendance.map((entry) => ["Attendance", entry.date, "", tables.employees.find((item) => item.id === entry.employeeId)?.name ?? "Employee", entry.hoursWorked ?? "", "hours", entry.costCentavos === undefined ? "" : (entry.costCentavos / 100).toFixed(2)]),
    ];
    try {
      downloadCsv(`project-${project.code.replace(/[^a-zA-Z0-9_-]/g, "-")}.csv`, ["Record", "Date", "Code / SKU", "Description", "Quantity / progress", "Unit", "Amount (PHP)"], rows);
      setExportMessage("Project CSV exported.");
    } catch { setExportMessage("Unable to export this project in this browser."); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><HistoryLink href="/demo?view=projects" className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:underline"><HugeiconsIcon icon={ArrowLeft02Icon} size={16} />All projects</HistoryLink><p className="mt-4 text-xs font-semibold uppercase tracking-[0.13em] text-cyan-700">{project.code}</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{project.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${project.status === "active" ? "bg-emerald-50 text-emerald-700" : project.status === "on_hold" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{project.status === "active" ? "Ongoing" : project.status === "on_hold" ? "On hold" : "Completed"}</span></div><p className="mt-1 text-sm text-slate-500">{project.location}</p></div>
      <div className="flex flex-wrap gap-2"><ShareProjectButton demo href={`/demo?view=projects&project=${encodeURIComponent(project.id)}`} />{canViewLaborCost && <Button variant="outline" onClick={exportProject}><HugeiconsIcon icon={Download04Icon} size={16} />Export CSV</Button>}{isDemoManager(role) && <><Button variant="outline" onClick={onEdit}><HugeiconsIcon icon={PencilEdit02Icon} size={16} />Edit</Button><Button variant="outline" onClick={onDelete} disabled={busy} className="text-red-700 hover:text-red-700"><HugeiconsIcon icon={Delete02Icon} size={16} />Delete</Button></>}</div>
    </div>
    {exportMessage && <p role="status" className="text-xs text-slate-500">{exportMessage}</p>}

    <div className="relative grid h-52 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400 sm:h-64">{project.photo ? <Image src={project.photo} alt={`${project.name} project`} fill sizes="(max-width: 768px) 100vw, 1100px" unoptimized={project.photo.startsWith("data:")} className="object-cover" /> : <HugeiconsIcon icon={Building03Icon} size={42} strokeWidth={1.3} aria-hidden="true" />}</div>
    <div className={`grid grid-cols-2 gap-3 ${canViewFinance ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
    <nav aria-label="Project sections" className="rounded-2xl border border-slate-200 bg-white p-2"><div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${canViewFinance ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>{sections.filter((item) => item.id !== "finance" || canViewFinance).map((item) => <HistoryLink key={item.id} href={`/demo?view=projects&project=${encodeURIComponent(project.id)}${item.id === "overview" ? "" : `&tab=${item.id}`}`} aria-current={activeSection === item.id ? "page" : undefined} className={`min-w-0 rounded-full px-3 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${activeSection === item.id ? "bg-cyan-700 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>{item.label}</HistoryLink>)}</div></nav>

    {activeSection === "overview" && <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className={sectionClass}><h2 className="text-base font-semibold">Project overview</h2><dl className="mt-4 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Address</dt><dd className="mt-1 font-medium text-slate-800">{project.address || project.location}</dd></div><div><dt className="text-xs text-slate-500">Timeline</dt><dd className="mt-1 font-medium text-slate-800">{displayDate(project.startDate)} – {displayDate(project.targetCompletionDate)}</dd></div><div><dt className="text-xs text-slate-500">Project sites</dt><dd className="mt-1 font-medium text-slate-800">{sites.map((site) => site.name).join(", ") || "None recorded"}</dd></div><div><dt className="text-xs text-slate-500">Assigned staff</dt><dd className="mt-1 font-medium text-slate-800">{assigned.map((user) => user.name).join(", ") || "None assigned"}</dd></div></dl></section>
      <section className={sectionClass}><h2 className="text-base font-semibold">Progress & site updates</h2><div className="mt-4"><div className="flex items-center justify-between gap-2 text-sm"><span className="text-slate-600">Latest progress</span><span className="font-semibold tabular-nums">{progress ?? 0}%</span></div><div role="progressbar" aria-label={progress === undefined ? "Project progress (no update recorded)" : "Latest recorded project progress"} aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${progress ?? 0}%` }} /></div>{progress === undefined && <p className="mt-2 text-xs text-slate-500">No progress update recorded yet.</p>}</div>{overview.reports.length > 0 ? <ol className="mt-5 divide-y divide-slate-100">{overview.reports.map((report) => <li key={report.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">{report.photo && <Image src={report.photo} alt="" fill sizes="48px" unoptimized={report.photo.startsWith("data:")} className="object-cover" />}</div><div className="min-w-0"><p className="text-sm font-medium text-slate-800">{report.summary}</p><p className="mt-1 text-xs text-slate-500">{displayDate(report.date)}{report.progressPercent === undefined ? "" : ` · ${report.progressPercent}% complete`}</p></div></li>)}</ol> : null}<HistoryLink href="/demo?view=reports" className="mt-5 inline-block text-sm font-semibold text-cyan-700 hover:underline">View daily reports</HistoryLink></section>
      {canViewLaborCost && <div className="xl:col-span-2"><ProjectCostBreakdown categories={[{ label: "Materials", amountCentavos: overview.materialCostCentavos, color: "#0891b2" }, { label: "Labour", amountCentavos: overview.laborCostCentavos, color: "#f59e0b" }, { label: "Equipment", amountCentavos: null, color: "#8b5cf6" }, { label: "Other", amountCentavos: null, color: "#10b981" }]} /></div>}
    </div>}

    {activeSection === "sites" && <ProjectSites project={project} tables={tables} />}
    {activeSection === "labour" && <ProjectLabour project={project} tables={tables} role={role} userId={userId} />}
    {activeSection === "materials" && <div className="space-y-5"><ProjectMaterialCoverage project={project} tables={tables} /><div className={sectionClass}><DemoProjectMaterialPlan tables={tables} project={project} role={role} userId={userId} onChanged={onChanged} /></div><ProjectSiteStock project={project} tables={tables} /><ProjectMaterialRequests project={project} tables={tables} /></div>}
    {activeSection === "finance" && canViewFinance && <ProjectFinance project={project} tables={tables} materialCostCentavos={overview.materialCostCentavos} laborCostCentavos={canViewLaborCost ? overview.laborCostCentavos : undefined} />}
    {activeSection === "documents" && <ProjectDocuments project={project} tables={tables} />}
  </div>;
}
