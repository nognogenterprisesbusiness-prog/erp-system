import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { uuidSchema } from "@nognog/domain";
import { SupplierCards } from "@/components/suppliers/supplier-cards";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { requireProcurementViewer } from "@/lib/auth";
import { getSupplierReferences, getSuppliers } from "@/lib/data/suppliers";
import type { SupplierStatus } from "@/types/database";

const statuses: Array<SupplierStatus | "archived" | "all"> = ["all", "active", "inactive", "archived"];
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const parsedCategory = uuidSchema.safeParse(params.category);
  const categoryId = parsedCategory.success ? parsedCategory.data : "";
  const status = typeof params.status === "string" && statuses.includes(params.status as SupplierStatus | "archived" | "all") ? params.status as SupplierStatus | "archived" | "all" : "all";
  const page = typeof params.page === "string" ? Math.max(1, Number(params.page) || 1) : 1;
  const [user, result, references] = await Promise.all([requireProcurementViewer(), getSuppliers({ query, categoryId, status, page }), getSupplierReferences()]);
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (query) next.set("q", query); if (categoryId) next.set("category", categoryId); if (status !== "all") next.set("status", status); next.set("page", String(target)); return `/suppliers?${next}`; };
  return <><PageHeader eyebrow="Procurement foundation" title="Suppliers" description="Supplier identities, material catalogs, and historical pricing connected to the existing material master." action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/purchase-orders">Purchases</Link></Button><Button variant="outline" asChild><Link href="/suppliers/prices">Compare prices</Link></Button>{user.canManage && <><Button variant="outline" asChild><Link href="/suppliers/categories">Categories</Link></Button><RecordCreateDialog title="Add supplier" initialOpen={params.create === "1"} closeHref={pageHref(page)}><SupplierForm categories={references.categories} /></RecordCreateDialog></>}</div>} />
    <ListFilterBar><SearchField name="q" defaultValue={query} label="Search suppliers" placeholder="Search supplier, business, code, or contact" /><SelectPicker name="category" label="Supplier category" defaultValue={categoryId || "all"} options={[{ value: "all", label: "All categories" }, ...references.categories.map((item) => ({ value: item.id, label: item.name }))]} /><SelectPicker name="status" label="Supplier status" defaultValue={status} options={statuses.map((item) => ({ value: item, label: item === "all" ? "All statuses" : item[0].toUpperCase() + item.slice(1) }))} /></ListFilterBar>
    <SupplierCards suppliers={result.suppliers} count={result.count} canManage={user.canManage} />
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Supplier pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
