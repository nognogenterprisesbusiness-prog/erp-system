import Link from "next/link";
import { dailyReportStatuses, uuidSchema } from "@nognog/domain";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DailyReportList } from "@/components/reports/daily-report-list";
import { ReportDateRangeFilter } from "@/components/reports/report-date-range-filter";
import { getDailyReportChoices, getDailyReportFilterChoices, getDailyReports } from "@/lib/data/daily-reports";

export default async function DailyReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const project = uuidSchema.safeParse(params.project);
  const site = uuidSchema.safeParse(params.site);
  const legacyDate = z.iso.date().safeParse(params.date);
  const start = z.iso.date().safeParse(params.from);
  const end = z.iso.date().safeParse(params.to);
  const rawStart = start.success ? start.data : legacyDate.success ? legacyDate.data : "";
  const rawEnd = end.success ? end.data : legacyDate.success ? legacyDate.data : "";
  const validRange = !rawStart || !rawEnd || rawStart <= rawEnd;
  const status = z.enum([...dailyReportStatuses, "all"]).safeParse(params.status);
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const filters = { search, projectId: project.success ? project.data : "", siteId: site.success ? site.data : "", reportDateFrom: validRange ? rawStart : "", reportDateTo: validRange ? rawEnd : "", status: status.success ? status.data : "all" as const, page };
  const [choices, filterChoices, result] = await Promise.all([getDailyReportChoices(), getDailyReportFilterChoices(), getDailyReports(filters)]);
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (search) next.set("q", search); if (filters.projectId) next.set("project", filters.projectId); if (filters.siteId) next.set("site", filters.siteId); if (filters.reportDateFrom) next.set("from", filters.reportDateFrom); if (filters.reportDateTo) next.set("to", filters.reportDateTo); if (filters.status !== "all") next.set("status", filters.status); next.set("page", String(target)); return `/reports/daily?${next}`; };
  return <>
    <PageHeader eyebrow="Site reporting" title="Daily reports" description="Record site work and preserve submitted report history for assigned projects."
      action={<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <ReportDateRangeFilter key={`${filters.reportDateFrom}:${filters.reportDateTo}`} startDate={filters.reportDateFrom} endDate={filters.reportDateTo} search={search} projectId={filters.projectId} siteId={filters.siteId} status={filters.status} />
        {choices.sites.length > 0 && <Button asChild><Link href="/reports/daily/new">Add report</Link></Button>}
      </div>} />
    <form className="mt-7 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_160px_auto]">
      <input type="hidden" name="from" value={filters.reportDateFrom} />
      <input type="hidden" name="to" value={filters.reportDateTo} />
      <input name="q" aria-label="Search report number or work" defaultValue={search} placeholder="Search reports" className="h-10 min-w-0 rounded-full border border-slate-200 px-4 text-sm" />
      <select name="project" aria-label="Project" defaultValue={filters.projectId} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All projects</option>{filterChoices.projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
      <select name="site" aria-label="Site" defaultValue={filters.siteId} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All sites</option>{filterChoices.sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select name="status" aria-label="Status" defaultValue={filters.status} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">All statuses</option>{dailyReportStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <Button variant="outline">Apply</Button>
    </form>
    <div className="mt-4"><DailyReportList reports={result.reports} count={result.count} /></div>
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Report pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
