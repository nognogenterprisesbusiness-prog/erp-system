import { IntentLink as Link } from "@/components/layout/intent-link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { OpeningValueForm } from "@/components/inventory/opening-value-form";
import { LegacyTransitValueForm } from "@/components/inventory/legacy-transit-value-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getUnvaluedLegacyTransitQueue, getUnvaluedOpeningStock } from "@/lib/data/inventory";

export default async function OpeningValuesPage() {
  const user = await requireUser();
  if (!user.canManage) redirect("/inventory");
  const [rows, transit] = await Promise.all([getUnvaluedOpeningStock(), getUnvaluedLegacyTransitQueue()]);
  return <>
    <PageHeader title="Verify opening stock values" description="Enter the value of stock that was already on hand before you started using the system." action={<Button asChild variant="outline"><Link href="/inventory">Back to inventory</Link></Button>} />
    {transit.length > 0 && <section className="mt-7"><h2 className="text-lg font-semibold text-slate-900">Legacy in-transit stock</h2><p className="mt-1 text-xs text-slate-500">Enter the value of stock that was already in transit before you started using the system.</p><div className="mt-4 space-y-4">{transit.map((item) => <article key={item.transfer_item_id} className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold text-slate-900">{item.transfer_number} · {item.material_code} · {item.material_name}</h3><p className="mt-1 text-xs text-slate-500">{item.source_name} → {item.destination_name} · {item.dispatched_quantity} dispatched · {item.received_quantity} already received · {item.remaining_quantity} in transit</p><div className="mt-4"><LegacyTransitValueForm transferItemId={item.transfer_item_id} idempotencyKey={randomUUID()} receivedQuantity={item.received_quantity} /></div></article>)}</div></section>}
    <h2 className="mt-8 text-lg font-semibold text-slate-900">Location opening values</h2>
    <div className="mt-7 space-y-4">
      {rows.length === 0 ? <section className="rounded-xl border border-slate-200 bg-white"><EmptyState kind="items" title="No opening values need review" /></section>
        : rows.map((row) => <section key={row.material_id + row.inventory_location_id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold">{row.material?.code} · {row.material?.name}</h2><p className="mt-1 text-xs text-slate-500">{row.location?.name}</p></div>
            <p className="text-sm font-semibold tabular-nums">{row.quantity_on_hand} {row.material?.unitSymbol} on hand</p>
          </div>
          <OpeningValueForm materialId={row.material_id} locationId={row.inventory_location_id} quantity={row.quantity_on_hand} />
        </section>)}
    </div>
  </>;
}
