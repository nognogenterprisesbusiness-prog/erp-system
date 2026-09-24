import Link from "next/link";
import { Download04Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { InventoryLocationPicker } from "@/components/inventory/inventory-location-picker";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { getInventoryBalances } from "@/lib/data/inventory";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const locationId = typeof params.location === "string" ? params.location : "";
  const lowStock = params.low === "true";
  const [user, data] = await Promise.all([requireUser(), getInventoryBalances({ query, locationId, lowStock, defaultToFirstLocation: true })]);
  const lowCount = data.balances.filter((item) => item.available_quantity <= (item.material?.minimum_stock_level ?? 0)).length;
  const exportParams = new URLSearchParams();
  if (query) exportParams.set("q", query);
  if (data.selectedLocationId) exportParams.set("location", data.selectedLocationId);
  if (lowStock) exportParams.set("low", "true");
  const selectedLocationName = data.locations.find((item) => item.id === data.selectedLocationId)?.name;

  return <>
    <InventoryLocationPicker locations={data.locations} value={data.selectedLocationId} />
    <PageHeader eyebrow="Materials control" title="Inventory" description={selectedLocationName ? `${selectedLocationName} stock balances` : "Stock balances"} action={<div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild><Link href={`/inventory/export?${exportParams.toString()}`}><HugeiconsIcon icon={Download04Icon} size={17} />Export CSV</Link></Button>
      <Button variant="outline" asChild><Link href="/inventory/transactions">History</Link></Button>
      <Button variant="outline" asChild><Link href="/inventory/transfers">Transfers</Link></Button>
      {(user.canManage || user.roles.some((role) => ["project_manager", "engineer", "foreman"].includes(role))) && <Button variant="outline" asChild><Link href="/inventory/consume">Record site use</Link></Button>}
      {user.canManage && <Button variant="outline" asChild><Link href="/inventory/opening-values">Opening values</Link></Button>}
      {user.canManage && <Button variant="outline" asChild><Link href="/materials/new"><HugeiconsIcon icon={PlusSignIcon} size={17} />Add material</Link></Button>}
      {user.canManage && <Button asChild><Link href="/inventory/stock-in">Stock in</Link></Button>}
    </div>} />
    <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-slate-200 bg-white px-5 py-4 text-sm">
      <span><strong className="mr-1 text-lg tabular-nums">{data.balances.length}</strong><span className="text-slate-500">stock records</span></span>
      <span><strong className="mr-1 text-lg tabular-nums text-amber-700">{lowCount}</strong><span className="text-slate-500">at or below minimum</span></span>
      {user.canManage && <Link href="/inventory/stock-out" className="ml-auto text-xs font-semibold text-cyan-700 hover:text-cyan-900">Direct stock-out exception →</Link>}
    </div>
    <form className="mt-5 flex flex-wrap items-center gap-3 bg-white p-4">
      <input type="hidden" name="location" value={data.selectedLocationId} />
      <SearchField name="q" defaultValue={query} label="Search materials" placeholder="Search materials" wrapperClassName="min-w-[220px] flex-1" />
      <label className="flex h-10 items-center gap-2 px-2 text-xs font-medium text-slate-600"><input type="checkbox" name="low" value="true" defaultChecked={lowStock} />Low stock</label>
      <Button variant="outline">Apply</Button>
    </form>
    <DataTableShell empty={data.balances.length === 0 ? <EmptyState title="No inventory records found" description="Post stock in or change the current filters." /> : undefined}>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className={tableHeadClass}><tr>
          <th scope="col" className="px-5 py-3">SKU</th><th scope="col" className="px-4 py-3">Material</th><th scope="col" className="px-4 py-3 text-right">On hand</th><th scope="col" className="px-4 py-3 text-right">Reserved</th><th scope="col" className="px-4 py-3 text-right">Available</th><th scope="col" className="px-5 py-3 text-right">Level</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{data.balances.map((item) => {
          const low = item.available_quantity <= (item.material?.minimum_stock_level ?? 0);
          return <tr key={item.id} className="hover:bg-slate-50/70">
            <td className="px-5 py-4 text-xs font-semibold text-slate-600">{item.material?.code ?? "—"}</td>
            <td className="px-4 py-4"><Link href={`/materials/${item.material_id}`} className="font-semibold text-slate-800 hover:text-cyan-700">{item.material?.name ?? "Unavailable material"}</Link></td>
            <td className="px-4 py-4 text-right tabular-nums">{item.quantity_on_hand} {item.material?.unitSymbol}</td>
            <td className="px-4 py-4 text-right tabular-nums">{item.reserved_quantity} {item.material?.unitSymbol}</td>
            <td className="px-4 py-4 text-right font-semibold tabular-nums">{item.available_quantity} {item.material?.unitSymbol}</td>
            <td className={`px-5 py-4 text-right text-xs font-semibold ${low ? "text-amber-700" : "text-emerald-700"}`}>{low ? "Low" : "Available"}</td>
          </tr>;
        })}</tbody>
      </table>
    </DataTableShell>
  </>;
}
