import Link from "next/link";
import { Download04Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { InventoryLocationPicker } from "@/components/inventory/inventory-location-picker";
import { InventoryBalanceCard } from "@/components/inventory/inventory-balance-card";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { requireUser } from "@/lib/auth";
import { getInventoryBalances } from "@/lib/data/inventory";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const locationId = typeof params.location === "string" ? params.location : "";
  const lowStock = params.low === "true";
  const [user, data] = await Promise.all([requireUser(), getInventoryBalances({ query, locationId, lowStock, defaultToFirstLocation: true })]);
  const exportParams = new URLSearchParams();
  if (query) exportParams.set("q", query);
  if (data.selectedLocationId) exportParams.set("location", data.selectedLocationId);
  if (lowStock) exportParams.set("low", "true");
  const selectedLocationName = data.locations.find((item) => item.id === data.selectedLocationId)?.name;

  return <>
    <PageHeader eyebrow="Materials control" title="Inventory" description={selectedLocationName ? `${selectedLocationName} stock balances` : "Stock balances"} action={<div className="flex flex-wrap items-center gap-2">
      <InventoryLocationPicker locations={data.locations} value={data.selectedLocationId} />
      <Button variant="outline" asChild><Link href={`/inventory/export?${exportParams.toString()}`}><HugeiconsIcon icon={Download04Icon} size={17} />Export CSV</Link></Button>
      {user.canManage && <Button asChild><Link href="/materials/new"><HugeiconsIcon icon={PlusSignIcon} size={17} />Add material</Link></Button>}
      <RecordActionMenu name="Inventory tools" triggerLabel="More" actions={[
        { label: "Material catalog", href: "/materials" },
        { label: "Transaction history", href: "/inventory/transactions" },
        { label: "Transfers", href: "/inventory/transfers" },
        { label: "Stock counts", href: "/inventory/counts" },
        ...((user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role))) ? [{ label: "Record site use", href: "/inventory/consume" }] : []),
        ...(user.canManage ? [
          { label: "Opening values", href: "/inventory/opening-values" },
          { label: "Exception receipt", href: "/inventory/stock-in" },
          { label: "Direct stock-out", href: "/inventory/stock-out" },
        ] : []),
      ]} />
    </div>} />
    <form className="mt-6 flex flex-wrap items-center gap-3 bg-white p-4">
      <input type="hidden" name="location" value={data.selectedLocationId} />
      <SearchField name="q" defaultValue={query} label="Search materials" placeholder="Search materials" wrapperClassName="min-w-[220px] flex-1" />
      <label className="flex h-10 items-center gap-2 px-2 text-xs font-medium text-slate-600"><input type="checkbox" name="low" value="true" defaultChecked={lowStock} />Low stock</label>
      <Button variant="outline">Apply</Button>
    </form>
    {data.balances.length === 0 ? <section className="mt-5 rounded-xl border border-slate-200 bg-white"><EmptyState title="No inventory records found" description="Post stock in or change the current filters." /></section> : <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Material stock balances">{data.balances.map((item) => <InventoryBalanceCard key={item.id} name={item.material?.name ?? "Unavailable material"} sku={item.material?.code ?? "—"} photo={item.material?.photo_path ? recordPhotoUrl("materials", item.material_id) : undefined} unit={item.material?.unitSymbol ?? ""} location={item.location?.name ?? "Unavailable location"} locationDetail={item.location?.detail} onHand={item.quantity_on_hand} reserved={item.reserved_quantity} available={item.available_quantity} minimum={item.material?.minimum_stock_level} href={`/materials/${item.material_id}`} />)}</section>}
  </>;
}
