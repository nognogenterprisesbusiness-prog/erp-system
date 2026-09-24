import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DailyReportList } from "@/components/reports/daily-report-list";
import { getDailyReportChoices, getDailyReports } from "@/lib/data/daily-reports";
import { getProject } from "@/lib/data/projects";

export default async function ProjectDailyReportsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const page = Number(query.page ?? "1");
  const [project, result, choices] = await Promise.all([getProject(id), getDailyReports({ projectId: id, page }), getDailyReportChoices()]);
  const canCreate = choices.sites.some((site) => site.project_id === id);
  return <>
    <PageHeader eyebrow={project.project.code} title="Project daily reports" description={`${project.project.name} · site work and report history`}
      action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/projects/${id}`}>Project overview</Link></Button>{canCreate && <Button asChild><Link href={`/reports/daily/new?project=${id}`}>Create report</Link></Button>}</div>} />
    <div className="mt-7"><DailyReportList reports={result.reports} count={result.count} /></div>
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Project report pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={`?page=${result.page - 1}`}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={`?page=${result.page + 1}`}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
