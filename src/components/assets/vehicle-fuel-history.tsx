import Link from "next/link";
import { HistoryPagination } from "@/components/ui/history-pagination";
import type { getVehicleFuelReceipts } from "@/lib/data/assets";

export function VehicleFuelHistory({ assetId, data }: { assetId: string; data: Awaited<ReturnType<typeof getVehicleFuelReceipts>> }) {
  return <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Diesel receipt history</h2><p className="mt-1 text-sm text-slate-500">Each approved receipt is charged once to its project. No material stock is added.</p></div>
    {!data.rows.length ? <p className="px-5 py-6 text-sm text-slate-500">No diesel receipts recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="bg-slate-50"><tr>{["Date", "Reference", "Project", "Amount", "Status"].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{data.rows.map((row) => <tr key={row.id}>
        <td className="px-5 py-3">{row.receipt_date}</td><td className="px-5 py-3"><Link className="text-cyan-700 underline" href={`/site-purchases/${row.id}`}>{row.purchase_number}</Link></td>
        <td className="px-5 py-3">{row.projectName}</td><td className="px-5 py-3 tabular-nums">{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(row.receipt_amount))}</td>
        <td className="px-5 py-3">{row.reversal ? `Expense reversed: ${row.reversal}` : row.status === "approved" ? "Expense posted" : row.status === "submitted" ? "Waiting Admin approval" : "Rejected"}</td>
      </tr>)}</tbody>
    </table></div>}
    <div className="p-4"><HistoryPagination path={`/vehicles/${assetId}`} parameter="fuelPage" page={data.page} count={data.count} /></div>
  </section>;
}
