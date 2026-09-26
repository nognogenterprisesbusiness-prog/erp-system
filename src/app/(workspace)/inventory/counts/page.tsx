import { IntentLink as Link } from "@/components/layout/intent-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { InventoryLocationPicker } from "@/components/inventory/inventory-location-picker";
import { RecordStockCountForm, StockCountDecisionForm } from "@/components/inventory/stock-count-forms";
import { requireUser } from "@/lib/auth";
import { getInventoryBalances } from "@/lib/data/inventory";
import { getStockCounts } from "@/lib/data/stock-counts";

export default async function StockCountsPage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const user = await requireUser();
  const { location } = await searchParams;
  const inventory = await getInventoryBalances({ locationId: location, defaultToFirstLocation: true });
  const selected = inventory.locations.find((item) => item.id === inventory.selectedLocationId);
  const counts = selected ? await getStockCounts(selected.id) : [];
  const materialMap = new Map(inventory.materials.map((material) => [material.id, material]));
  const pendingMaterialIds = new Set(counts.filter((count) => count.status === "pending").map((count) => count.material_id));
  const canCount = user.canManage || (selected?.location_type === "warehouse" && user.roles.includes("warehouse_staff"))
    || (selected?.location_type === "project_site" && user.roles.some((role) => ["engineer", "foreman"].includes(role)));
  return <>
    <PageHeader title="Stock counts" description="Record physical quantities; an administrator reviews a shortage before stock and value change." action={<Button variant="outline" asChild><Link href="/inventory">Back to inventory</Link></Button>} />
    <InventoryLocationPicker locations={inventory.locations} value={inventory.selectedLocationId} />
    <section className="mt-7"><h2 className="text-base font-semibold">{selected?.name ?? "Location"} · current stock</h2>
      <DataTableShell empty={inventory.balances.length === 0 ? <EmptyState title="No stock to count" description="Choose a location with verified stock balances." /> : undefined}>
        <table className="w-full min-w-[650px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">SKU / material</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reserved</th><th className="px-5 py-3">Physical count</th></tr></thead><tbody className="divide-y divide-slate-100">{inventory.balances.map((row) => <tr key={row.id}><td className="px-5 py-4 font-medium">{row.material?.code} · {row.material?.name}</td><td className="px-4 py-4 text-right tabular-nums">{row.quantity_on_hand} {row.material?.unitSymbol}</td><td className="px-4 py-4 text-right tabular-nums">{row.reserved_quantity}</td><td className="px-5 py-4">{pendingMaterialIds.has(row.material_id) ? <span className="text-xs text-amber-700">Pending review</span> : canCount ? <details><summary className="cursor-pointer text-sm font-medium text-cyan-700">Record count</summary><RecordStockCountForm materialId={row.material_id} locationId={row.inventory_location_id} unitSymbol={row.material?.unitSymbol ?? ""} onHand={row.quantity_on_hand} /></details> : "—"}</td></tr>)}</tbody></table>
      </DataTableShell></section>
    <section className="mt-8"><h2 className="text-base font-semibold">Count history</h2><DataTableShell empty={counts.length === 0 ? <EmptyState title="No counts yet" description="Recorded physical counts and decisions appear here." /> : undefined}>
      <table className="w-full min-w-[720px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Material / date</th><th className="px-4 py-3 text-right">Expected</th><th className="px-4 py-3 text-right">Counted</th><th className="px-4 py-3">Status</th><th className="px-5 py-3">Decision</th></tr></thead><tbody className="divide-y divide-slate-100">{counts.map((row) => <tr key={row.id}><td className="px-5 py-4"><p className="font-medium">{materialMap.get(row.material_id)?.code ?? "SKU"} · {materialMap.get(row.material_id)?.name ?? "Material"}</p><p className="text-xs text-slate-500">{new Date(row.counted_at).toLocaleDateString("en-PH")} · {row.reason_type.replaceAll("_", " ")} · {row.reason}</p></td><td className="px-4 py-4 text-right tabular-nums">{row.expected_quantity}</td><td className="px-4 py-4 text-right tabular-nums">{row.counted_quantity}</td><td className="px-4 py-4"><Badge variant={row.status === "approved" && !row.reversed ? "active" : row.status === "pending" ? "review" : "neutral"}>{row.reversed ? "Reversed" : row.status}</Badge></td><td className="px-5 py-4">{row.status === "pending" && user.canManage ? <StockCountDecisionForm countId={row.id} surplus={row.counted_quantity > row.expected_quantity} /> : <span className="text-xs text-slate-500">{row.reversed ? "Loss reversal posted" : row.decision_note ?? (row.transaction_id ? "Valued loss posted" : "—")}</span>}</td></tr>)}</tbody></table>
    </DataTableShell></section>
  </>;
}
