import Link from "next/link";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireProcurementViewer } from "@/lib/auth";
import { getPurchaseOrders } from "@/lib/data/purchase-orders";

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementViewer();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const result = await getPurchaseOrders({ page, query });
  const pageHref = (target: number) => `/purchase-orders?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) })}`;
  return <>
    <PageHeader title="Purchase orders" description="Issued supplier orders and warehouse receipt progress." action={user.canManage && <Button asChild><Link href="/purchase-orders/new"><HugeiconsIcon icon={PlusSignIcon} size={17} /> New purchase order</Link></Button>} />
    <form className="mt-7 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><SearchField name="q" label="Search purchase orders" defaultValue={query} placeholder="Search order, supplier, or warehouse" wrapperClassName="min-w-[220px] flex-1" /><Button variant="outline">Search</Button></form>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No purchase orders found" description="Issue an order or change the search." /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} order{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[710px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Code</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Ordered / expected</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((order) => <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-semibold"><Link href={`/purchase-orders/${order.id}`} className="text-slate-900 hover:text-cyan-700">{order.po_number}</Link></td><td className="px-4 py-4 text-slate-800">{order.supplier_name}</td><td className="px-4 py-4 text-slate-600">{order.warehouse_code} · {order.warehouse_name}</td><td className="px-4 py-4 text-slate-600">{order.ordered_on}<br /><span className="text-xs text-slate-500">Expected {order.expected_on}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.status === "received" ? "bg-emerald-50 text-emerald-700" : order.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"}`}>{order.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Purchase order pages" className="mt-4 flex items-center justify-end gap-2">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
