import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ReceiveWarehouseDeliveryForm } from "@/components/purchase-orders/purchase-order-forms";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

// Deliveries expected at the warehouses this user is assigned to. Prices stay hidden;
// the stock is valued at the PO price that Admin issued.
export default async function ReceiveDeliveriesPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const user = await requireUser();
  if (!user.canOperateInventory) notFound();
  const posted = (await searchParams).posted === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_warehouse_receivable_po_lines");
  if (error) throw new Error(`Unable to load expected deliveries: ${error.message}`, { cause: error });
  const lines = data ?? [];
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <>
    <PageHeader eyebrow="Warehouse" title="Receive deliveries" description="Count what arrived for a purchase order issued by an administrator and add it to your warehouse stock. The price comes from the purchase order." />
    {posted && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Delivery received. The stock is now in the warehouse inventory.</p>}
    <DataTableShell empty={lines.length === 0 ? <EmptyState kind="items" title="No deliveries waiting" description="Purchase orders for your warehouses appear here once an administrator issues them." /> : undefined} footer={lines.length ? <span className="text-xs text-slate-500">{lines.length} material line{lines.length === 1 ? "" : "s"} waiting</span> : undefined}>
      <table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Purchase order</th><th className="px-4 py-3">Material</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3 text-right">Ordered</th><th className="px-4 py-3 text-right">Still expected</th><th className="px-5 py-3 text-right"><span className="sr-only">Action</span></th></tr></thead>
        <tbody className="divide-y divide-slate-100">{lines.map((line) => <tr key={line.line_id}>
          <td className="px-5 py-4"><p className="font-semibold">{line.po_number}</p><p className="text-xs text-slate-500">{line.supplier_name}{line.expected_on ? ` · expected ${line.expected_on}` : ""}</p></td>
          <td className="px-4 py-4"><p className="font-medium">{line.material_name}</p><p className="text-xs text-slate-500">{line.material_code}</p></td>
          <td className="px-4 py-4">{line.warehouse_name}</td>
          <td className="px-4 py-4 text-right tabular-nums">{quantity.format(Number(line.ordered_quantity))} {line.unit_symbol}</td>
          <td className="px-4 py-4 text-right font-semibold tabular-nums">{quantity.format(Number(line.remaining_quantity))} {line.unit_symbol}</td>
          <td className="px-5 py-4 text-right"><RecordCreateDialog title="Receive delivery" triggerLabel="Receive" triggerVariant="outline"><p className="mb-4 text-sm text-slate-600">{line.po_number} · {line.material_name} → {line.warehouse_name}</p><ReceiveWarehouseDeliveryForm orderId={line.order_id} lineId={line.line_id} remaining={Number(line.remaining_quantity)} unitSymbol={line.unit_symbol} idempotencyKey={randomUUID()} today={today} /></RecordCreateDialog></td>
        </tr>)}</tbody></table>
    </DataTableShell>
  </>;
}
