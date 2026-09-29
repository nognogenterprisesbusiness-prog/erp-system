import { IntentLink as Link } from "@/components/layout/intent-link";
import { ArchiveSupplierCategoryForm, SupplierCategoryForm } from "@/components/suppliers/supplier-category-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import { requireManager } from "@/lib/auth";
import { getSupplierCategories } from "@/lib/data/suppliers";

export default async function SupplierCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireManager(); const params = await searchParams; const categories = await getSupplierCategories(false); const editing = params.edit ? categories.find((item) => item.id === params.edit) : undefined;
  return <><PageHeader eyebrow="Supplier settings" title="Supplier categories" description="Group suppliers into categories that make them easier to organize." action={<Button variant="outline" asChild><Link href="/suppliers">Back to suppliers</Link></Button>} /><div className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white"><SupplierCategoryForm category={editing} />{!categories.length ? <EmptyState kind="items" title="No supplier categories yet" /> : <div className="divide-y divide-slate-100">{categories.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.description || "No description"}</p></div><div className="flex flex-wrap gap-1"><RecordActionIcon label="Edit" name={item.name} href={`/suppliers/categories?edit=${item.id}`} /><ArchiveSupplierCategoryForm categoryId={item.id} categoryName={item.name} /></div></div>)}</div>}</div></>;
}
