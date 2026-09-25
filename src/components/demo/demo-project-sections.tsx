import Image from "next/image";

import { HistoryLink } from "@/components/layout/history-link";
import { EmptyState } from "@/components/ui/empty-state";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";
import { demoMaterialPlanSummary } from "@/lib/demo/material-plan";
import { formatDemoCentavos } from "@/lib/demo/project-overview";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";

type Project = DemoData["projects"][number];
const panelClass = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6";
const headerClass = "bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const quantityFormatter = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 });
const date = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00Z`));

export function ProjectSites({ project, tables }: { project: Project; tables: DemoData }) {
  const sites = tables.sites.filter((site) => site.projectId === project.id);
  return <section className={panelClass}>
    <h2 className="text-base font-semibold">Project sites</h2>
    <p className="mt-1 text-xs text-slate-500">Locations with material stock and requests for this project.</p>
    {sites.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[440px] text-sm"><thead className={headerClass}><tr><th className="px-4 py-3">Site</th><th className="px-4 py-3 text-right">Materials on site</th><th className="px-4 py-3 text-right">Requests</th></tr></thead><tbody className="divide-y divide-slate-100">{sites.map((site) => <tr key={site.id}><td className="px-4 py-3 font-medium text-slate-800">{site.name}</td><td className="px-4 py-3 text-right tabular-nums">{tables.siteBalances.filter((row) => row.siteId === site.id && row.quantity > 0).length}</td><td className="px-4 py-3 text-right tabular-nums">{tables.materialRequests.filter((row) => !row.legacy && row.siteId === site.id).length}</td></tr>)}</tbody></table></div> : <EmptyState compact kind="items" title="No sites recorded" />}
  </section>;
}

export function ProjectLabour({ project, tables, role, userId }: { project: Project; tables: DemoData; role: DemoRole; userId: string }) {
  const canViewWages = isDemoManager(role) || role === "accounting";
  const team = tables.projectAssignments.filter((row) => row.projectId === project.id)
    .map((row) => tables.users.find((user) => user.id === row.userId)).filter((user) => user !== undefined);
  const reversedIds = new Set(tables.attendanceReversals.map((row) => row.attendanceId));
  const attendance = tables.attendance.filter((row) => row.projectId === project.id && (role !== "worker" || tables.employees.some((employee) => employee.id === row.employeeId && employee.userId === userId)))
    .toSorted((a, b) => b.date.localeCompare(a.date));
  const latestDate = attendance.find((row) => !reversedIds.has(row.id))?.date;
  const distribution = attendance.filter((row) => row.date === latestDate && row.status === "present" && !reversedIds.has(row.id)).reduce((rows, entry) => {
    const employee = tables.employees.find((item) => item.id === entry.employeeId);
    if (!employee) return rows;
    const wageCentavos = entry.rateSnapshotCentavos ?? employee.dailyWageCentavos;
    const hasPostedRate = entry.rateSnapshotCentavos !== undefined;
    const key = canViewWages ? `${employee.trade}:${wageCentavos ?? "unset"}:${hasPostedRate}` : employee.trade;
    const existing = rows.get(key);
    rows.set(key, { trade: employee.trade, dailyWageCentavos: wageCentavos, hasPostedRate, count: (existing?.count ?? 0) + 1, costCentavos: (existing?.costCentavos ?? 0) + (entry.costCentavos ?? 0), postedCount: (existing?.postedCount ?? 0) + (entry.costCentavos === undefined ? 0 : 1) });
    return rows;
  }, new Map<string, { trade: string; dailyWageCentavos?: number; hasPostedRate: boolean; count: number; costCentavos: number; postedCount: number }>());
  return <div className="space-y-5">
    <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Labour distribution</h2>{(isDemoManager(role) || role === "accounting") && <HistoryLink href={`/demo?view=attendance&project=${encodeURIComponent(project.id)}`} className="text-sm font-semibold text-cyan-700 hover:underline">View attendance</HistoryLink>}</div><p className="mt-1 text-xs text-slate-500">{latestDate ? `Present workers on ${date(latestDate)}. Posted costs use the saved rate at the time of entry.` : "Based on recorded attendance."}</p>{distribution.size ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[490px] text-sm"><thead className={headerClass}><tr><th className="px-4 py-3">Role / trade</th><th className="px-4 py-3 text-right">Count</th>{canViewWages && <th className="px-4 py-3 text-right">Daily wage</th>}{canViewWages && <th className="px-4 py-3 text-right">Posted cost</th>}</tr></thead><tbody className="divide-y divide-slate-100">{[...distribution.values()].sort((a, b) => a.trade.localeCompare(b.trade)).map((row) => <tr key={`${row.trade}:${row.dailyWageCentavos ?? "unset"}:${row.hasPostedRate}`}><td className="px-4 py-3 font-medium text-slate-800">{row.trade}</td><td className="px-4 py-3 text-right tabular-nums">{row.count}</td>{canViewWages && <td className="px-4 py-3 text-right tabular-nums">{row.dailyWageCentavos === undefined ? "Not set" : <>{formatDemoCentavos(row.dailyWageCentavos)}{!row.hasPostedRate && <span className="block text-xs text-slate-500">Current rate · unposted</span>}</>}</td>}{canViewWages && <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.postedCount ? formatDemoCentavos(row.costCentavos) : "Not posted"}</td>}</tr>)}</tbody></table></div> : <EmptyState compact kind="items" title="No present workers recorded" />}</section>
    <div className="grid items-start gap-5 xl:grid-cols-2">
    <section className={panelClass}><h2 className="text-base font-semibold">Assigned team</h2>{team.length ? <ul className="mt-4 divide-y divide-slate-100">{team.map((member) => <li key={member.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><span className="text-sm font-medium text-slate-800">{member.name}</span><span className="text-xs capitalize text-slate-500">{member.role.replaceAll("_", " ")}</span></li>)}</ul> : <EmptyState compact kind="items" title="No staff assigned" />}</section>
    <section className={panelClass}><h2 className="text-base font-semibold">Attendance history</h2>{attendance.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[480px] text-sm"><thead className={headerClass}><tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Employee</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Hours</th>{canViewWages && <th className="px-3 py-2.5 text-right">Cost</th>}</tr></thead><tbody className="divide-y divide-slate-100">{attendance.map((row) => <tr key={row.id}><td className="px-3 py-3 whitespace-nowrap">{date(row.date)}</td><td className="px-3 py-3">{tables.employees.find((employee) => employee.id === row.employeeId)?.name ?? "Employee"}</td><td className="px-3 py-3 capitalize">{reversedIds.has(row.id) ? "Reversed" : row.status}</td><td className="px-3 py-3 text-right tabular-nums">{row.hoursWorked === undefined ? "—" : `${row.hoursWorked} h`}</td>{canViewWages && <td className="px-3 py-3 text-right tabular-nums">{reversedIds.has(row.id) ? "—" : row.costCentavos === undefined ? "Not posted" : formatDemoCentavos(row.costCentavos)}</td>}</tr>)}</tbody></table></div> : <EmptyState compact kind="items" title="No attendance recorded" />}</section>
    </div>
  </div>;
}

export function ProjectSiteStock({ project, tables }: { project: Project; tables: DemoData }) {
  const siteIds = new Set(tables.sites.filter((site) => site.projectId === project.id).map((site) => site.id));
  const balances = tables.siteBalances.filter((row) => siteIds.has(row.siteId) && row.quantity > 0);
  return <section className={panelClass}><h2 className="text-base font-semibold">Site stock</h2>{balances.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[470px] text-sm"><thead className={headerClass}><tr><th className="px-4 py-3">SKU / material</th><th className="px-4 py-3">Site</th><th className="px-4 py-3 text-right">On hand</th></tr></thead><tbody className="divide-y divide-slate-100">{balances.map((row) => { const material = tables.materials.find((item) => item.id === row.materialId); return <tr key={row.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><MaterialThumbnail name={material?.name ?? "Material"} photo={material?.photo} /><div><span className="block font-medium">{material?.name ?? "Material"}</span><span className="text-xs text-slate-500">{material?.code}</span></div></div></td><td className="px-4 py-3">{tables.sites.find((site) => site.id === row.siteId)?.name}</td><td className="px-4 py-3 text-right tabular-nums">{quantityFormatter.format(row.quantity)} {material?.unit}</td></tr>; })}</tbody></table></div> : <EmptyState compact kind="items" title="No site stock recorded" />}</section>;
}

export function ProjectMaterialCoverage({ project, tables }: { project: Project; tables: DemoData }) {
  const lines = tables.projectMaterialPlans.filter((line) => line.projectId === project.id);
  if (!lines.length) return null;
  return <section className={panelClass}>
    <h2 className="text-base font-semibold">Material coverage</h2>
    <p className="mt-1 text-xs text-slate-500">Used plus remaining on-site stock compared with the planned quantity. Each material keeps its own unit.</p>
    <ul className="mt-5 space-y-5">{lines.map((line) => {
      const material = tables.materials.find((item) => item.id === line.materialId);
      const site = tables.sites.find((item) => item.id === line.siteId);
      const summary = demoMaterialPlanSummary(tables, line);
      const covered = summary.used + summary.onSite;
      const percent = Math.min(100, Math.round(covered / line.plannedQuantity * 100));
      return <li key={line.id}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-3"><MaterialThumbnail name={material?.name ?? "Material"} photo={material?.photo} /><div className="min-w-0"><p className="text-sm font-medium text-slate-800">{material?.name ?? "Material"} <span className="text-xs font-normal text-slate-500">{material?.code}</span></p><p className="mt-0.5 text-xs text-slate-500">{site?.name ?? "Site"} · {quantityFormatter.format(covered)} / {quantityFormatter.format(line.plannedQuantity)} {material?.unit ?? "units"}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${covered >= line.plannedQuantity ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{covered >= line.plannedQuantity ? "Covered" : "Needs stock"}</span></div>
        <div role="progressbar" aria-label={`${material?.name ?? "Material"} coverage at ${site?.name ?? "site"}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${percent}%` }} /></div>
      </li>;
    })}</ul>
  </section>;
}

export function ProjectMaterialRequests({ project, tables }: { project: Project; tables: DemoData }) {
  const requests = tables.materialRequests.filter((row) => row.projectId === project.id);
  return <section className={panelClass}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Material requests</h2><HistoryLink href="/demo?view=requests" className="text-sm font-semibold text-cyan-700 hover:underline">View requests</HistoryLink></div>
    {requests.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[500px] text-sm"><thead className={headerClass}><tr><th className="px-4 py-3">SKU / material</th><th className="px-4 py-3 text-right">Requested</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{requests.map((row) => { const material = tables.materials.find((item) => item.id === row.materialId); return <tr key={row.id}><td className="px-4 py-3"><span className="font-medium">{material?.name ?? "Material"}</span><span className="ml-2 text-xs text-slate-500">{material?.code}</span></td><td className="px-4 py-3 text-right tabular-nums">{quantityFormatter.format(row.quantity)} {material?.unit}</td><td className="px-4 py-3 capitalize">{row.status.replaceAll("_", " ")}</td></tr>; })}</tbody></table></div> : <EmptyState compact kind="items" title="No material requests" />}
  </section>;
}

export function ProjectFinance({ project, tables, materialCostCentavos, laborCostCentavos }: { project: Project; tables: DemoData; materialCostCentavos: number; laborCostCentavos?: number }) {
  const requestIds = new Set(tables.materialRequests.filter((row) => row.projectId === project.id).map((row) => row.id));
  const entries = tables.requestMovements.filter((row) => requestIds.has(row.requestId) && row.kind === "consumption")
    .toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return <div className="space-y-5"><section className={panelClass}>
    <h2 className="text-base font-semibold">Financial snapshot</h2>
    <p className="mt-1 text-xs text-slate-500">{laborCostCentavos === undefined ? "Posted material use. Labor cost is restricted to finance roles." : "Posted material use and attendance cost. Equipment and other costs are not included in this preview."}</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs text-slate-500">Contract value</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{project.contractValueCentavos === undefined ? "Not set" : formatDemoCentavos(project.contractValueCentavos)}</dd></div><div><dt className="text-xs text-slate-500">Material use cost</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatDemoCentavos(materialCostCentavos)}</dd></div>{laborCostCentavos !== undefined && <><div><dt className="text-xs text-slate-500">Labor cost</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatDemoCentavos(laborCostCentavos)}</dd></div><div><dt className="text-xs text-slate-500">Budget less posted costs</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{project.initialBudgetCentavos === undefined ? "Not set" : formatDemoCentavos(project.initialBudgetCentavos - materialCostCentavos - laborCostCentavos)}</dd></div></>}</dl>
  </section><section className={panelClass}><h2 className="text-base font-semibold">Material cost entries</h2>{entries.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[560px] text-sm"><thead className={headerClass}><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">SKU / material</th><th className="px-4 py-3 text-right">Used</th><th className="px-4 py-3 text-right">Cost</th></tr></thead><tbody className="divide-y divide-slate-100">{entries.map((row) => { const material = tables.materials.find((item) => item.id === row.materialId); return <tr key={row.id}><td className="px-4 py-3 whitespace-nowrap">{dateFormatter.format(new Date(row.occurredAt))}</td><td className="px-4 py-3">{material?.code} · {material?.name}</td><td className="px-4 py-3 text-right tabular-nums">{quantityFormatter.format(row.quantity)} {material?.unit}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{row.amountCentavos === undefined ? "Not valued" : formatDemoCentavos(row.amountCentavos)}</td></tr>; })}</tbody></table></div> : <EmptyState compact kind="items" title="No material costs posted" />}</section></div>;
}

export function ProjectDocuments({ project, tables }: { project: Project; tables: DemoData }) {
  const photos = [
    ...(project.photo ? [{ id: project.id, photo: project.photo, label: "Project cover", detail: project.name }] : []),
    ...tables.dailyReports.filter((report) => report.projectId === project.id && report.photo).map((report) => ({ id: report.id, photo: report.photo!, label: `Daily report · ${date(report.date)}`, detail: report.summary })),
  ];
  return <section className={panelClass}><h2 className="text-base font-semibold">Project photos</h2><p className="mt-1 text-xs text-slate-500">Cover image and photos attached to daily reports. No separate documents are stored in this demo.</p>{photos.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{photos.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200"><div className="relative h-40 bg-slate-100"><Image src={item.photo} alt={item.label} fill sizes="(max-width: 640px) 100vw, 320px" unoptimized={item.photo.startsWith("data:")} className="object-cover" /></div><div className="p-3"><p className="text-sm font-medium">{item.label}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.detail}</p></div></article>)}</div> : <EmptyState compact kind="items" title="No project photos yet" />}</section>;
}
