import { IntentLink as Link } from "@/components/layout/intent-link";
import { archiveEmployeeCategoryAction } from "@/app/(workspace)/employees/actions";
import { EmployeeCategoryForm } from "@/components/workforce/employee-category-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import { requireManager } from "@/lib/auth";
import { getEmployeeCategories } from "@/lib/data/workforce";

export default async function EmployeeCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager();
  const params = await searchParams;
  const categories = await getEmployeeCategories(false);
  const editing = params.edit ? categories.find((item) => item.id === params.edit) : undefined;
  return <><PageHeader eyebrow="Workforce reference data" title="Employee categories" description="Maintain trades and workforce groupings without hardcoding them into forms." action={<Button variant="outline" asChild><Link href="/employees">Back to employees</Link></Button>} /><div className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white"><EmployeeCategoryForm category={editing} />{categories.length === 0 ? <EmptyState kind="items" title="No employee categories yet" /> : <div className="divide-y divide-slate-100">{categories.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.description || "No description"}</p></div><div className="flex gap-1"><RecordActionIcon label="Edit" name={item.name} href={`/employees/categories?edit=${item.id}`} /><form action={archiveEmployeeCategoryAction}><input type="hidden" name="id" value={item.id} /><RecordActionIcon label="Archive" name={item.name} submit destructive /></form></div></div>)}</div>}</div></>;
}
