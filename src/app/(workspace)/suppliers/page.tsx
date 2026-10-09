import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { Suspense } from "react";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { SupplierCards } from "@/components/suppliers/supplier-cards";
import { RecordListSkeleton } from "@/components/ui/record-list-view";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { requireProcurementViewer } from "@/lib/auth";
import { getSuppliers } from "@/lib/data/suppliers";
import type { SupplierStatus } from "@/types/database";

const statuses: Array<SupplierStatus | "archived" | "all"> = ["all", "active", "inactive", "archived"];
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" && statuses.includes(params.status as SupplierStatus | "archived" | "all") ? params.status as SupplierStatus | "archived" | "all" : "all";
  const page = typeof params.page === "string" ? Math.max(1, Number(params.page) || 1) : 1;
  const resultPromise = getSuppliers({ query, status, page });
  const user = await requireProcurementViewer();
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (query) next.set("q", query); if (status !== "all") next.set("status", status); next.set("page", String(target)); return `/suppliers?${next}`; };
  return <><PageHeader eyebrow="Procurement foundation" title="Suppliers" description="Suppliers, the materials they sell and their price history." action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/suppliers/prices">Compare prices</Link></Button>{user.canManage && <RecordCreateDialog title="Add supplier" initialOpen={params.create === "1"} closeHref={pageHref(page)}><SupplierForm /></RecordCreateDialog>}</div>} />
    <ListFilterBar viewKey="suppliers" viewTitle="Suppliers"><SearchField key={query} name="q" defaultValue={query} label="Search suppliers" placeholder="Search supplier, business, code, or contact" /><SelectPicker name="status" label="Supplier status" defaultValue={status} options={statuses.map((item) => ({ value: item, label: item === "all" ? "All statuses" : item[0].toUpperCase() + item.slice(1) }))} /></ListFilterBar>
    <Suspense key={`${query}:${status}:${page}`} fallback={<RecordListSkeleton storageKey="suppliers" columns={8} />}><SupplierResults resultPromise={resultPromise} canManage={user.canManage} pageHref={pageHref} /></Suspense>
  </>;
}

async function SupplierResults({ resultPromise, canManage, pageHref }: { resultPromise: ReturnType<typeof getSuppliers>; canManage: boolean; pageHref: (page: number) => string }) {
  const result = await resultPromise;
  return <><SupplierCards suppliers={result.suppliers} count={result.count} canManage={canManage} />
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Supplier pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
