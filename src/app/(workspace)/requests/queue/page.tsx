import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { RequestMovementForm } from "@/components/requests/request-movement-form";
import { requireUser } from "@/lib/auth";
import { getApprovedRequestQueue } from "@/lib/data/material-requests";

export default async function ApprovedRequestQueuePage({ searchParams }: { searchParams: Promise<{ page?: string; line?: string }> }) {
  const user = await requireUser();
  if (!user.canOperateInventory) notFound();
  const params = await searchParams;
  const result = await getApprovedRequestQueue(Number(params.page ?? 1));
  if (result.rows.length === 0 && result.page > 1) redirect("/requests/queue");
  const selected = result.rows.find((row) => row.request_line_id === params.line);
  return <>
    <PageHeader title="Warehouse dispatch queue" description="Approved materials awaiting dispatch from your assigned warehouses." action={<Button asChild variant="outline"><Link href="/inventory/transfers">All transfers</Link></Button>} />
    {selected && selected.reserved_quantity > 0 && <div className="mt-7"><p className="mb-3 text-sm text-slate-600">{selected.request_number} · {selected.material_code} · {selected.warehouse_name} → {selected.site_name}</p><RequestMovementForm mode="dispatch" id={selected.request_line_id} remaining={selected.reserved_quantity} unit={selected.unit_symbol} expanded /></div>}
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No approved lines waiting" description="Approved requests will appear here when your warehouse can dispatch them." /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} line{result.count === 1 ? "" : "s"} awaiting dispatch</span>}>
      <table className="w-full min-w-[1000px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <th className="px-5 py-3">Code</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Material</th><th className="px-4 py-3 text-right">Remaining</th><th className="px-4 py-3 text-right">Reserved for request</th><th className="px-4 py-3 text-right">Unallocated</th><th className="px-5 py-3 text-right">Action</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((row) => {
        const remaining = row.approved_quantity - row.dispatched_quantity;
        return <tr key={row.request_line_id} className="align-top hover:bg-slate-50/70">
          <td className="px-5 py-4 font-semibold text-slate-900">{row.request_number}</td>
          <td className="px-4 py-4"><p className="font-medium text-slate-800">{row.project_code} · {row.project_name}</p><p className="text-xs text-slate-500">{row.site_name}</p></td>
          <td className="px-4 py-4 text-slate-600">{row.warehouse_name}</td>
          <td className="px-4 py-4"><span className="font-medium text-slate-800">{row.material_name}</span><span className="block text-xs text-slate-500">{row.material_code}</span></td>
          <td className="px-4 py-4 text-right tabular-nums">{remaining} {row.unit_symbol}</td>
          <td className="px-4 py-4 text-right tabular-nums">{row.reserved_quantity} {row.unit_symbol}</td>
          <td className="px-4 py-4 text-right tabular-nums">{row.available_quantity} {row.unit_symbol}</td>
          <td className="px-5 py-4 text-right">{row.reserved_quantity > 0 ? <Button asChild variant="outline" size="sm"><Link href={`/requests/queue?page=${result.page}&line=${row.request_line_id}`}>Dispatch</Link></Button> : <span className="text-xs font-medium text-amber-700">Reservation unavailable</span>}</td>
        </tr>;
      })}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Dispatch queue pages" className="mt-4 flex items-center justify-end gap-2">
      {result.page > 1 ? <Button asChild variant="outline" size="sm"><Link href={`/requests/queue?page=${result.page - 1}`}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
      <span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>
      {result.page < result.pageCount ? <Button asChild variant="outline" size="sm"><Link href={`/requests/queue?page=${result.page + 1}`}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
    </nav>}
  </>;
}
