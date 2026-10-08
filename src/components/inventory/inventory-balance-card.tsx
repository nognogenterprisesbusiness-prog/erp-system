import { IntentLink as Link } from "@/components/layout/intent-link";

import { MaterialThumbnail } from "@/components/ui/material-thumbnail";

const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

export function InventoryBalanceCard({ name, sku, photo, unit, category, active = true, location, locationDetail, onHand, reserved, available, minimum, href, onView, actions }: {
  name: string;
  sku: string;
  photo?: string | null;
  unit: string;
  category?: string;
  active?: boolean;
  location: string;
  locationDetail?: string;
  onHand: number;
  reserved: number;
  available: number;
  minimum?: number;
  href?: string;
  onView?: () => void;
  actions?: React.ReactNode;
}) {
  const low = minimum === undefined ? available <= 0 : available <= minimum;
  const share = onHand > 0 ? Math.min(100, Math.max(0, available / onHand * 100)) : 0;
  const title = <span className="min-w-0"><span className="block truncate text-base font-semibold text-slate-900">{name}</span><span className="mt-0.5 block text-xs text-slate-500">{sku}</span></span>;
  return <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><MaterialThumbnail name={name} photo={photo} large />{href ? <Link href={href} className="min-w-0 hover:text-cyan-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{title}</Link> : onView ? <button type="button" onClick={onView} className="min-w-0 text-left hover:text-cyan-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{title}</button> : title}</div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${!active ? "bg-slate-100 text-slate-600" : low ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{!active ? "Inactive" : available <= 0 ? "Empty" : low ? "Low stock" : "In stock"}</span></div>
    {category && <p className="mt-3 text-xs text-slate-500">{category}</p>}
    <p className="mt-4 truncate text-xs text-slate-500" title={`${location}${locationDetail ? ` · ${locationDetail}` : ""}`}>{location}{locationDetail ? ` · ${locationDetail}` : ""}</p>
    <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Available stock</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{quantity.format(available)} <span className="text-sm font-medium text-slate-500">{unit}</span></p></div>
    <div className="mt-4 flex justify-between gap-2 text-xs"><span className="text-slate-500">Available share of on-hand</span><span className="font-semibold tabular-nums text-slate-800">{Math.round(share)}%</span></div>
    <div role="progressbar" aria-label={`${name} available share of on-hand`} aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${low ? "bg-amber-500" : "bg-cyan-700"}`} style={{ width: `${share}%` }} /></div>
    <dl className={`mt-4 grid gap-3 text-xs ${minimum === undefined ? "grid-cols-2" : "grid-cols-3"}`}><div><dt className="text-slate-500">On hand</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{quantity.format(onHand)} {unit}</dd></div><div><dt className="text-slate-500">Reserved</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{quantity.format(reserved)} {unit}</dd></div>{minimum !== undefined && <div><dt className="text-slate-500">Minimum</dt><dd className="mt-1 font-semibold tabular-nums text-slate-800">{quantity.format(minimum)} {unit}</dd></div>}</dl>
    {actions && <div className="mt-auto flex justify-end pt-3">{actions}</div>}
  </article>;
}
