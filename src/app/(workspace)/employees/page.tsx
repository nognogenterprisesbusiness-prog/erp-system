import Link from "next/link";
import { PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmployeeTable } from "@/components/workforce/employee-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getEmployees, getWorkforceReferences } from "@/lib/data/workforce";
import type { EmployeeStatus } from "@/types/database";

const statuses: Array<EmployeeStatus | "all"> = ["all", "active", "inactive", "on_leave", "separated"];
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const categoryId = typeof params.category === "string" ? params.category : "";
  const projectId = typeof params.project === "string" ? params.project : "";
  const status = typeof params.status === "string" && statuses.includes(params.status as EmployeeStatus | "all") ? params.status as EmployeeStatus | "all" : "all";
  const page = typeof params.page === "string" ? Math.max(1, Number(params.page) || 1) : 1;
  const [user, result, references] = await Promise.all([requireUser(), getEmployees({ query, categoryId, projectId, status, page }), getWorkforceReferences()]);
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (query) next.set("q", query); if (categoryId) next.set("category", categoryId); if (projectId) next.set("project", projectId); if (status !== "all") next.set("status", status); next.set("page", String(target)); return `/employees?${next}`; };
  return <>
    <PageHeader eyebrow="Labor and workforce" title="Employees" description="A secure worker registry with project history, optional user-account links, and versioned labor rates." action={user.canManage && <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/employees/categories">Categories</Link></Button><Button asChild><Link href="/employees/new"><HugeiconsIcon icon={PlusSignIcon} size={17} /> Register employee</Link></Button></div>} />
    <form className="mt-7 grid gap-3 border-y border-slate-200 bg-white p-4 lg:grid-cols-[1fr_190px_220px_170px_auto]"><label className="relative"><span className="sr-only">Search employees</span><HugeiconsIcon icon={Search01Icon} size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={query} placeholder="Search name, code, or employment type" className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm" /></label><select name="category" defaultValue={categoryId} aria-label="Employee category" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All categories</option>{references.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="project" defaultValue={projectId} aria-label="Assigned project" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All assigned projects</option>{references.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="status" defaultValue={status} aria-label="Employment status" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">{statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item.replace("_", " ")}</option>)}</select><Button variant="outline">Apply</Button></form>
    <EmployeeTable employees={result.employees} count={result.count} canManage={user.canManage} />
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Employee pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
