import { ListFilterBar } from "@/components/ui/list-filter-bar";
import Link from "next/link";
import { dailyReportStatuses, uuidSchema } from "@nognog/domain";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
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
    <ListFilterBar>
      <input type="hidden" name="from" value={filters.reportDateFrom} />
      <input type="hidden" name="to" value={filters.reportDateTo} />
      <SearchField name="q" label="Search report number or work" defaultValue={search} placeholder="Search reports" />
      <SelectPicker name="project" label="Project" defaultValue={filters.projectId || "all"} options={[{ value: "all", label: "All projects" }, ...filterChoices.projects.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} />
      <SelectPicker name="site" label="Site" defaultValue={filters.siteId || "all"} options={[{ value: "all", label: "All sites" }, ...filterChoices.sites.map((item) => ({ value: item.id, label: item.name }))]} />
      <SelectPicker name="status" label="Status" defaultValue={filters.status} options={[{ value: "all", label: "All statuses" }, ...dailyReportStatuses.map((item) => ({ value: item, label: item.replaceAll("_", " ") }))]} />
    </ListFilterBar>
    <div className="mt-4"><DailyReportList reports={result.reports} count={result.count} /></div>
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Report pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
