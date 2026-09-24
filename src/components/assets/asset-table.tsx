import Link from "next/link";
import { AssetStatusBadge } from "@/components/assets/asset-status-badge";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import type { AssetView } from "@/lib/data/assets";
import type { AssetKind } from "@/types/database";

export function AssetTable({ assets, kind }: { assets: AssetView[]; kind: AssetKind }) {
  const base = kind === "equipment" ? "/equipment" : "/vehicles";
  return <DataTableShell empty={assets.length === 0 ? <EmptyState kind="results" title={`No ${kind} records found`} description={`Change the filters or register a new ${kind} record.`} /> : undefined}>
    <table className="w-full min-w-[1020px] text-left">
      <thead className={tableHeadClass}><tr>
        <th className="px-5 py-3">Code</th><th className="px-4 py-3">Asset</th>{kind === "equipment" && <th className="px-4 py-3">SKU</th>}<th className="px-4 py-3">Classification</th><th className="px-4 py-3">Brand / model</th><th className="px-4 py-3">Identifier</th><th className="px-4 py-3">Current location</th><th className="px-5 py-3 text-right">Status</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{assets.map((asset) => <tr key={asset.id} className="hover:bg-slate-50/60">
        <td className="px-5 py-4 text-xs font-semibold text-slate-600">{asset.code}</td>
        <td className="px-4 py-4"><Link className="text-sm font-semibold text-slate-800 hover:text-cyan-700" href={`${base}/${asset.id}`}>{asset.name}</Link></td>
        {kind === "equipment" && <td className="px-4 py-4 text-xs font-medium text-slate-600">{asset.equipment?.sku || "—"}</td>}
        <td className="px-4 py-4 text-xs text-slate-600">{asset.categoryName}{asset.equipment && <span className="block text-slate-400">{asset.equipment.equipment_type}</span>}</td>
        <td className="px-4 py-4 text-xs text-slate-600">{asset.brand}<span className="block text-slate-400">{asset.model}</span></td>
        <td className="px-4 py-4 text-xs font-medium text-slate-600">{asset.equipment?.serial_number ?? asset.vehicle?.plate_number}</td>
        <td className="px-4 py-4 text-xs text-slate-600">{asset.location?.displayName ?? "Unavailable"}<span className="block capitalize text-slate-400">{asset.location?.location_kind.replaceAll("_", " ")}</span></td>
        <td className="px-5 py-4 text-right"><AssetStatusBadge status={asset.status} /></td>
      </tr>)}</tbody>
    </table>
  </DataTableShell>;
}
