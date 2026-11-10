import { RequestWarehouseAssignment } from "@/components/requests/request-warehouse-assignment";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { MaterialRequestItems } from "@/components/requests/material-request-items";
import { RequestRemainderClosure } from "@/components/requests/request-remainder-closure";
import { MaterialRequestCancellation } from "@/components/requests/material-request-cancellation";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { RequestMovementForm } from "@/components/requests/request-movement-form";
import { TransferVarianceForm } from "@/components/inventory/transfer-variance-form";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { getMaterialRequest } from "@/lib/data/material-requests";
import { createClient } from "@/lib/supabase/server";

import { requestDeliveryLabels, requestDeliveryStage } from "@/lib/requests/delivery-stage";

const labels = { submitted: "For approval", approved: "Approved", partially_approved: "Partially approved", rejected: "Rejected", cancelled: "Cancelled" };

export default async function MaterialRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data] = await Promise.all([requireUser(), getMaterialRequest(id)]);
  const { request, project, site, warehouse, lines, events, fulfillmentEvents, reservationEvents, varianceEvents, correctionEvents, dispatches } = data;
  const { data: capabilities, error: capabilityError } = await (await createClient()).rpc("get_project_site_capabilities", { p_project_id: request.project_id, p_site_id: request.project_site_id });
  if (capabilityError) throw new Error("Unable to verify site access.");
  const canDecide = request.status === "submitted" && (request.source_warehouse_id !== null || user.canManage) && Boolean(capabilities?.[0]?.can_review) && (user.canManage || request.requested_by !== user.userId);
  const warehouseChoices = request.status === "submitted" && user.canOperateInventory
    ? await (await createClient()).rpc("get_request_warehouse_choices", { p_id: id, p_kind: "request" }) : { data: [], error: null };
  if (warehouseChoices.error) throw new Error("Unable to load source warehouses.");
  const canCancel = (request.status === "submitted" || request.status === "approved" || request.status === "partially_approved")
    && dispatches.length === 0 && (user.canManage || request.requested_by === user.userId);
  const canRelease = data.allocations.some((allocation) => allocation.can_dispatch && allocation.remaining_quantity > 0);
  const canCloseRemainder = (request.status === "approved" || request.status === "partially_approved") && canRelease && data.allocations.filter((a) => a.remaining_quantity > 0).every((a) => a.can_dispatch)
    && dispatches.length > 0 && lines.some((line) => line.reservedQuantity > 0);
  const canReceive = Boolean(capabilities?.[0]?.can_read) && (user.canManage || user.roles.some((role) => role === "engineer" || role === "foreman"));
  const vehicles = user.canOperateInventory && (request.status === "approved" || request.status === "partially_approved")
    ? await (await createClient()).rpc("get_delivery_vehicle_choices")
    : { data: [], error: null };
  if (vehicles.error) throw new Error("Unable to load delivery vehicles.");
  const totals = new Map(lines.map((line) => [line.id, dispatches.filter((dispatch) => dispatch.request_line_id === line.id).reduce((total, dispatch) => ({ dispatched: total.dispatched + dispatch.item.dispatched_quantity, received: total.received + dispatch.item.received_quantity, variance: total.variance + dispatch.item.variance_quantity }), { dispatched: 0, received: 0, variance: 0 })]));
  const stage = requestDeliveryStage(request.status, lines.map((line) => ({ approved_quantity: line.approved_quantity, reserved: line.reservedQuantity, allocations: data.allocations.filter((allocation) => allocation.request_line_id === line.id), ...totals.get(line.id)! })));
  const deliveryLabel = stage ? requestDeliveryLabels[stage] : null;
  const hasReservedStock = lines.some((line) => line.reservedQuantity > 0);
  const hasIncoming = dispatches.some((dispatch) => dispatch.remainingQuantity > 0);
  const nextStep = request.status === "submitted"
    ? canDecide ? null : !request.source_warehouse_id
      ? { title: "Choose the source warehouse", detail: "Stock stays in the warehouse until approval and release.", target: user.canOperateInventory ? "#source-warehouse" : null, action: "Choose warehouse" }
      : canDecide
        ? null
        : { title: "Waiting for approval", detail: "An authorized reviewer must approve this request before stock can be released.", target: null, action: "" }
    : hasIncoming && canReceive
      ? { title: "Confirm what arrived", detail: "Record only the quantity delivered to the site.", target: "#site-deliveries", action: "Receive delivery" }
      : hasReservedStock && canRelease
        ? { title: "Release approved stock", detail: "Enter the quantity leaving the warehouse and its delivery details.", target: "#release-materials", action: "Release stock" }
        : null;
  const history = [
    ...correctionEvents.map((event) => ({ id: event.original_transaction_id, event: "Receipt reversed", material: "—", quantity: "—", actor: event.actorName, detail: event.reason, occurredAt: event.created_at })),
    ...events.map((event) => ({ id: event.id, event: labels[event.event_type], material: "—", quantity: "—", actor: event.actorName, detail: "", occurredAt: event.occurred_at })),
    ...fulfillmentEvents.map((event) => ({ id: event.id, event: event.event_type === "dispatched" ? "Dispatched" : "Received", material: event.materialName, quantity: String(event.quantity), actor: event.actorName, detail: "", occurredAt: event.occurred_at })),
    ...reservationEvents.map((event) => ({ id: event.id, event: event.event_type === "reserved" ? "Reserved" : event.event_type === "released" ? "Released reservation" : "Used reservation", material: event.materialName, quantity: String(event.quantity), actor: event.actorName, detail: event.reason ?? "", occurredAt: event.occurred_at })),
    ...varianceEvents.map((event) => ({ id: event.id, event: "Variance approved", material: event.materialName, quantity: String(event.quantity), actor: event.actorName, detail: event.reason, occurredAt: event.approved_at })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return <>
    <PageHeader title={request.request_number} description={`${project.code} · ${project.name} · ${site.name}`} action={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/requests">All requests</Link></Button>{user.canManage && (request.status === "approved" || request.status === "partially_approved") && <Button asChild variant="outline"><Link href={`/purchase-orders?create=1&request=${request.id}`}>Purchase for request</Link></Button>}</div>} />
    {nextStep && <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-cyan-200 bg-cyan-50 p-5">
      <div><h2 className="font-semibold text-slate-900">{nextStep.title}</h2><p className="mt-1 text-sm text-slate-700">{nextStep.detail}</p></div>
      {nextStep.target && <Button asChild><a href={nextStep.target}>{nextStep.action}</a></Button>}
    </section>}
    <div className="mt-7 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><p className="text-xs font-medium text-slate-500">Status</p><p className="mt-1 font-semibold text-slate-900">{labels[request.status]}</p></div>
      <div><p className="text-xs font-medium text-slate-500">Needed by</p><p className="mt-1 font-semibold text-slate-900">{request.required_date}</p></div>
      <div><p className="text-xs font-medium text-slate-500">Requested by</p><p className="mt-1 font-semibold text-slate-900">{data.requesterName}</p></div>
      <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-slate-500">Purpose</p><p className="mt-1 text-slate-800">{request.purpose}</p></div>
      {request.decision_reason && <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-slate-500">Decision reason</p><p className="mt-1 text-slate-800">{request.decision_reason}</p></div>}
    </div>
    {request.status === "submitted" && user.canOperateInventory && (request.source_warehouse_id
      ? <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm text-slate-700">Source warehouse: <strong>{warehouse.name}</strong><span className="ml-3 font-medium text-cyan-800">Change warehouse</span></summary><RequestWarehouseAssignment key={`${id}:${request.source_warehouse_id}`} id={id} kind="request" current={request.source_warehouse_id} choices={warehouseChoices.data ?? []} /></details>
      : user.canManage ? <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm text-slate-700">Use one default warehouse for all items (optional)</summary><RequestWarehouseAssignment id={id} kind="request" current={null} choices={warehouseChoices.data ?? []} /></details> : <RequestWarehouseAssignment key={`${id}:${request.source_warehouse_id}`} id={id} kind="request" current={null} choices={warehouseChoices.data ?? []} />)}
    {(!user.canOperateInventory || request.status !== "submitted") && <p className="mt-4 text-sm text-slate-600">Source warehouse: <strong>{warehouse.name}</strong></p>}
    {request.status === "submitted" && !request.source_warehouse_id && !canDecide && <p role="status" className="mt-4 text-sm text-amber-700">Waiting for Admin or Warehouse Staff to choose the source warehouse before approval.</p>}
    {deliveryLabel && !nextStep && <div role="status" className="mt-5 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-900"><p className="font-semibold">{deliveryLabel}</p><p className="mt-1">{stage === "ready" ? "Approved stock is reserved at the warehouse. Release it to start delivery." : stage === "upcoming" || stage === "partial" ? "Open Site deliveries below to confirm only what arrives. The remaining quantity stays in transit." : "All released quantities are accounted for. Check history for any undelivered quantities that were closed."}</p></div>}
    <MaterialRequestItems key={`${request.id}:${request.source_warehouse_id}:${request.status}`} requestId={request.id} defaultWarehouseId={request.source_warehouse_id} stockSources={data.stockSources} canDecide={canDecide} submitted={request.status === "submitted"} hasSource={request.source_warehouse_id !== null} sourceName={warehouse.name} siteName={site.name} lines={lines.map((line) => ({
      id: line.id, name: line.material?.name ?? "Unavailable material", code: line.material?.code ?? "—", unit: line.unitSymbol,
      requested: line.requested_quantity, approved: line.approved_quantity, reserved: line.reservedQuantity, allocations: data.allocations.filter((allocation) => allocation.request_line_id === line.id),
      dispatched: totals.get(line.id)!.dispatched, received: totals.get(line.id)!.received, variance: totals.get(line.id)!.variance,
      sourceOnHand: line.sourceOnHand, sourceAvailable: line.sourceAvailable, siteOnHand: line.siteOnHand, siteAvailable: line.siteAvailable,
    }))} />
    {canRelease && <section id="release-materials" className="mt-5 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold">Release materials</h2><div className="mt-3 space-y-3">{data.allocations.filter((allocation) => allocation.remaining_quantity > 0 && allocation.can_dispatch).map((allocation) => {
      const line=lines.find((item) => item.id===allocation.request_line_id)!;
      return <div key={allocation.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{line.material?.name ?? "Material"}</p><p className="text-xs text-slate-500">{allocation.warehouse_name} · {allocation.remaining_quantity} {line.unitSymbol} ready to release</p></div><RecordCreateDialog title="Release materials" triggerLabel="Release" triggerVariant="outline"><p className="mb-3 text-sm text-slate-500">{line.material?.name} · {allocation.warehouse_name} → {site.name}</p><RequestMovementForm mode="dispatch" id={allocation.id} requestId={request.id} remaining={Number(allocation.remaining_quantity)} unit={line.unitSymbol} vehicles={vehicles.data ?? []} expanded /></RecordCreateDialog></div>;
    })}</div></section>}

    {canCloseRemainder && <RequestRemainderClosure requestId={request.id} />}
    {dispatches.length > 0 && <section id="site-deliveries" className="mt-8 scroll-mt-24"><h2 className="text-lg font-semibold text-slate-900">Site deliveries</h2><p className="mt-1 text-sm text-slate-500">Enter only what actually arrived. Any shortage stays in transit until an Admin reviews it.</p><div className="mt-4 grid gap-3">{dispatches.map((dispatch) => {
      const line = lines.find((entry) => entry.id === dispatch.request_line_id);
      return <div key={dispatch.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-slate-900">{dispatch.transfer.transfer_number} · {line?.material?.name ?? "Material"}</span><div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${dispatch.remainingQuantity > 0 ? "bg-cyan-50 text-cyan-800" : "bg-emerald-50 text-emerald-800"}`}>{dispatch.remainingQuantity > 0 ? dispatch.item.received_quantity > 0 ? "Partly received" : "Upcoming delivery" : dispatch.item.variance_quantity > 0 ? "Completed with variance" : "Received"}</span><span className="tabular-nums text-slate-600">{dispatch.item.received_quantity} / {dispatch.item.dispatched_quantity} {line?.unitSymbol} received · {dispatch.remainingQuantity} remaining</span></div></div>{dispatch.manifest && <p className="mt-2 text-xs text-slate-600">Vehicle: {dispatch.manifest.vehicle_label} · Driver: {dispatch.manifest.driver_name} · Delivery ref: {dispatch.manifest.delivery_reference}</p>}{dispatch.acceptances.map((receipt) => <p key={receipt.inventory_transaction_id} className="mt-2 text-xs text-slate-600">{receipt.received_quantity} {line?.unitSymbol} accepted by {receipt.receiverName}{receipt.quality_note ? ` · ${receipt.quality_note}` : ""}{receipt.correctionReason ? ` · Reversed: ${receipt.correctionReason}` : user.canManage && <Link className="ml-2 text-cyan-700" href={`/inventory/transactions?reverse=${receipt.inventory_transaction_id}`}>Correct receipt</Link>}</p>)}{dispatch.item.variance_quantity > 0 && <p className="mt-2 text-xs text-amber-700">{dispatch.item.variance_quantity} {line?.unitSymbol} approved as missing or damaged</p>}{dispatch.remainingQuantity > 0 && canReceive && <div className="mt-4"><RequestMovementForm key={`${dispatch.id}:${dispatch.remainingQuantity}`} mode="receive" id={dispatch.transfer_item_id} requestId={request.id} remaining={dispatch.remainingQuantity} unit={line?.unitSymbol ?? ""} /></div>}{dispatch.remainingQuantity > 0 && user.canManage && <TransferVarianceForm itemId={dispatch.transfer_item_id} remaining={dispatch.remainingQuantity} unit={line?.unitSymbol ?? ""} returnPath={"/requests/" + request.id} />}</div>;
    })}</div></section>}

    {canCancel && <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Cancel this request</summary><div className="mt-4"><MaterialRequestCancellation requestId={request.id} /></div></details>}
    <details className="mt-8 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">Request history</summary><DataTableShell><table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Event</th><th className="px-4 py-3">Material</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3">By</th><th className="px-5 py-3">When</th></tr></thead><tbody className="divide-y divide-slate-100">{history.map((item) => <tr key={item.id}><td className="px-5 py-3 font-medium text-slate-800">{item.event}{item.detail && <span className="block text-xs font-normal text-slate-500">{item.detail}</span>}</td><td className="px-4 py-3 text-slate-600">{item.material}</td><td className="px-4 py-3 text-right tabular-nums text-slate-700">{item.quantity}</td><td className="px-4 py-3 text-slate-600">{item.actor}</td><td className="px-5 py-3 text-xs text-slate-500"><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString("en-PH")}</time></td></tr>)}</tbody></table></DataTableShell></details>
  </>;
}
