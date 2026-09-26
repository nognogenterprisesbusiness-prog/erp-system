import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { SearchField } from "@/components/ui/search-field";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { WarehouseForm } from "@/components/warehouses/warehouse-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { requireUser } from "@/lib/auth";
import { getWarehouses } from "@/lib/data/warehouses";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { municipalityDisplay } from "@/lib/locations";
export default async function WarehousesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const query = typeof params.q === "string" ? params.q : ""; const status = params.status === "inactive" ? "inactive" : params.status === "active" ? "active" : "all";
  const [user, warehouses] = await Promise.all([requireUser(), getWarehouses({ query, status })]);
  return <><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Inventory foundation</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em]">Warehouses</h1><p className="mt-1 text-sm text-slate-500">Manage storage locations and responsible personnel.</p></div>{user.canManage && <RecordCreateDialog title="Add warehouse" initialOpen={params.create === "1"} closeHref={`/warehouses?${new URLSearchParams({ q: query, status })}`}><WarehouseForm /></RecordCreateDialog>}</div>
  <ListFilterBar><SearchField name="q" defaultValue={query} label="Search warehouses" placeholder="Search code, name, or address" /><SelectPicker name="status" label="Warehouse status" defaultValue={status} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} className="rounded-full" /></ListFilterBar>
  {warehouses.length === 0 ? <section className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={query || status !== "all" ? "results" : "items"} title={query || status !== "all" ? "No matching warehouses" : "No warehouses yet"} description={query || status !== "all" ? "Try changing the search or status." : "Assigned warehouse records will appear here."} /></section> : <section className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{warehouses.map((warehouse) => <article key={warehouse.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"><div className="relative grid h-32 place-items-center bg-slate-100 text-slate-400">{warehouse.photo_path ? <PhotoViewer src={recordPhotoUrl("warehouses", warehouse.id, warehouse.updated_at)} alt={`${warehouse.name} photo`} sizes="(max-width: 768px) 100vw, 33vw" /> : <HugeiconsIcon icon={WarehouseIcon} size={30} />}</div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-wide text-cyan-700">{warehouse.code}</p><h2 className="mt-1 text-lg font-semibold"><Link href={`/warehouses/${warehouse.id}`} className="hover:text-cyan-700">{warehouse.name}</Link></h2></div><Badge variant={warehouse.status === "active" ? "active" : "neutral"}>{warehouse.status}</Badge></div><p className="mt-4 text-sm text-slate-500">{municipalityDisplay(warehouse.municipality_code ?? undefined, warehouse.address)}</p><p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">{warehouse.contact_person || "No contact person"}{warehouse.contact_number ? ` · ${warehouse.contact_number}` : ""}</p></div></article>)}</section>}</>;
}
