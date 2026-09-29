import { Suspense } from "react";
import { WarehouseListControls, warehouseListHeader } from "@/components/warehouses/warehouse-list-controls";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { WarehouseForm } from "@/components/warehouses/warehouse-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { RecordThumbnail } from "@/components/ui/record-thumbnail";
import { RecordListSkeleton, RecordListView } from "@/components/ui/record-list-view";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getWarehouses } from "@/lib/data/warehouses";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { municipalityDisplay } from "@/lib/locations";
export default async function WarehousesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const query = typeof params.q === "string" ? params.q : ""; const status = params.status === "inactive" ? "inactive" : params.status === "active" ? "active" : "all";
  const user = await requireUser();
  return <><PageHeader {...warehouseListHeader} action={user.canManage && <RecordCreateDialog title="Add warehouse" initialOpen={params.create === "1"} closeHref={`/warehouses?${new URLSearchParams({ q: query, status })}`}><WarehouseForm /></RecordCreateDialog>} />
  <WarehouseListControls query={query} status={status} />
  <Suspense key={`${query}:${status}`} fallback={<RecordListSkeleton storageKey="warehouses" columns={5} />}><WarehouseResults query={query} status={status} /></Suspense></>;
}

async function WarehouseResults({ query, status }: { query: string; status: "all" | "active" | "inactive" }) {
  const warehouses = await getWarehouses({ query, status });
  return <>
  <RecordListView storageKey="warehouses" title="Warehouses" columns={["Warehouse", "Address", "Contact person", "Contact number", "Status"]} rows={warehouses.map((warehouse) => ({ id: warehouse.id, cells: [<div key="record" className="flex min-w-56 items-center gap-3"><RecordThumbnail icon={WarehouseIcon} name={warehouse.name} photo={warehouse.photo_path ? recordPhotoUrl("warehouses", warehouse.id, warehouse.updated_at) : null} /><Link key="warehouse" href={`/warehouses/${warehouse.id}`} className="font-semibold hover:text-cyan-700">{warehouse.code} · {warehouse.name}</Link></div>, municipalityDisplay(warehouse.municipality_code ?? undefined, warehouse.address), warehouse.contact_person || "—", warehouse.contact_number || "—", warehouse.status] }))}>
  {warehouses.length === 0 ? <section className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={query || status !== "all" ? "results" : "items"} title={query || status !== "all" ? "No matching warehouses" : "No warehouses yet"} description={query || status !== "all" ? "Try changing the search or status." : "Assigned warehouse records will appear here."} /></section> : <section className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{warehouses.map((warehouse) => <article key={warehouse.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"><div className="relative grid h-32 place-items-center bg-slate-100 text-slate-400">{warehouse.photo_path ? <PhotoViewer src={recordPhotoUrl("warehouses", warehouse.id, warehouse.updated_at)} alt={`${warehouse.name} photo`} sizes="(max-width: 768px) 100vw, 33vw" /> : <HugeiconsIcon icon={WarehouseIcon} size={30} />}</div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-wide text-cyan-700">{warehouse.code}</p><h2 className="mt-1 text-lg font-semibold"><Link href={`/warehouses/${warehouse.id}`} className="hover:text-cyan-700">{warehouse.name}</Link></h2></div><Badge variant={warehouse.status === "active" ? "active" : "neutral"}>{warehouse.status}</Badge></div><p className="mt-4 text-sm text-slate-500">{municipalityDisplay(warehouse.municipality_code ?? undefined, warehouse.address)}</p><p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">{warehouse.contact_person || "No contact person"}{warehouse.contact_number ? ` · ${warehouse.contact_number}` : ""}</p></div></article>)}</section>}</RecordListView></>;
}
