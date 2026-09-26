import { IntentLink as Link } from "@/components/layout/intent-link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EndAssignmentForm, WorkforceAssignmentForm } from "@/components/workforce/workforce-forms";
import type { getProjectWorkforce } from "@/lib/data/workforce";

type ProjectWorkforceData = Awaited<ReturnType<typeof getProjectWorkforce>>;
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "Present";
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function ProjectWorkforceSection({ projectId, projectName, workforce, canManage, canViewRates }: {
  projectId: string;
  projectName: string;
  workforce: ProjectWorkforceData;
  canManage: boolean;
  canViewRates: boolean;
}) {
  return <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-col gap-1 border-b border-slate-100 px-6 py-5"><h2 className="font-semibold">Workforce</h2><p className="text-xs text-slate-500">Employee assignments at {projectName}; user access remains managed separately under Personnel.</p></div>
    {canManage && <div className="border-b border-slate-100 p-5"><WorkforceAssignmentForm fixedProjectId={projectId} employees={workforce.availableEmployees} projects={[{ id: projectId, name: projectName }]} sites={workforce.sites} /></div>}
    {workforce.assignments.length === 0 ? <EmptyState kind="items" title="No workforce assignments recorded" /> : <div className="divide-y divide-slate-100">{workforce.assignments.map((assignment) => <article key={assignment.id} className="px-6 py-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link href={`/employees/${assignment.employee_id}`} className="text-sm font-semibold hover:text-cyan-700">{assignment.employeeName}</Link><Badge variant={assignment.status === "active" ? "active" : "neutral"}>{assignment.status}</Badge></div><p className="mt-1 text-xs text-slate-500">{assignment.position_title} · {assignment.categoryName} · {assignment.siteName}</p><p className="mt-1 text-xs text-slate-400">{date(assignment.start_date)} – {date(assignment.end_date)}</p></div>{canViewRates && <div className="text-left xl:min-w-44 xl:text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Current labor rate</p><p className="mt-1 text-sm font-semibold">{assignment.currentRates.length ? assignment.currentRates.map((rate) => `${money.format(rate.rate_amount)}/${rate.rate_type === "daily" ? "day" : "hour"}`).join(" · ") : "Not configured"}</p></div>}{canManage && assignment.status === "active" && <EndAssignmentForm assignment={assignment} />}</div></article>)}</div>}
  </section>;
}
