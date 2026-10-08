import { HistoryPagination } from "@/components/ui/history-pagination";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { SearchField } from "@/components/ui/search-field";
import { pageNumber } from "@/lib/data/pagination";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { PurchaseDeliveryInspectionForm, ReceiveWarehouseDeliveryForm } from "@/components/purchase-orders/purchase-order-forms";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOpenPurchaseInspections } from "@/lib/data/procurement-stages";

const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

// Deliveries expected at the warehouses this user is assigned to. Prices stay hidden;
// the stock is valued at the PO price that Admin issued.
export default async function ReceiveDeliveriesPage({ searchParams }: { searchParams: Promise<{ posted?: string; q?: string; page?: string }> }) {
  const user = await requireUser();
  if (!user.canOperateInventory) notFound();
  const filters = await searchParams;
  const posted = filters.posted === "1";
  const inspected = filters.posted === "inspected";
  const rejected = filters.posted === "inspection-rejected";
  const page = pageNumber(filters.page);
  const search = (filters.q ?? "").slice(0, 100);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_warehouse_receivable_po_lines", { p_search: search, p_offset: (page - 1) * 20, p_limit: 20 });
  if (error) throw new Error(`Unable to load expected deliveries: ${error.message}`, { cause: error });
  const lines = data ?? [];
  const inspections = await getOpenPurchaseInspections(lines.map((line) => line.line_id));
  if (page > 1 && lines.length === 0) {
    const first = await supabase.rpc("get_warehouse_receivable_po_lines", { p_search: search, p_offset: 0, p_limit: 1 });
    if (first.error) throw new Error("Unable to verify the delivery page.");
    const lastPage = Math.max(1, Math.ceil((first.data?.[0]?.total_count ?? 0) / 20));
    redirect(`/purchase-orders/receive?${new URLSearchParams({ page: String(lastPage), ...(search ? { q: search } : {}), ...(posted ? { posted: "1" } : {}) })}`);
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <>
    <PageHeader eyebrow="Warehouse" title="Receive deliveries" description="Inspect the delivered quantity, then add only accepted materials to warehouse stock. The price comes from the purchase order." />
    {posted && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Delivery received. The stock is now in the warehouse inventory.</p>}
    {inspected && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Inspection saved. Add the accepted quantity to inventory when ready.</p>}
    {rejected && <p role="status" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Delivery rejected. No stock was added to inventory. Ask the supplier for a replacement delivery.</p>}
    <ListFilterBar><SearchField label="Search deliveries" name="q" defaultValue={search} maxLength={100} placeholder="PO, supplier, warehouse or material" /></ListFilterBar>
    <DataTableShell empty={lines.length === 0 ? <EmptyState kind="items" title="No deliveries waiting" description="Purchase orders for your warehouses appear here once an administrator issues them." /> : undefined} footer={lines.length ? <span className="text-xs text-slate-500">{lines.length} material line{lines.length === 1 ? "" : "s"} waiting</span> : undefined}>
      <table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Purchase order</th><th className="px-4 py-3">Material</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3 text-right">Ordered</th><th className="px-4 py-3 text-right">Still expected</th><th className="px-5 py-3 text-right"><span className="sr-only">Action</span></th></tr></thead>
        <tbody className="divide-y divide-slate-100">{lines.map((line) => <tr key={line.line_id}>
          <td className="px-5 py-4"><p className="font-semibold">{line.po_number}</p><p className="text-xs text-slate-500">{line.supplier_name}{line.expected_on ? ` · expected ${line.expected_on}` : ""}</p></td>
          <td className="px-4 py-4"><p className="font-medium">{line.material_name}</p><p className="text-xs text-slate-500">{line.material_code}</p></td>
          <td className="px-4 py-4">{line.warehouse_name}</td>
          <td className="px-4 py-4 text-right tabular-nums">{quantity.format(Number(line.ordered_quantity))} {line.unit_symbol}</td>
          <td className="px-4 py-4 text-right font-semibold tabular-nums">{quantity.format(Number(line.remaining_quantity))} {line.unit_symbol}</td>
          <td className="px-5 py-4"><div className="flex flex-wrap justify-end gap-2"><RecordCreateDialog title="Inspect supplier delivery" triggerLabel="Inspect" triggerVariant="outline"><p className="mb-4 text-sm text-slate-600">{line.po_number} · {line.material_name} → {line.warehouse_name}</p><PurchaseDeliveryInspectionForm orderId={line.order_id} lineId={line.line_id} remaining={Number(line.remaining_quantity)} unitSymbol={line.unit_symbol} idempotencyKey={randomUUID()} today={today} source="warehouse" /></RecordCreateDialog>{inspections.filter((item) => item.purchase_order_line_id === line.line_id).map((inspection) => <RecordCreateDialog key={inspection.id} title="Add accepted stock" triggerLabel={`Add ${inspection.accepted_quantity} ${line.unit_symbol}`} triggerVariant="outline"><p className="mb-4 text-sm text-slate-600">{inspection.delivery_reference} · accepted {inspection.accepted_quantity} of {inspection.delivered_quantity} {line.unit_symbol}{inspection.quality_note ? ` · ${inspection.quality_note}` : ""}</p><ReceiveWarehouseDeliveryForm orderId={line.order_id} lineId={line.line_id} remaining={Number(line.remaining_quantity)} unitSymbol={line.unit_symbol} idempotencyKey={randomUUID()} today={today} inspection={inspection} /></RecordCreateDialog>)}</div></td>
        </tr>)}</tbody></table>
    </DataTableShell>
    <HistoryPagination path="/purchase-orders/receive" page={page} count={lines[0]?.total_count ?? 0} filters={search ? { q: search } : {}} />
  </>;
}
