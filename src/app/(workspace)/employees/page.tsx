import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { uuidSchema } from "@nognog/domain";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { EmployeeForm } from "@/components/workforce/employee-form";
import Link from "next/link";
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
  const parsedCategory = uuidSchema.safeParse(params.category); const categoryId = parsedCategory.success ? parsedCategory.data : "";
  const parsedProject = uuidSchema.safeParse(params.project); const projectId = parsedProject.success ? parsedProject.data : "";
  const status = typeof params.status === "string" && statuses.includes(params.status as EmployeeStatus | "all") ? params.status as EmployeeStatus | "all" : "all";
  const page = typeof params.page === "string" ? Math.max(1, Number(params.page) || 1) : 1;
  const [user, result, references] = await Promise.all([requireUser(), getEmployees({ query, categoryId, projectId, status, page }), getWorkforceReferences()]);
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (query) next.set("q", query); if (categoryId) next.set("category", categoryId); if (projectId) next.set("project", projectId); if (status !== "all") next.set("status", status); next.set("page", String(target)); return `/employees?${next}`; };
  return <>
    <PageHeader eyebrow="Labor and workforce" title="Employees" description="A secure worker registry with project history, optional user-account links, and versioned labor rates." action={user.canManage && <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/attendance">Attendance</Link></Button><Button variant="outline" asChild><Link href="/employees/categories">Categories</Link></Button><RecordCreateDialog title="Add employee" initialOpen={params.create === "1"} closeHref={pageHref(page)}><EmployeeForm categories={references.categories} profiles={references.profiles} /></RecordCreateDialog></div>} />
    <ListFilterBar>
      <SearchField name="q" label="Search employees" defaultValue={query} placeholder="Search name, code, or employment type" />
      <SelectPicker name="category" label="Employee category" defaultValue={categoryId || "all"} options={[{ value: "all", label: "All categories" }, ...references.categories.map((item) => ({ value: item.id, label: item.name }))]} />
      <SelectPicker name="project" label="Assigned project" defaultValue={projectId || "all"} options={[{ value: "all", label: "All assigned projects" }, ...references.projects.map((item) => ({ value: item.id, label: item.name }))]} />
      <SelectPicker name="status" label="Employment status" defaultValue={status} options={statuses.map((item) => ({ value: item, label: item === "all" ? "All statuses" : item.replace("_", " ") }))} />
    </ListFilterBar>
    <EmployeeTable employees={result.employees} count={result.count} canManage={user.canManage} />
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Employee pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
