import { RecordActionIcon } from "@/components/ui/record-action-menu";

import { InventoryStockLocations } from "./inventory-stock-locations";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";

const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

export function InventoryBalanceCard({ name, photo, unit, active = true, location, locationDetail, stockLocations, available, minimum, href, onView, actions }: {
  name: string;
  sku: string;
  photo?: string | null;
  unit: string;
  active?: boolean;
  location: string;
  locationDetail?: string;
  stockLocations?: { id: string; name: string; onHand: number; available: number }[];
  onHand: number;
  reserved: number;
  available: number;
  minimum?: number;
  href?: string;
  onView?: () => void;
  actions?: React.ReactNode;
}) {
  const low = minimum === undefined ? available <= 0 : available <= minimum;
  const title = <span className="min-w-0"><span className="block break-words text-base font-semibold text-slate-900">{name}</span></span>;
  return <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><MaterialThumbnail name={name} photo={photo} large />{title}</div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${!active ? "bg-slate-100 text-slate-600" : low ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{!active ? "Inactive" : available <= 0 ? "Empty" : low ? "Low stock" : "In stock"}</span></div>
    <p className="mt-4 break-words text-sm text-slate-500" title={`${location}${locationDetail ? ` · ${locationDetail}` : ""}`}>{location}{locationDetail ? ` · ${locationDetail}` : ""}</p>
    {stockLocations && <InventoryStockLocations stocks={stockLocations} unit={unit} />}
    <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Available stock</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{quantity.format(available)} <span className="text-sm font-medium text-slate-500">{unit}</span></p></div>
    {(actions || href || onView) && <div className="mt-auto flex flex-wrap justify-end gap-2 pt-3">{(href || onView) && <RecordActionIcon label="View" name={name} href={href} onSelect={onView} />}{actions}</div>}
  </article>;
}
