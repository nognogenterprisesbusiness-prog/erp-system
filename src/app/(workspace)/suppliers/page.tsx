import Link from "next/link";
import { PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { uuidSchema } from "@nognog/domain";
import { SupplierCards } from "@/components/suppliers/supplier-cards";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
  return <><PageHeader eyebrow="Procurement foundation" title="Suppliers" description="Supplier identities, material catalogs, and historical pricing connected to the existing material master." action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/suppliers/prices">Compare prices</Link></Button>{user.canManage && <><Button variant="outline" asChild><Link href="/suppliers/categories">Categories</Link></Button><Button asChild><Link href="/suppliers/new"><HugeiconsIcon icon={PlusSignIcon} size={17} /> Register supplier</Link></Button></>}</div>} />
    <form className="mt-7 grid gap-3 border-y border-slate-200 bg-white p-4 lg:grid-cols-[1fr_220px_180px_auto]"><label className="relative"><span className="sr-only">Search suppliers</span><HugeiconsIcon icon={Search01Icon} size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={query} placeholder="Search supplier, business, code, or contact" className="h-10 w-full rounded-full border border-slate-200 pl-11 pr-4 text-sm" /></label><select name="category" defaultValue={categoryId} aria-label="Supplier category" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All categories</option>{references.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="status" defaultValue={status} aria-label="Supplier status" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">{statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item}</option>)}</select><Button variant="outline">Apply</Button></form>
    <SupplierCards suppliers={result.suppliers} count={result.count} canManage={user.canManage} />
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Supplier pages">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
