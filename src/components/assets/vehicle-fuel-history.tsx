import { RecordViewLink } from "@/components/ui/record-view-link";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { displayDate, displayMoney } from "@/lib/ui/display";
import type { getVehicleFuelReceipts } from "@/lib/data/assets";

export function VehicleFuelHistory({ assetId, data }: { assetId: string; data: Awaited<ReturnType<typeof getVehicleFuelReceipts>> }) {
  return <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Project fuel receipts</h2><p className="mt-1 text-sm leading-6 text-slate-500">Fuel receipts linked to a project follow its approval and posting rules.</p></div>
    {!data.rows.length ? <p className="p-5 text-sm text-slate-500">{data.count ? "No receipts on this page." : "No project fuel receipts recorded yet."}</p> : <ul className="divide-y divide-slate-100">{data.rows.map(row => <li key={row.id} className="flex flex-col justify-between gap-3 p-5 sm:flex-row">
      <div><h3 className="text-sm font-semibold text-slate-900">{row.purchase_number}</h3><p className="mt-1 text-sm text-slate-600">{row.projectName}</p><p className="mt-1 text-xs text-slate-500">{displayDate(row.receipt_date)} · {row.reversal ? `Expense reversed: ${row.reversal}` : row.status === "approved" ? "Expense posted" : row.status === "submitted" ? "Waiting for approval" : "Rejected"}</p></div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end"><p className="text-sm font-semibold tabular-nums">{row.receipt_amount === null ? "Not recorded" : displayMoney(row.receipt_amount)}</p><RecordViewLink href={`/site-purchases/${row.id}`} name={`fuel receipt ${row.purchase_number}`} /></div>
    </li>)}</ul>}
    {(data.count > 20 || data.page > 1) && <div className="border-t border-slate-100 px-5 pb-4"><HistoryPagination replace path={`/vehicles/${assetId}`} parameter="fuelPage" page={data.page} count={data.count} filters={{ section: "project-use" }} /></div>}
  </section>;
}
