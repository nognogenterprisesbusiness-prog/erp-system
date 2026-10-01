import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { Suspense } from "react";
import { uuidSchema } from "@nognog/domain";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { MaterialForm } from "@/components/materials/material-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { requireUser } from "@/lib/auth";
import { getMaterialReferences, getMaterials } from "@/lib/data/inventory";
export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const params = await searchParams; const query = typeof params.q === "string" ? params.q : ""; const parsedCategory = uuidSchema.safeParse(params.category); const categoryId = parsedCategory.success ? parsedCategory.data : ""; const status = params.status === "inactive" ? "inactive" : params.status === "all" ? "all" : "active"; const materialsPromise = getMaterials({ query, categoryId, status }); const [user, references] = await Promise.all([requireUser(), getMaterialReferences()]); return <>
  <PageHeader eyebrow="Inventory catalog" title="Materials" description="Materials with their units and categories." action={user.canManage && <div className="flex gap-2"><Button variant="outline" asChild><Link href="/materials/categories">Categories</Link></Button><RecordCreateDialog title="Add material" initialOpen={params.create === "1"} closeHref={`/materials?${new URLSearchParams({ q: query, category: categoryId, status })}`}><MaterialForm {...references} /></RecordCreateDialog></div>} />
  <ListFilterBar>
    <SearchField key={query} name="q" label="Search materials" defaultValue={query} placeholder="Search code or material" />
    <SelectPicker name="category" label="Category" defaultValue={categoryId || "all"} options={[{ value: "all", label: "All categories" }, ...references.categories.map((item) => ({ value: item.id, label: item.name }))]} />
    <SelectPicker name="status" label="Status" defaultValue={status} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "all", label: "All statuses" }]} />
  </ListFilterBar>
  <Suspense key={`${query}:${categoryId}:${status}`} fallback={<TableSkeleton columns={6} filters={0} />}><MaterialResults materialsPromise={materialsPromise} query={query} categoryId={categoryId} status={status} /></Suspense>
  </>; }

async function MaterialResults({ materialsPromise, query, categoryId, status }: { materialsPromise: ReturnType<typeof getMaterials>; query: string; categoryId: string; status: "all" | "active" | "inactive" }) {
  const materials = await materialsPromise;
  return <DataTableShell empty={materials.length === 0 ? <EmptyState kind={query || categoryId || status !== "active" ? "results" : "items"} title="No materials found" description="Change the filters or register a material." /> : undefined}><table className="w-full min-w-[820px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Material</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Base unit</th><th className="px-4 py-3">Minimum</th><th className="px-4 py-3">Type</th><th className="px-5 py-3 text-right">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{materials.map((item) => <tr key={item.id} className="hover:bg-slate-50/60"><td className="px-5 py-4"><Link href={`/materials/${item.id}`} className="text-sm font-semibold text-slate-800 hover:text-cyan-700">{item.name}</Link><p className="mt-0.5 text-[11px] text-slate-400">{item.code}</p></td><td className="px-4 py-4 text-xs text-slate-600">{item.categoryName}</td><td className="px-4 py-4 text-xs text-slate-600">{item.unitName}</td><td className="px-4 py-4 text-xs tabular-nums text-slate-600">{item.minimum_stock_level} {item.unitSymbol}</td><td className="px-4 py-4 text-xs capitalize text-slate-600">{item.material_kind}</td><td className="px-5 py-4 text-right"><Badge variant={item.is_active ? "active" : "neutral"}>{item.is_active ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody></table></DataTableShell>;
}
