import Link from "next/link";
import { MaterialRequestDecision } from "@/components/requests/material-request-decision";
import { MaterialRequestCancellation } from "@/components/requests/material-request-cancellation";
import { RequestMovementForm } from "@/components/requests/request-movement-form";
import { TransferVarianceForm } from "@/components/inventory/transfer-variance-form";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { getMaterialRequest } from "@/lib/data/material-requests";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";

const labels = { submitted: "For approval", approved: "Approved", partially_approved: "Partially approved", rejected: "Rejected", cancelled: "Cancelled" };

export default async function MaterialRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data] = await Promise.all([requireUser(), getMaterialRequest(id)]);
  const { request, project, site, warehouse, lines, events, fulfillmentEvents, reservationEvents, varianceEvents, dispatches } = data;
  const canDecide = request.status === "submitted" && (user.canManage || (user.roles.includes("engineer") && request.requested_by !== user.userId));
  const canCancel = (request.status === "submitted" || request.status === "approved" || request.status === "partially_approved")
    && dispatches.length === 0 && (user.canManage || request.requested_by === user.userId);
  const canReceive = user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role));
  const totals = new Map(lines.map((line) => [line.id, dispatches.filter((dispatch) => dispatch.request_line_id === line.id).reduce((total, dispatch) => ({ dispatched: total.dispatched + dispatch.item.dispatched_quantity, received: total.received + dispatch.item.received_quantity, variance: total.variance + dispatch.item.variance_quantity }), { dispatched: 0, received: 0, variance: 0 })]));
  const history = [
    ...events.map((event) => ({ id: event.id, event: labels[event.event_type], material: "—", quantity: "—", actor: event.actorName, detail: "", occurredAt: event.occurred_at })),
    ...fulfillmentEvents.map((event) => ({ id: event.id, event: event.event_type === "dispatched" ? "Dispatched" : "Received", material: event.materialName, quantity: String(event.quantity), actor: event.actorName, detail: "", occurredAt: event.occurred_at })),
    ...reservationEvents.map((event) => ({ id: event.id, event: event.event_type === "reserved" ? "Reserved" : event.event_type === "released" ? "Released reservation" : "Used reservation", material: event.materialName, quantity: String(event.quantity), actor: event.actorName, detail: "", occurredAt: event.occurred_at })),
    ...varianceEvents.map((event) => ({ id: event.id, event: "Variance approved", material: event.materialName, quantity: String(event.quantity), actor: event.actorName, detail: event.reason, occurredAt: event.approved_at })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return <>
    <PageHeader title={request.request_number} description={`${project.code} · ${project.name} · ${site.name}`} action={<Button asChild variant="outline"><Link href="/requests">All requests</Link></Button>} />
    <div className="mt-7 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><p className="text-xs font-medium text-slate-500">Status</p><p className="mt-1 font-semibold text-slate-900">{labels[request.status]}</p></div>
      <div><p className="text-xs font-medium text-slate-500">Warehouse</p><p className="mt-1 font-semibold text-slate-900">{warehouse.name}</p></div>
      <div><p className="text-xs font-medium text-slate-500">Needed by</p><p className="mt-1 font-semibold text-slate-900">{request.required_date}</p></div>
      <div><p className="text-xs font-medium text-slate-500">Requested by</p><p className="mt-1 font-semibold text-slate-900">{data.requesterName}</p></div>
      <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs font-medium text-slate-500">Purpose</p><p className="mt-1 text-slate-800">{request.purpose}</p></div>
      {request.decision_reason && <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs font-medium text-slate-500">Decision reason</p><p className="mt-1 text-slate-800">{request.decision_reason}</p></div>}
    </div>
    <h2 className="mt-8 text-lg font-semibold text-slate-900">Materials</h2>
    <DataTableShell><table className="w-full min-w-[900px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">SKU</th><th className="px-4 py-3">Material</th><th className="px-4 py-3 text-right">Requested</th><th className="px-4 py-3 text-right">Approved</th><th className="px-4 py-3 text-right">Reserved</th><th className="px-4 py-3 text-right">Dispatched</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Approved variance</th><th className="px-5 py-3 text-right">In transit</th></tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line) => { const total = totals.get(line.id)!; return <tr key={line.id}><td className="px-5 py-4 text-xs font-semibold text-slate-600">{line.material?.code ?? "—"}</td><td className="px-4 py-4"><div className="flex items-center gap-3"><MaterialThumbnail name={line.material?.name ?? "Material"} photo={line.material?.photo_path ? recordPhotoUrl("materials", line.material.id) : null} /><span className="font-medium text-slate-800">{line.material?.name ?? "Unavailable material"}</span></div></td><td className="px-4 py-4 text-right tabular-nums">{line.requested_quantity} {line.unitSymbol}</td><td className="px-4 py-4 text-right tabular-nums">{line.approved_quantity} {line.unitSymbol}</td><td className="px-4 py-4 text-right tabular-nums">{line.reservation?.remaining_quantity ?? 0} {line.unitSymbol}</td><td className="px-4 py-4 text-right tabular-nums">{total.dispatched} {line.unitSymbol}</td><td className="px-4 py-4 text-right tabular-nums">{total.received} {line.unitSymbol}</td><td className="px-4 py-4 text-right tabular-nums">{total.variance} {line.unitSymbol}</td><td className="px-5 py-4 text-right font-semibold tabular-nums">{total.dispatched - total.received - total.variance} {line.unitSymbol}</td></tr>; })}</tbody></table></DataTableShell>
    {(request.status === "approved" || request.status === "partially_approved") && user.canOperateInventory && <div className="mt-4 flex justify-end"><Button asChild variant="outline"><Link href="/requests/queue">Open dispatch queue</Link></Button></div>}
    {dispatches.length > 0 && <section className="mt-8"><h2 className="text-lg font-semibold text-slate-900">Site receipts</h2><p className="mt-1 text-sm text-slate-500">Confirm only the quantity physically received. Any shortage remains in transit pending an administrator-approved variance.</p><div className="mt-4 grid gap-3">{dispatches.map((dispatch) => {
      const line = lines.find((entry) => entry.id === dispatch.request_line_id);
      return <div key={dispatch.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-slate-900">{dispatch.transfer.transfer_number} · {line?.material?.name ?? "Material"}</span><span className="tabular-nums text-slate-600">{dispatch.item.received_quantity} / {dispatch.item.dispatched_quantity} {line?.unitSymbol} received</span></div>{dispatch.item.variance_quantity > 0 && <p className="mt-2 text-xs text-amber-700">{dispatch.item.variance_quantity} {line?.unitSymbol} approved as missing or damaged</p>}{dispatch.remainingQuantity > 0 && canReceive && <div className="mt-4"><RequestMovementForm mode="receive" id={dispatch.transfer_item_id} requestId={request.id} remaining={dispatch.remainingQuantity} unit={line?.unitSymbol ?? ""} /></div>}{dispatch.remainingQuantity > 0 && user.canManage && <TransferVarianceForm itemId={dispatch.transfer_item_id} remaining={dispatch.remainingQuantity} unit={line?.unitSymbol ?? ""} returnPath={"/requests/" + request.id} />}</div>;
    })}</div></section>}
    {canDecide && <div className="mt-8"><MaterialRequestDecision requestId={request.id} lines={lines.map((line) => ({ id: line.id, code: line.material?.code ?? "—", name: line.material?.name ?? "Unavailable material", requested_quantity: line.requested_quantity, unitSymbol: line.unitSymbol }))} /></div>}
    {canCancel && <div className="mt-8"><MaterialRequestCancellation requestId={request.id} /></div>}
    <section className="mt-8"><h2 className="text-base font-semibold text-slate-900">History</h2><DataTableShell><table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Event</th><th className="px-4 py-3">Material</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3">By</th><th className="px-5 py-3">When</th></tr></thead><tbody className="divide-y divide-slate-100">{history.map((item) => <tr key={item.id}><td className="px-5 py-3 font-medium text-slate-800">{item.event}{item.detail && <span className="block text-xs font-normal text-slate-500">{item.detail}</span>}</td><td className="px-4 py-3 text-slate-600">{item.material}</td><td className="px-4 py-3 text-right tabular-nums text-slate-700">{item.quantity}</td><td className="px-4 py-3 text-slate-600">{item.actor}</td><td className="px-5 py-3 text-xs text-slate-500"><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString("en-PH")}</time></td></tr>)}</tbody></table></DataTableShell></section>
  </>;
}
