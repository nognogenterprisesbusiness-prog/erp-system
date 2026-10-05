import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { Suspense } from "react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { CheckmarkCircle02Icon, Money03Icon, PlusSignIcon, ShoppingCart01Icon, Store02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { SearchField } from "@/components/ui/search-field";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireProcurementViewer } from "@/lib/auth";
import { getPurchaseLines, getPurchaseOrderChoices, getPurchaseSummary } from "@/lib/data/purchase-orders";
import { MetricCard } from "@/components/ui/metric-card";
import { IssuePurchaseOrderForm } from "@/components/purchase-orders/purchase-order-forms";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { randomUUID } from "node:crypto";
import { uuidSchema } from "@nognog/domain";
import { todayInManila } from "@/lib/date";
import type { PurchaseLineRow } from "@/types/database";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const deliveryBadge: Record<PurchaseLineRow["delivery_stage"], { label: string; className: string }> = {
  waiting_approval: { label: "Waiting approval", className: "bg-amber-50 text-amber-800" },
  ordered: { label: "Ordered", className: "bg-slate-100 text-slate-700" },
  partly_received: { label: "Partly received", className: "bg-sky-50 text-sky-800" },
  received: { label: "Received", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-slate-100 text-slate-500" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
};
const paymentBadge: Record<PurchaseLineRow["payment_stage"], { label: string; className: string } | null> = {
  unpaid: { label: "Unpaid", className: "bg-amber-50 text-amber-800" },
  partly_paid: { label: "Partly paid", className: "bg-sky-50 text-sky-800" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  to_reimburse: { label: "To reimburse", className: "bg-amber-50 text-amber-800" },
  none: null,
};
const quantity = (value: number) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 });

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementViewer();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const resultPromise = getPurchaseLines({ page, query });
  const summaryPromise = getPurchaseSummary();
  const choices = user.canManage && params.create === "1" ? await getPurchaseOrderChoices() : null;
  const material = uuidSchema.safeParse(params.material);
  const warehouse = uuidSchema.safeParse(params.warehouse);
  const quantity = typeof params.quantity === "string" && /^\d+(\.\d{1,4})?$/.test(params.quantity) && Number(params.quantity) > 0 ? params.quantity : undefined;
  const pageHref = (target: number) => `/purchase-orders?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) })}`;
  return <>
    <PageHeader eyebrow="Purchasing" title="Purchases" description="Every item bought, by supplier: purchase orders and site purchases, with delivery and payment." action={user.canManage && <Button asChild><Link href="/purchase-orders?create=1"><HugeiconsIcon icon={PlusSignIcon} size={17} />Add purchase</Link></Button>} />
    {choices && <RecordCreateDialog title="Add purchase" initialOpen hideTrigger closeHref={pageHref(page)}>{choices.suppliers.length && choices.warehouses.length ? <IssuePurchaseOrderForm choices={choices} idempotencyKey={randomUUID()} today={todayInManila()} initialMaterialId={material.success ? material.data : undefined} initialWarehouseId={warehouse.success && choices.warehouses.some((item) => item.id === warehouse.data) ? warehouse.data : undefined} initialQuantity={quantity} /> : <EmptyState title="Supplier or warehouse missing" description="Add an active supplier and warehouse first." />}</RecordCreateDialog>}
    <Suspense fallback={<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>}><PurchaseSummary summaryPromise={summaryPromise} /></Suspense>
    <ListFilterBar><SearchField key={query} name="q" label="Search purchases" defaultValue={query} placeholder="Search item, supplier, purchase no. or location" /></ListFilterBar>
    <Suspense key={`${query}:${page}`} fallback={<TableSkeleton columns={8} filters={0} />}><PurchaseLineResults resultPromise={resultPromise} pageHref={pageHref} /></Suspense>
  </>;
}

async function PurchaseSummary({ summaryPromise }: { summaryPromise: ReturnType<typeof getPurchaseSummary> }) {
  const summary = await summaryPromise;
  return <section aria-label="Purchase totals" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <MetricCard label="Items bought" value={summary.items} detail="Purchase order and site purchase lines" icon={ShoppingCart01Icon} tone="bg-slate-100 text-slate-700" />
    <MetricCard label="Total purchase value" value={peso.format(summary.totalValue)} detail={summary.unpaid > 0 ? `${peso.format(summary.unpaid)} still to pay` : "Everything is paid"} icon={Money03Icon} tone="bg-amber-50 text-amber-700" />
    <MetricCard label="Suppliers" value={summary.suppliers} detail="Suppliers and hardware stores" icon={Store02Icon} tone="bg-sky-50 text-sky-700" />
    <MetricCard label="Received" value={summary.received} detail="Items already in inventory" icon={CheckmarkCircle02Icon} tone="bg-emerald-50 text-emerald-700" />
  </section>;
}

async function PurchaseLineResults({ resultPromise, pageHref }: { resultPromise: ReturnType<typeof getPurchaseLines>; pageHref: (page: number) => string }) {
  const result = await resultPromise;
  return <>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No purchases found" description="Add a purchase, or change the search." /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} item{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[1080px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Item · purchase</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Location</th><th className="px-5 py-3">Stage</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{result.rows.map((row) => {
          const delivery = deliveryBadge[row.delivery_stage];
          const payment = paymentBadge[row.payment_stage];
          const href = row.source === "purchase_order" ? `/purchase-orders/${row.purchase_id}` : `/site-purchases/${row.purchase_id}`;
          return <tr key={`${row.source}:${row.line_id}`} className="hover:bg-slate-50/70">
            <td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.material_name}</p><Link href={href} className="text-xs text-cyan-700 hover:underline">{row.purchase_number}</Link><span className="text-xs text-slate-500"> · {row.purchase_date}</span></td>
            <td className="px-4 py-4 text-right tabular-nums">{quantity(row.quantity)} {row.unit_symbol}{row.delivery_stage === "partly_received" && <p className="text-xs text-slate-500">{quantity(row.received_quantity)} received</p>}</td>
            <td className="px-4 py-4"><p className="font-medium">{row.supplier_name}</p><p className="text-xs text-slate-500">{[row.supplier_contact, row.payment_term].filter(Boolean).join(" · ")}</p></td>
            <td className="px-4 py-4 text-right tabular-nums">{peso.format(Number(row.unit_price))}</td>
            <td className="px-4 py-4 text-right font-semibold tabular-nums">{peso.format(Number(row.line_total))}</td>
            <td className="px-4 py-4 text-slate-600">{row.location_name ?? "—"}</td>
            <td className="px-5 py-4"><div className="flex flex-wrap gap-1.5 text-xs"><span className={`rounded-full px-2.5 py-1 font-semibold ${delivery.className}`}>{delivery.label}</span>{payment && <span className={`rounded-full px-2.5 py-1 font-semibold ${payment.className}`}>{payment.label}</span>}</div></td>
          </tr>;
        })}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Purchase pages" className="mt-4 flex items-center justify-end gap-2">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
