import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireProcurementViewer } from "@/lib/auth";
import { todayInManila } from "@/lib/date";
import { getSupplierQuotation } from "@/lib/data/procurement-stages";
import { createClient } from "@/lib/supabase/server";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export default async function SupplierQuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireProcurementViewer();
  const { quote, lines } = await getSupplierQuotation((await params).id);
  const supabase = await createClient();
  const [supplier, materials, units] = await Promise.all([
    supabase.from("suppliers").select("supplier_name").eq("id", quote.supplier_id).single(),
    supabase.from("materials").select("id,code,name").in("id", lines.map((line) => line.material_id)),
    supabase.from("units_of_measure").select("id,symbol").in("id", [...new Set(lines.map((line) => line.unit_of_measure_id))]),
  ]);
  if (supplier.error || materials.error || units.error) throw new Error("Unable to load quotation details.");
  const names = new Map((materials.data ?? []).map((material) => [material.id, material]));
  const symbols = new Map((units.data ?? []).map((unit) => [unit.id, unit.symbol]));
  const today = todayInManila();
  const usable = user.canManage && quote.quoted_on <= today && (!quote.valid_until || quote.valid_until >= today);
  return <>
    <PageHeader eyebrow="Supplier quotations" title={quote.reference} description={`${supplier.data.supplier_name} · quoted ${quote.quoted_on}${quote.valid_until ? ` · valid until ${quote.valid_until}` : ""}`}
      action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/purchase-orders/quotations">All quotations</Link></Button>{usable && <Button asChild><Link href={`/purchase-orders?create=1&quotation=${quote.id}`}>Use for purchase</Link></Button>}</div>} />
    {quote.notes && <p className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{quote.notes}</p>}
    <DataTableShell footer={<span className="text-sm font-semibold">Quoted total {money.format(Number(quote.total))}</span>}>
      <table className="w-full min-w-[600px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Material</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Unit price</th><th className="px-5 py-3">Line total</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{lines.map((line) => <tr key={line.material_id}><td className="px-5 py-4"><p className="font-medium">{names.get(line.material_id)?.name ?? "Unavailable material"}</p><p className="text-xs text-slate-500">{names.get(line.material_id)?.code}</p></td><td className="px-4 py-4 tabular-nums">{line.quantity} {symbols.get(line.unit_of_measure_id) ?? ""}</td><td className="px-4 py-4 tabular-nums">{money.format(Number(line.unit_price))}</td><td className="px-5 py-4 font-semibold tabular-nums">{money.format(Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100)}</td></tr>)}</tbody>
      </table>
    </DataTableShell>
    <p className="mt-4 text-sm text-slate-600">This is the supplier&apos;s recorded offer. Only issuing a purchase order updates purchased-price history; warehouse stock changes after inspection and receipt.</p>
  </>;
}
