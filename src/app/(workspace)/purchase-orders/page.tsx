import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { Suspense } from "react";
import { notFound } from "next/navigation";
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
import { getPendingPurchaseApprovals } from "@/lib/data/purchase-approvals";
import { getPurchaseSourceReport, getPurchaseSourceRequest, getSupplierQuotation } from "@/lib/data/procurement-stages";
import { MetricCard } from "@/components/ui/metric-card";
import { IssuePurchaseOrderForm } from "@/components/purchase-orders/purchase-order-forms";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { randomUUID } from "node:crypto";
import { uuidSchema } from "@nognog/domain";
import { todayInManila } from "@/lib/date";
import { PurchaseWorkflowCell } from "@/components/purchase-orders/purchase-workflow-cell";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const quantity = (value: number) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 });

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireProcurementViewer();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const approvalPage = typeof params.approvalPage === "string" ? Number(params.approvalPage) : 1;
  const resultPromise = getPurchaseLines({ page, query });
  const summaryPromise = getPurchaseSummary();
  const approvalsPromise = getPendingPurchaseApprovals(approvalPage);
  const choices = user.canManage && params.create === "1" ? await getPurchaseOrderChoices() : null;
  const quoteId = uuidSchema.safeParse(params.quotation);
  const requestId = uuidSchema.safeParse(params.request);
  const shortageId = uuidSchema.safeParse(params.shortage);
  if (requestId.success && shortageId.success) notFound();
  const [selectedQuote, selectedRequest, selectedReport] = choices ? await Promise.all([
    quoteId.success ? getSupplierQuotation(quoteId.data) : null,
    requestId.success ? getPurchaseSourceRequest(requestId.data) : null,
    shortageId.success ? getPurchaseSourceReport(shortageId.data) : null,
  ]) : [null, null, null];
  const material = uuidSchema.safeParse(params.material);
  const warehouse = uuidSchema.safeParse(params.warehouse);
  const quantity = typeof params.quantity === "string" && /^\d+(\.\d{1,4})?$/.test(params.quantity) && Number(params.quantity) > 0 ? params.quantity : undefined;
  const pageHref = (target: number) => `/purchase-orders?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) })}`;
  return <>
    <PageHeader eyebrow="Purchasing & suppliers" title="Purchasing by Supplier" description="Every purchased item, with its supplier, delivery and payment history." action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/purchase-orders/quotations">Compare quotations</Link></Button>{user.canManage && <Button asChild><Link href="/purchase-orders?create=1"><HugeiconsIcon icon={PlusSignIcon} size={17} />Add supplier items</Link></Button>}</div>} />
    {choices && <RecordCreateDialog title="Add purchase" initialOpen hideTrigger closeHref={pageHref(page)}>{choices.suppliers.length && choices.warehouses.length ? <IssuePurchaseOrderForm choices={choices} idempotencyKey={randomUUID()} today={todayInManila()} initialMaterialId={material.success ? material.data : undefined} initialWarehouseId={warehouse.success && choices.warehouses.some((item) => item.id === warehouse.data) ? warehouse.data : undefined} initialQuantity={quantity} quotation={selectedQuote ? { id: selectedQuote.quote.id, reference: selectedQuote.quote.reference, supplierId: selectedQuote.quote.supplier_id, lines: selectedQuote.lines.map((line) => ({ materialId: line.material_id, quantity: String(line.quantity), unitPrice: Number(line.unit_price).toFixed(2) })) } : undefined} sourceRequest={selectedRequest ? { id: selectedRequest.request.id, number: selectedRequest.request.request_number, warehouseId: selectedRequest.request.source_warehouse_id, lines: selectedRequest.lines.map((line) => ({ materialId: line.material_id, quantity: String(line.requested_quantity) })) } : undefined} sourceReport={selectedReport ? { id: selectedReport.id, materialName: selectedReport.material_name, warehouseId: selectedReport.source_warehouse_id, quantity: String(selectedReport.requested_quantity), materialId: selectedReport.linkedMaterialId } : undefined} /> : <EmptyState title="Supplier or warehouse missing" description="Add an active supplier and warehouse first." />}</RecordCreateDialog>}
    <Suspense fallback={<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div>}><PurchaseSummary summaryPromise={summaryPromise} /></Suspense>
    <Suspense fallback={null}><PendingPurchaseApprovals resultPromise={approvalsPromise} canManage={user.canManage} query={query} page={page} /></Suspense>
    <ListFilterBar><SearchField key={query} name="q" label="Search purchases" defaultValue={query} placeholder="Search item, supplier, purchase no. or location" /></ListFilterBar>
    <Suspense key={`${query}:${page}`} fallback={<TableSkeleton columns={7} filters={0} />}><PurchaseLineResults resultPromise={resultPromise} pageHref={pageHref} canManage={user.canManage} canViewFinance={user.canViewLaborRates} /></Suspense>
  </>;
}

