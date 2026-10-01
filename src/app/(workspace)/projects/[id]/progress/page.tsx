import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { requireDailyReportViewer } from "@/lib/auth";
import { uuidSchema } from "@nognog/domain";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getProject } from "@/lib/data/projects";
import { getProjectProgressPage } from "@/lib/data/project-operations";
import { pageNumber } from "@/lib/data/pagination";
import { HistoryPagination } from "@/components/ui/history-pagination";

export default async function ProjectProgressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  await requireDailyReportViewer();
  const page = pageNumber((await searchParams).page);
  const [data, history] = await Promise.all([getProject(id), getProjectProgressPage(id, page)]);
  const entries = history.entries;
  const sites = new Map(data.sites.map((site) => [site.id, site.name]));
  return <><PageHeader title="Project progress" description={`${data.project.code} · ${data.project.name}`} action={<Button variant="outline" asChild><Link href={`/projects/${id}`}>Back to project</Link></Button>} />
    <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      {entries.length === 0 ? <EmptyState title="No progress recorded" description="Progress is recorded from an approved daily report." /> :
        <div className="divide-y divide-slate-100">{entries.map((entry) => <article key={entry.id} className="flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0"><div className="min-w-[110px] text-sm font-medium text-slate-500">{entry.progress_date}</div><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{entry.completion_percent}% complete · {sites.get(entry.project_site_id) ?? "Project site"}</h2><p className="mt-1 text-sm text-slate-600">{entry.summary}</p><Link className="mt-2 inline-block text-sm text-cyan-700 hover:underline" href={`/reports/daily/${entry.daily_report_id}`}>View approved daily report</Link></div></article>)}</div>}
    </section>
    <HistoryPagination path={`/projects/${id}/progress`} page={page} count={history.count} />
  </>;
}
