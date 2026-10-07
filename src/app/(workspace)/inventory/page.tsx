import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { pageNumber } from "@/lib/data/pagination";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Download04Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { InventoryLocationPicker } from "@/components/inventory/inventory-location-picker";
import { RecordThumbnail } from "@/components/ui/record-thumbnail";
import { RecordListView } from "@/components/ui/record-list-view";
import { InventoryBalanceCard } from "@/components/inventory/inventory-balance-card";
import { MaterialForm } from "@/components/materials/material-form";
import { InventoryMovementForm } from "@/components/inventory/inventory-movement-form";
import { SiteConsumptionForm } from "@/components/inventory/site-consumption-form";
import { uuidSchema } from "@nognog/domain";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { requireUser } from "@/lib/auth";
import { getInventoryBalances, getMaterialReferences, getInventoryOptions, getSiteConsumptionOptions } from "@/lib/data/inventory";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { InventoryTypeTabs } from "@/components/inventory/inventory-type-tabs";
import { AssetRegistryPage } from "@/components/assets/asset-registry-page";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.type === "equipment" || params.type === "vehicle") {
    return <AssetRegistryPage kind={params.type} searchParams={Promise.resolve(params)} inventoryMode />;
  }
  const query = typeof params.q === "string" ? params.q : "";
  const locationId = typeof params.location === "string" ? params.location : "";
  const lowStock = params.low === "true";
  const page = pageNumber(params.page);
  const user = await requireUser();
  const data = await getInventoryBalances({ query, locationId, lowStock, defaultToFirstLocation: true, page, includeValues: user.canViewLaborRates });
  const references = user.canManage ? await getMaterialReferences() : null;
  const movement = user.canManage && (params.action === "stock-in" || params.action === "stock-out") ? params.action : undefined;
  const movementOptions = movement ? await getInventoryOptions() : null;
  const usageOptions = params.action === "use" && (user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role))) ? await getSiteConsumptionOptions() : null;
  const material = uuidSchema.safeParse(params.material);
  const project = uuidSchema.safeParse(params.project);
  const projectId = project.success && usageOptions?.projects.some((item) => item.id === project.data) ? project.data : "";
  const exportParams = new URLSearchParams();
  if (query) exportParams.set("q", query);
  if (data.selectedLocationId) exportParams.set("location", data.selectedLocationId);
  if (lowStock) exportParams.set("low", "true");
  const selectedLocationName = data.locations.find((item) => item.id === data.selectedLocationId)?.name;

  return <>
    <PageHeader title="Inventory" description={selectedLocationName ? `${selectedLocationName} stock balances` : "Stock balances"} action={<div className="flex flex-wrap items-center gap-2">
      <InventoryLocationPicker locations={data.locations} value={data.selectedLocationId} />
      <Button variant="outline" asChild><a href={`/inventory/export?${exportParams.toString()}`}><HugeiconsIcon icon={Download04Icon} size={17} />Export CSV</a></Button>
      {user.canManage && references && <RecordCreateDialog title="Add material"><MaterialForm {...references} /></RecordCreateDialog>}
      <RecordActionMenu name="Inventory" triggerLabel="Stock actions" actions={[
        ...(user.canManage ? [{ label: "Stock in", href: `/inventory?${exportParams}&action=stock-in` }, { label: "Stock out", href: `/inventory?${exportParams}&action=stock-out` }] : []),
        { label: "Transfer", href: "/inventory/transfers" },
        { label: "Transaction history", href: "/inventory/transactions" },
      ]} />
    </div>} />
    <InventoryTypeTabs active="materials" />
    {movement && movementOptions && <RecordCreateDialog title={movement === "stock-in" ? "Stock in" : "Stock out"} initialOpen hideTrigger closeHref={`/inventory?${exportParams}`}><p className="mb-4 text-sm text-slate-500">{movement === "stock-in" ? "Supplier deliveries should be received through Purchases. This records other receipts with a verified cost." : "Project deliveries use approved requests. This records admin-authorized non-project stock removal."}</p><InventoryMovementForm mode={movement} {...movementOptions} initialMaterialId={material.success ? material.data : ""} />{movement === "stock-in" && <details className="mt-4 text-sm text-slate-500"><summary className="cursor-pointer">Existing stock setup</summary><Link href="/inventory/opening-values" className="mt-2 block font-medium text-cyan-700">Verify starting values without receiving stock again</Link></details>}</RecordCreateDialog>}
    {usageOptions && <RecordCreateDialog title="Record material use" initialOpen hideTrigger closeHref={projectId ? `/projects/${projectId}?tab=materials` : `/inventory?${exportParams}`}>{usageOptions.sites.length ? <SiteConsumptionForm {...usageOptions} initialMaterialId={material.success ? material.data : ""} initialProjectId={projectId} /> : <EmptyState title="No assigned sites available" description="Choose an active assigned project with an inventory site." />}</RecordCreateDialog>}
    <ListFilterBar viewKey="inventory" viewTitle="Inventory">
      <input type="hidden" name="location" value={data.selectedLocationId} />
      <SearchField name="q" defaultValue={query} label="Search materials" placeholder="Search materials" />
      <label className="group relative inline-flex h-9 cursor-pointer items-center">
        <input className="peer sr-only" type="checkbox" name="low" value="true" defaultChecked={lowStock} />
        <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 peer-checked:border-[#07152d] peer-checked:bg-[#07152d] peer-checked:text-white peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-600 peer-focus-visible:ring-offset-2">Low stock</span>
      </label>
      <Button size="sm" variant="outline" asChild><Link href="/materials">All materials</Link></Button>
    </ListFilterBar>
    <RecordListView storageKey="inventory" title="Inventory" columns={["Material", "Stock location", "On hand", "Reserved", "Available", "Minimum", ...(user.canViewLaborRates ? ["Stock value"] : [])]} rows={data.balances.map((item) => ({ id: item.id, cells: [
      <div key="record" className="flex min-w-56 items-center gap-3"><RecordThumbnail icon={PackageIcon} name={item.material?.name ?? "Material"} photo={item.material?.photo_path ? recordPhotoUrl("materials", item.material_id) : null} /><Link key="material" href={`/materials/${item.material_id}`} className="font-semibold hover:text-cyan-700">{item.material?.code} · {item.material?.name ?? "Unavailable material"}</Link></div>,
      item.location?.name ?? "Unavailable location",
      ...[item.quantity_on_hand, item.reserved_quantity, item.available_quantity, item.material?.minimum_stock_level ?? 0].map((value) => `${Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 })} ${item.material?.unitSymbol ?? ""}`),
      ...(user.canViewLaborRates ? [item.stockValue == null ? "Not valued" : Number(item.stockValue).toLocaleString("en-PH", { style: "currency", currency: "PHP" })] : []),
    ] }))}>
    {data.balances.length === 0 ? <section className="mt-5 rounded-xl border border-slate-200 bg-white"><EmptyState title="No inventory records found" description="Post stock in or change the current filters." /></section> : <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Material stock balances">{data.balances.map((item) => <InventoryBalanceCard key={item.id} name={item.material?.name ?? "Unavailable material"} sku={item.material?.code ?? "—"} photo={item.material?.photo_path ? recordPhotoUrl("materials", item.material_id) : undefined} unit={item.material?.unitSymbol ?? ""} location={item.location?.name ?? "Unavailable location"} locationDetail={item.location?.detail} onHand={item.quantity_on_hand} reserved={item.reserved_quantity} available={item.available_quantity} minimum={item.material?.minimum_stock_level} href={`/materials/${item.material_id}`} />)}</section>}
    </RecordListView>
    <HistoryPagination path="/inventory" page={page} count={data.count} pageSize={24} filters={{ q: query, location: data.selectedLocationId, low: String(lowStock) }} />
  </>;
}
