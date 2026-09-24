import Image from "next/image";
import Link from "next/link";
import { Building03Icon, ClipboardListIcon, DeliveryTruck01Icon, PauseIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { MaterialRequestStatus, ProjectStatus } from "@/types/database";

type RecentProject = { id: string; code: string; name: string; photo_path: string | null; city_province: string; status: ProjectStatus; target_completion_date: string; created_at: string };
type RecentRequest = { id: string; request_number: string; project_id: string; status: MaterialRequestStatus; required_date: string; requested_at: string; project?: { id: string; code: string; name: string } };
const requestLabels: Record<MaterialRequestStatus, string> = { submitted: "For approval", approved: "Approved", partially_approved: "Partial approval", rejected: "Rejected" };

export function DashboardOverview({ name, canManage, canViewRequests, metrics, recentProjects, recentRequests }: {
  name: string; canManage: boolean; canViewRequests: boolean;
  metrics: { total: number; active: number; onHold: number; warehouses: number };
  recentProjects: RecentProject[]; recentRequests: RecentRequest[];
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
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700"><HugeiconsIcon icon={ClipboardListIcon} size={20} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{request.request_number}</p><p className="mt-1 truncate text-xs text-slate-500">{request.project?.code ?? "Project"} · {request.project?.name ?? "Unavailable project"}</p><p className="mt-1 text-xs text-slate-500">Needed {request.required_date}</p></div>
          <Badge variant={request.status === "submitted" ? "review" : request.status === "rejected" ? "neutral" : "info"}>{requestLabels[request.status]}</Badge>
        </Link>)}</div>}
      </section>}
    </div>
  </>;
}
