import Image from "next/image";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { AssignmentsIcon, Building03Icon, Money03Icon, PackageIcon, PauseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { TrendChart, type TrendSeries } from "@/components/dashboard/trend-chart";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { DashboardMonthlyCostRow, MaterialRequestStatus, ProjectStatus } from "@/types/database";

type RecentProject = { id: string; code: string; name: string; photo_path: string | null; city_province: string; status: ProjectStatus; target_completion_date: string; created_at: string; updated_at: string };
type RecentRequest = { id: string; request_number: string; project_id: string; status: MaterialRequestStatus; required_date: string; requested_at: string; project?: { id: string; code: string; name: string } };
type RecentActivity = { id: number; action: string; table_name: string; created_at: string; actorName: string };
const requestLabels: Record<MaterialRequestStatus, string> = { submitted: "For approval", approved: "Approved", partially_approved: "Partial approval", rejected: "Rejected", cancelled: "Cancelled" };

function MonthlyCosts({ rows }: { rows: DashboardMonthlyCostRow[] }) {
  const series: TrendSeries[] = ([['material_cost', 'Materials'], ['labor_cost', 'Labour'], ['equipment_cost', 'Equipment'], ['other_cost', 'Other / stock loss']] as const).map(([id, label]) => ({ id, label, unit: 'PHP', values: rows.map((row) => Number(row[id])) }));
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="monthly-costs-heading">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 id="monthly-costs-heading" className="text-base font-semibold text-slate-900">Monthly expenses</h2><p className="mt-1 text-xs text-slate-500">Posted project costs by work month, excluding reversed entries. Not cash paid.</p></div><span className="text-xs font-medium text-slate-500">Last 6 months</span></div>
    <TrendChart months={rows.map((row) => row.month_start)} series={series} currency />
  </section>;
}

export function DashboardOverview({ name, canManage, canViewRequests, canViewConsumption, metrics, recentProjects, recentRequests, monthlyCosts, recentActivity, consumptionTrend, financialTotals }: {
  name: string; canManage: boolean; canViewRequests: boolean; canViewConsumption: boolean;
  metrics: { total: number; active: number; onHold: number };
  recentProjects: RecentProject[]; recentRequests: RecentRequest[];
  monthlyCosts: DashboardMonthlyCostRow[]; recentActivity: RecentActivity[];
  consumptionTrend: { months: string[]; series: TrendSeries[] };
  financialTotals?: { total_sales: number; total_expenses: number | null; total_material_value: number | null; unvalued_stock: number; unvalued_expenses: number } | null;
}) {
  const money = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
  const cards = [
    { label: "Total projects", value: metrics.total, detail: `${metrics.active} currently active`, icon: Building03Icon, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Active projects", value: metrics.active, detail: "Accessible to your account", icon: Building03Icon, tone: "bg-blue-50 text-blue-700" },
    { label: "On hold", value: metrics.onHold, detail: "Requires follow-up", icon: PauseIcon, tone: "bg-amber-50 text-amber-700" },

  ];
  const visibleCards = financialTotals !== undefined ? [cards[0],
    { label: "Total sales", value: money(financialTotals?.total_sales), detail: financialTotals ? "All-time issued invoices · not collections" : "Totals migration required", icon: Money03Icon, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Total expenses", value: money(financialTotals?.total_expenses), detail: financialTotals?.unvalued_expenses ? "Complete missing cost valuations" : financialTotals ? "All-time posted project costs · not cash paid" : "Totals migration required", icon: Money03Icon, tone: "bg-amber-50 text-amber-700" },
    { label: "Total material value", value: money(financialTotals?.total_material_value), detail: financialTotals?.unvalued_stock ? "Verify opening stock values" : financialTotals ? "On-hand warehouse and site stock · excludes transit" : "Totals migration required", icon: PackageIcon, tone: "bg-violet-50 text-violet-700" },
  ] : cards;
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Welcome, {name.split(" ")[0]}</h1><p className="mt-1 text-sm text-slate-500">Project and warehouse records available to your account.</p></div>
    </div>
    <section className={`mt-8 grid gap-5 sm:grid-cols-2 ${visibleCards.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`} aria-label="Overview metrics">{visibleCards.map((card) => <MetricCard key={card.label} {...card} />)}</section>
    <div className={`mt-5 grid items-stretch gap-5 ${canViewRequests ? "xl:grid-cols-2" : ""}`}>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="ongoing-projects-heading">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="ongoing-projects-heading" className="text-base font-semibold text-slate-900">Ongoing projects</h2><Button variant="ghost" size="sm" asChild><Link href="/projects">View all</Link></Button></div>
        {recentProjects.length === 0 ? <EmptyState title="No ongoing projects" description={canManage ? "Create a project to start tracking work." : undefined} /> : <div className="divide-y divide-slate-100">{recentProjects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
          <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{project.photo_path ? <Image src={recordPhotoUrl("projects", project.id, project.updated_at)} alt="" fill sizes="56px" unoptimized className="object-cover" /> : <HugeiconsIcon icon={Building03Icon} size={22} />}</div>
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
    <div className={`mt-5 grid items-stretch gap-5 ${monthlyCosts.length && canViewConsumption ? "xl:grid-cols-2" : ""}`}>
      {monthlyCosts.length > 0 && <MonthlyCosts rows={monthlyCosts} />}
      {canViewConsumption && <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">Material consumption</h2><Button variant="ghost" size="sm" asChild><Link href="/inventory/transactions">View all</Link></Button></div><p className="mt-1 text-xs text-slate-500">Posted usage in the last 6 months, excluding reversed entries. Compare materials within the same unit.</p><TrendChart {...consumptionTrend} area /></section>}
    </div>
    {canManage && <div className="mt-5">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-activity-heading"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id="recent-activity-heading" className="text-base font-semibold text-slate-900">Recent activity</h2><Button variant="ghost" size="sm" asChild><Link href="/audit-logs">View all</Link></Button></div>{recentActivity.length === 0 ? <EmptyState compact kind="items" title="No activity recorded" /> : <div className="divide-y divide-slate-100">{recentActivity.map((entry) => <Link key={entry.id} href={`/audit-logs/${entry.id}`} className="block px-5 py-3 hover:bg-slate-50"><p className="text-sm font-semibold capitalize text-slate-900">{entry.action.replaceAll("_", " ")} · {entry.table_name.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{entry.actorName} · {new Date(entry.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</p></Link>)}</div>}</section>
    </div>}
  </>;
}
