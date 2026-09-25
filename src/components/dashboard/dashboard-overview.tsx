import Image from "next/image";
import Link from "next/link";
import { AssignmentsIcon, Building03Icon, DeliveryTruck01Icon, PauseIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { DashboardMonthlyCostRow, MaterialRequestStatus, ProjectStatus } from "@/types/database";

type RecentProject = { id: string; code: string; name: string; photo_path: string | null; city_province: string; status: ProjectStatus; target_completion_date: string; created_at: string };
type RecentRequest = { id: string; request_number: string; project_id: string; status: MaterialRequestStatus; required_date: string; requested_at: string; project?: { id: string; code: string; name: string } };
type RecentConsumption = { id: string; transaction_date: string; quantity: number; material?: { id: string; name: string; code: string }; unitSymbol: string; project?: { id: string; code: string; name: string } };
type RecentActivity = { id: number; action: string; table_name: string; created_at: string; actorName: string };
const requestLabels: Record<MaterialRequestStatus, string> = { submitted: "For approval", approved: "Approved", partially_approved: "Partial approval", rejected: "Rejected", cancelled: "Cancelled" };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" });

function MonthlyCosts({ rows }: { rows: DashboardMonthlyCostRow[] }) {
  const series = rows.map((row) => ({ ...row, total: Number(row.material_cost) + Number(row.labor_cost) + Number(row.equipment_cost) + Number(row.other_cost) }));
  const maximum = Math.max(1, ...series.map((row) => row.total));
  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="monthly-costs-heading">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 id="monthly-costs-heading" className="text-base font-semibold text-slate-900">Monthly project costs</h2><p className="mt-1 text-xs text-slate-500">Posted costs by work month, excluding reversed entries. Not cash paid.</p></div><span className="text-xs font-medium text-slate-500">Last 6 months</span></div>
    <div className="mt-5 grid gap-4">{series.map((row) => <div key={row.month_start} className="grid items-center gap-2 sm:grid-cols-[80px_minmax(0,1fr)_110px]"><span className="text-xs font-medium text-slate-600">{monthLabel.format(new Date(`${row.month_start}T12:00:00Z`))}</span><div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${row.month_start}: ${money.format(row.total)} posted project costs`}>{([['material_cost', 'bg-cyan-600'], ['labor_cost', 'bg-amber-500'], ['equipment_cost', 'bg-violet-500'], ['other_cost', 'bg-slate-500']] as const).map(([key, color]) => <span key={key} className={color} style={{ width: `${Number(row[key]) / maximum * 100}%` }} />)}</div><span className="text-right text-xs font-semibold tabular-nums text-slate-800">{money.format(row.total)}</span></div>)}</div>
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-cyan-600" />Materials</span><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-amber-500" />Labor</span><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-violet-500" />Equipment</span><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-slate-500" />Other / stock loss</span></div>
  </section>;
}

export function DashboardOverview({ name, canManage, canViewRequests, canViewConsumption, metrics, recentProjects, recentRequests, recentConsumption, monthlyCosts, recentActivity }: {
  name: string; canManage: boolean; canViewRequests: boolean; canViewConsumption: boolean;
  metrics: { total: number; active: number; onHold: number; warehouses: number };
  recentProjects: RecentProject[]; recentRequests: RecentRequest[];
  recentConsumption: RecentConsumption[]; monthlyCosts: DashboardMonthlyCostRow[]; recentActivity: RecentActivity[];
}) {
  const cards = [
    { label: "Total projects", value: metrics.total, detail: `${metrics.active} currently active`, icon: Building03Icon, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Active projects", value: metrics.active, detail: "Accessible to your account", icon: Building03Icon, tone: "bg-blue-50 text-blue-700" },
    { label: "On hold", value: metrics.onHold, detail: "Requires follow-up", icon: PauseIcon, tone: "bg-amber-50 text-amber-700" },
    { label: "Active warehouses", value: metrics.warehouses, detail: "Accessible locations", icon: DeliveryTruck01Icon, tone: "bg-violet-50 text-violet-700" },
  ];
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Welcome, {name.split(" ")[0]}</h1><p className="mt-1 text-sm text-slate-500">Project and warehouse records available to your account.</p></div>
      {canManage && <Button asChild><Link href="/projects/new"><HugeiconsIcon icon={PlusSignIcon} size={17} />New project</Link></Button>}
    </div>
    <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overview metrics">{cards.map((card) => <MetricCard key={card.label} {...card} />)}</section>
    <div className={`mt-5 grid items-start gap-4 ${canViewRequests ? "xl:grid-cols-2" : ""}`}>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="ongoing-projects-heading">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="ongoing-projects-heading" className="text-base font-semibold text-slate-900">Ongoing projects</h2><Button variant="ghost" size="sm" asChild><Link href="/projects">View all</Link></Button></div>
        {recentProjects.length === 0 ? <EmptyState title="No ongoing projects" description={canManage ? "Create a project to start tracking work." : undefined} /> : <div className="divide-y divide-slate-100">{recentProjects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
          <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{project.photo_path ? <Image src={recordPhotoUrl("projects", project.id)} alt="" fill sizes="56px" unoptimized className="object-cover" /> : <HugeiconsIcon icon={Building03Icon} size={22} />}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{project.name}</p><p className="mt-1 truncate text-xs text-slate-500">{project.code} · {project.city_province}</p></div>
          <Badge variant="active">Active</Badge>
        </Link>)}</div>}
      </section>
      {canViewRequests && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-requests-heading">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="recent-requests-heading" className="text-base font-semibold text-slate-900">Recent requests</h2><Button variant="ghost" size="sm" asChild><Link href="/requests">View all</Link></Button></div>
        {recentRequests.length === 0 ? <EmptyState title="No material requests yet" /> : <div className="divide-y divide-slate-100">{recentRequests.map((request) => <Link key={request.id} href={`/requests/${request.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700"><HugeiconsIcon icon={AssignmentsIcon} size={20} strokeWidth={1.6} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{request.request_number}</p><p className="mt-1 truncate text-xs text-slate-500">{request.project?.code ?? "Project"} · {request.project?.name ?? "Unavailable project"}</p><p className="mt-1 text-xs text-slate-500">Needed {request.required_date}</p></div>
          <Badge variant={request.status === "submitted" ? "review" : request.status === "rejected" ? "neutral" : "info"}>{requestLabels[request.status]}</Badge>
        </Link>)}</div>}
      </section>}
    </div>
    {monthlyCosts.length > 0 && <MonthlyCosts rows={monthlyCosts} />}
    {(canViewConsumption || canManage) && <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
      {canViewConsumption && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-consumption-heading"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="recent-consumption-heading" className="text-base font-semibold text-slate-900">Material consumption</h2><Button variant="ghost" size="sm" asChild><Link href="/inventory/transactions">View all</Link></Button></div>{recentConsumption.length === 0 ? <EmptyState compact kind="items" title="No material use recorded" /> : <div className="divide-y divide-slate-100">{recentConsumption.map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{entry.material?.name ?? "Material"}</p><p className="mt-1 truncate text-xs text-slate-500">{entry.project?.name ?? "Project"} · {entry.transaction_date}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">{Number(entry.quantity).toLocaleString("en-PH")} {entry.unitSymbol}</span></div>)}</div>}</section>}
      {canManage && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-activity-heading"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="recent-activity-heading" className="text-base font-semibold text-slate-900">Recent activity</h2><Button variant="ghost" size="sm" asChild><Link href="/audit-logs">View all</Link></Button></div>{recentActivity.length === 0 ? <EmptyState compact kind="items" title="No activity recorded" /> : <div className="divide-y divide-slate-100">{recentActivity.map((entry) => <Link key={entry.id} href={`/audit-logs/${entry.id}`} className="block px-5 py-3 hover:bg-slate-50"><p className="text-sm font-semibold capitalize text-slate-900">{entry.action.replaceAll("_", " ")} · {entry.table_name.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{entry.actorName} · {new Date(entry.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</p></Link>)}</div>}</section>}
    </div>}
  </>;
}
