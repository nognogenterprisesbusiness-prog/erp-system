import { ListFilterBar } from "@/components/ui/list-filter-bar";
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
import { getPurchaseOrderChoices } from "@/lib/data/purchase-orders";
import { IssuePurchaseOrderForm } from "@/components/purchase-orders/purchase-order-forms";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { randomUUID } from "node:crypto";
import { uuidSchema } from "@nognog/domain";
import { todayInManila } from "@/lib/date";

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementViewer();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const result = await getPurchaseOrders({ page, query });
  const choices = user.canManage && params.create === "1" ? await getPurchaseOrderChoices() : null;
  const material = uuidSchema.safeParse(params.material);
  const warehouse = uuidSchema.safeParse(params.warehouse);
  const quantity = typeof params.quantity === "string" && /^\d+(\.\d{1,4})?$/.test(params.quantity) && Number(params.quantity) > 0 ? params.quantity : undefined;
  const pageHref = (target: number) => `/purchase-orders?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) })}`;
  return <>
    <PageHeader title="Purchases" description="Choose a supplier, save the materials and prices, then record delivery. Stock and cost update automatically." action={user.canManage && <Button asChild><Link href="/purchase-orders?create=1"><HugeiconsIcon icon={PlusSignIcon} size={17} />Add purchase</Link></Button>} />
    {choices && <RecordCreateDialog title="Add purchase" initialOpen hideTrigger closeHref={pageHref(page)}>{choices.suppliers.length && choices.warehouses.length ? <IssuePurchaseOrderForm choices={choices} idempotencyKey={randomUUID()} today={todayInManila()} initialMaterialId={material.success ? material.data : undefined} initialWarehouseId={warehouse.success && choices.warehouses.some((item) => item.id === warehouse.data) ? warehouse.data : undefined} initialQuantity={quantity} /> : <EmptyState title="Supplier or warehouse missing" description="Add an active supplier and warehouse first." />}</RecordCreateDialog>}
    <ListFilterBar><SearchField name="q" label="Search purchases" defaultValue={query} placeholder="Search purchase, supplier or warehouse" /></ListFilterBar>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No purchase orders found" description="Issue an order or change the search." /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} order{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[710px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Code</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Ordered / expected</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((order) => <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-semibold"><Link href={`/purchase-orders/${order.id}`} className="text-slate-900 hover:text-cyan-700">{order.po_number}</Link></td><td className="px-4 py-4 text-slate-800">{order.supplier_name}</td><td className="px-4 py-4 text-slate-600">{order.warehouse_code} · {order.warehouse_name}</td><td className="px-4 py-4 text-slate-600">{order.ordered_on}<br /><span className="text-xs text-slate-500">Expected {order.expected_on}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.status === "received" ? "bg-emerald-50 text-emerald-700" : order.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"}`}>{order.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Purchase order pages" className="mt-4 flex items-center justify-end gap-2">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