async function PendingPurchaseApprovals({ resultPromise, canManage, query, page }: {
  resultPromise: ReturnType<typeof getPendingPurchaseApprovals>; canManage: boolean; query: string; page: number;
}) {
  const result = await resultPromise;
  if (!result.count) return null;
  const href = (target: number) => `/purchase-orders?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page), approvalPage: String(target) })}`;
  return <section className="mt-7" aria-labelledby="purchase-approvals-heading">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><h2 id="purchase-approvals-heading" className="text-lg font-semibold text-slate-900">Waiting for owner approval</h2><p className="text-sm text-slate-600">{result.count} purchase{result.count === 1 ? "" : "s"} above ₱50,000</p></div>
    <DataTableShell><table className="w-full min-w-[640px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Supplier</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Total</th><th className="px-5 py-3">Action</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{result.rows.map((row) => <tr key={row.id}><td className="px-5 py-4 font-medium text-slate-900">{row.supplierName}</td><td className="px-4 py-4">{row.warehouseName}</td><td className="px-4 py-4">{new Date(row.createdAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td><td className="px-4 py-4 font-semibold tabular-nums">{peso.format(row.orderTotal)}</td><td className="px-5 py-4"><Button variant="outline" size="sm" asChild><Link href={`/purchase-orders/approvals/${row.id}`}>{canManage ? "Review" : "View"}</Link></Button></td></tr>)}</tbody></table></DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Purchase approval pages" className="mt-3 flex items-center justify-end gap-2">
      {result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={href(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
      <span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>
      {result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={href(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
    </nav>}
  </section>;
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

async function PurchaseLineResults({ resultPromise, pageHref, canManage, canViewFinance }: { resultPromise: ReturnType<typeof getPurchaseLines>; pageHref: (page: number) => string; canManage: boolean; canViewFinance: boolean }) {
  const result = await resultPromise;
  const today = todayInManila();
  return <>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No purchases found" description="Add a purchase, or change the search." /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} item{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[1160px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Item · purchase</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Location</th><th className="px-5 py-3">Workflow stage / action</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{result.rows.map((row) => {
          const href = row.source === "purchase_order" ? `/purchase-orders/${row.purchase_id}` : `/site-purchases/${row.purchase_id}`;
          return <tr key={`${row.source}:${row.line_id}`} className="hover:bg-slate-50/70">
            <td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.material_name}</p><Link href={href} className="text-xs text-cyan-700 hover:underline">{row.purchase_number}</Link><span className="text-xs text-slate-500"> · {row.purchase_date}</span></td>
            <td className="px-4 py-4 tabular-nums">{quantity(row.quantity)} {row.unit_symbol}{row.delivery_stage === "partly_received" && <p className="text-xs text-slate-500">{quantity(row.received_quantity)} received</p>}</td>
            <td className="px-4 py-4"><p className="font-medium">{row.supplier_name}</p><p className="text-xs text-slate-500">{[row.supplier_contact, row.payment_term].filter(Boolean).join(" · ")}</p></td>
            <td className="px-4 py-4 tabular-nums">{peso.format(Number(row.unit_price))}</td>
            <td className="px-4 py-4 font-semibold tabular-nums">{peso.format(Number(row.line_total))}</td>
            <td className="px-4 py-4 text-slate-600">{row.location_name ?? "—"}</td>
            <td className="px-5 py-4"><PurchaseWorkflowCell row={row} canManage={canManage} canViewFinance={canViewFinance} paymentBalance={row.paymentBalance} today={today} /></td>
          </tr>;
        })}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Purchase pages" className="mt-4 flex items-center justify-end gap-2">{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}<span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}</nav>}
  </>;
}
