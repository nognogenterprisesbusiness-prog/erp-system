import Link from "next/link";
import { archiveAssetLocationAction } from "@/app/(workspace)/equipment/actions";
import { AssetLocationForm } from "@/components/assets/asset-location-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import { requireManager } from "@/lib/auth";
import { getAssetLocations } from "@/lib/data/assets";
export default async function AssetLocationsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) { await requireManager(); const params = await searchParams; const locations = await getAssetLocations(); const editing = params.edit ? locations.find((item) => item.id === params.edit && !item.inventory_location_id) : undefined; return <>
  <PageHeader eyebrow="Shared location directory" title="Asset locations" description="Warehouses and project sites are reused automatically; only maintenance and other authorized locations are managed here." action={<Button variant="outline" asChild><Link href="/equipment">Back to equipment</Link></Button>} />
  <div className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white"><AssetLocationForm location={editing} />{locations.length === 0 ? <EmptyState kind="items" title="No authorized locations yet" /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Location</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Address</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{locations.map((item) => <tr key={item.id}><td className="px-5 py-4 text-sm font-semibold">{item.displayName}</td><td className="px-4 py-4 text-xs capitalize text-slate-500">{item.location_kind.replaceAll("_", " ")}</td><td className="px-4 py-4 text-xs text-slate-500">{item.displayAddress}</td><td className="px-5 py-4"><div className="flex justify-end gap-1">{!item.inventory_location_id && <><RecordActionIcon label="Edit" name={item.displayName} href={`/equipment/locations?edit=${item.id}`} /><form action={archiveAssetLocationAction}><input type="hidden" name="id" value={item.id} /><RecordActionIcon label="Archive" name={item.displayName} submit destructive /></form></>}</div></td></tr>)}</tbody></table></div>}</div>
  </>; }
