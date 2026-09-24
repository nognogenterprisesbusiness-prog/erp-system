import Image from "next/image";
import { Building03Icon, ClipboardListIcon, ClipboardPenIcon, ExcavatorIcon, Notification01Icon, PackageIcon, UserGroupIcon, WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HistoryLink } from "@/components/layout/history-link";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { demoRoleViews } from "@/lib/demo/navigation";
import { visibleDemoEquipmentLocations, visibleDemoProjectIds, visibleDemoWarehouseIds } from "@/lib/demo/visibility";
import { demoRequestProgress, demoRequestStatusLabel } from "@/lib/demo/workflow";

const displayDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const sectionClass = "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

function PanelHeader({ title, href, id }: { title: string; href?: string; id: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
    <h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
    {href && <HistoryLink href={href} className="shrink-0 text-xs font-semibold text-cyan-700 hover:underline">View all</HistoryLink>}
  </div>;
}

export function DemoDashboard({ tables, role, userId }: { tables: DemoData; role: DemoRole; userId: string }) {
  const allowed = new Set(demoRoleViews[role]);
  const canSeeProjects = allowed.has("projects");
  const canSeeInventory = allowed.has("inventory");
  const canSeeEquipment = allowed.has("equipment");
  const canSeeRequests = allowed.has("requests");
  const canSeeReports = allowed.has("reports");
  const projectIds = visibleDemoProjectIds(tables, role, userId);
  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId);
  const equipmentLocations = visibleDemoEquipmentLocations(tables, role, userId);
  const visibleProjects = tables.projects.filter((project) => projectIds.has(project.id));
  const ongoing = visibleProjects.filter((project) => project.status === "active");
  const visibleSites = tables.sites.filter((site) => projectIds.has(site.projectId));
  const visibleSiteIds = new Set(visibleSites.map((site) => site.id));
  const visibleBalances = tables.balances.filter((row) => warehouseIds.has(row.warehouseId));
  const visibleSiteBalances = tables.siteBalances.filter((row) => visibleSiteIds.has(row.siteId));
  const visibleMaterialIds = new Set([...visibleBalances, ...visibleSiteBalances].map((row) => row.materialId));
  const visibleRequests = tables.materialRequests.filter((request) => {
    if (request.legacy) return isDemoManager(role);
    return isDemoManager(role) || role === "warehouse_staff" && request.status === "approved" && warehouseIds.has(request.warehouseId) || projectIds.has(request.projectId);
  });
  const recentRequests = visibleRequests.toSorted((a, b) => (b.legacy ? "" : b.requestedAt).localeCompare(a.legacy ? "" : a.requestedAt)).slice(0, 4);
  const visibleReports = tables.dailyReports.filter((report) => projectIds.has(report.projectId));
  const visibleEquipment = tables.equipment.filter((asset) => isDemoManager(role) || equipmentLocations.has(asset.location));
  const myNotifications = tables.notifications.filter((notification) => notification.userId === userId);
  const recentActivity = [
    ...(canSeeReports ? visibleReports.map((report) => ({ id: report.id, date: report.date, title: "Daily report submitted", detail: tables.projects.find((project) => project.id === report.projectId)?.name ?? "Project", href: "/demo?view=reports" })) : []),
    ...(canSeeInventory ? tables.transactions.filter((movement) => warehouseIds.has(movement.warehouseId)).map((movement) => ({ id: movement.id, date: movement.date, title: movement.kind === "stock_in" ? "Stock received" : "Opening stock recorded", detail: `${movement.quantity} ${tables.materials.find((material) => material.id === movement.materialId)?.unit ?? "units"} ${tables.materials.find((material) => material.id === movement.materialId)?.name ?? "material"}`, href: "/demo?view=inventory" })) : []),
  ].toSorted((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const metrics = [
    ...(canSeeProjects ? [{ label: "Ongoing projects", value: ongoing.length, icon: Building03Icon, tone: "bg-cyan-50 text-cyan-700" }] : []),
    ...(canSeeInventory ? [{ label: "Stock materials", value: visibleMaterialIds.size, icon: PackageIcon, tone: "bg-violet-50 text-violet-700" }] : []),
    ...(canSeeEquipment ? [{ label: "Equipment", value: visibleEquipment.length, icon: ExcavatorIcon, tone: "bg-amber-50 text-amber-700" }] : []),
    ...(allowed.has("workforce") ? [{ label: "Employees", value: tables.employees.length, icon: UserGroupIcon, tone: "bg-emerald-50 text-emerald-700" }] : []),
    ...(allowed.has("suppliers") ? [{ label: "Suppliers", value: tables.suppliers.length, icon: UserGroupIcon, tone: "bg-emerald-50 text-emerald-700" }] : []),
    ...(canSeeRequests ? [{ label: "Material requests", value: visibleRequests.length, icon: ClipboardListIcon, tone: "bg-indigo-50 text-indigo-700" }] : []),
    ...(canSeeReports ? [{ label: "Daily reports", value: visibleReports.length, icon: ClipboardPenIcon, tone: "bg-sky-50 text-sky-700" }] : []),
    ...(role === "warehouse_staff" ? [{ label: "Warehouses", value: warehouseIds.size, icon: WarehouseIcon, tone: "bg-teal-50 text-teal-700" }] : []),
    ...(role === "foreman" ? [{ label: "Project sites", value: visibleSites.length, icon: Building03Icon, tone: "bg-teal-50 text-teal-700" }] : []),
    ...(role === "accounting" ? [{ label: "Completed projects", value: visibleProjects.filter((project) => project.status === "completed").length, icon: Building03Icon, tone: "bg-teal-50 text-teal-700" }] : []),
    ...(role === "worker" ? [{ label: "Unread updates", value: myNotifications.filter((item) => !item.read).length, icon: Notification01Icon, tone: "bg-cyan-50 text-cyan-700" }] : []),
  ].slice(0, 4);

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      {canSeeProjects && <section className={sectionClass} aria-labelledby="demo-projects-heading">
        <PanelHeader id="demo-projects-heading" title="Ongoing projects" href="/demo?view=projects" />
        {ongoing.length === 0 ? <EmptyState kind="items" title="No ongoing projects" /> : <div className="divide-y divide-slate-100">{ongoing.slice(0, 4).map((project, index) => <HistoryLink href="/demo?view=projects" key={project.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50 sm:px-6">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:size-16">{project.photo ? <Image src={project.photo} alt="" fill sizes="64px" loading={index === 0 ? "eager" : "lazy"} unoptimized={project.photo.startsWith("data:")} className="object-cover" /> : <div className="grid h-full place-items-center text-slate-400"><HugeiconsIcon icon={Building03Icon} size={23} /></div>}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{project.name}</p><p className="mt-1 truncate text-xs text-slate-500">{project.code} · {project.location}</p></div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Ongoing</span>
        </HistoryLink>)}</div>}
      </section>}
      {canSeeRequests ? <section className={sectionClass} aria-labelledby="demo-requests-heading">
        <PanelHeader id="demo-requests-heading" title="Recent requests" href="/demo?view=requests" />
        {recentRequests.length === 0 ? <EmptyState kind="items" title="No material requests yet" /> : <div className="divide-y divide-slate-100">{recentRequests.map((request) => {
          const material = tables.materials.find((item) => item.id === request.materialId);
          const project = tables.projects.find((item) => item.id === request.projectId);
          const status = request.legacy ? request.status === "submitted" ? "For approval" : request.status === "released" ? "Dispatched" : request.status : demoRequestStatusLabel(request, demoRequestProgress(tables, request));
          const tone = status === "Rejected" ? "bg-red-50 text-red-700" : status === "For approval" ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-800";
          return <HistoryLink href="/demo?view=requests" key={request.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50 sm:px-6">
            <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{material?.photo ? <Image src={material.photo} alt="" fill sizes="40px" unoptimized={material.photo.startsWith("data:")} className="object-cover" /> : <HugeiconsIcon icon={PackageIcon} size={19} />}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{material?.name ?? "Material"} · {request.quantity.toLocaleString()} {material?.unit ?? ""}</p><p className="mt-1 truncate text-xs text-slate-500">{project?.name ?? "Project"} · SKU {material?.code ?? "—"}</p></div>
            <div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{status}</span>{!request.legacy && <time className="text-xs text-slate-500">{displayDate.format(new Date(request.requestedAt))}</time>}</div>
          </HistoryLink>;
        })}</div>}
      </section> : recentActivity.length > 0 ? <section className={sectionClass} aria-labelledby="demo-activity-heading">
        <PanelHeader id="demo-activity-heading" title="Recent activity" />
        <div className="divide-y divide-slate-100">{recentActivity.map((item) => <HistoryLink href={item.href} key={item.id} className="block px-5 py-4 hover:bg-slate-50 sm:px-6"><p className="text-sm font-semibold text-slate-800">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p><time className="mt-2 block text-xs text-slate-400">{displayDate.format(new Date(item.date))}</time></HistoryLink>)}</div>
      </section> : !canSeeProjects && <section className={sectionClass} aria-labelledby="demo-updates-heading">
        <PanelHeader id="demo-updates-heading" title="My updates" />
        {myNotifications.length === 0 ? <EmptyState kind="notifications" title="No updates yet" /> : <div className="divide-y divide-slate-100">{myNotifications.toSorted((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((item) => <div key={item.id} className="px-5 py-4 text-sm text-slate-700 sm:px-6">{item.message}<time className="mt-1 block text-xs text-slate-500">{displayDate.format(new Date(item.date))}</time></div>)}</div>}
      </section>}
    </div>
  </div>;
}
