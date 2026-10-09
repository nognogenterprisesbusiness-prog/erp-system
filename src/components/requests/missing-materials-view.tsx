import { notFound } from "next/navigation";
import { DismissMissingMaterialForm, MissingMaterialForm, CreateSourcingSiteRequestForm } from "@/components/requests/missing-material-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getMaterialRequestChoices } from "@/lib/data/material-requests";
import { pageNumber } from "@/lib/data/pagination";
import { createClient } from "@/lib/supabase/server";

export async function MissingMaterialsView({ pageParam }: { pageParam?: string }) {
  const user = await requireUser();
  const canSubmit = user.roles.some((role) => role === "engineer" || role === "foreman");
  if (!user.canManage && !canSubmit) notFound();
  const page = pageNumber(pageParam);
  const db = await createClient();
  const [choices, result] = await Promise.all([
    getMaterialRequestChoices(),
    db.from("material_sourcing_requests").select("*", { count: "exact" })
      .order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1),
  ]);
  if (result.error) throw new Error("Unable to load missing material reports.");
  const reports = result.data ?? [];
  const reportIds = reports.map((item) => item.id);
  const [purchaseContexts, requestLinks] = reportIds.length ? await Promise.all([
    db.from("purchase_procurement_context").select("idempotency_key,material_sourcing_request_id,sourcing_material_id").in("material_sourcing_request_id", reportIds),
    db.from("material_sourcing_request_links").select("material_sourcing_request_id,material_request_id,material_id,quantity").in("material_sourcing_request_id", reportIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (purchaseContexts.error || requestLinks.error) throw new Error("Unable to load shortage progress.");
  const orderKeys = (purchaseContexts.data ?? []).map((item) => item.idempotency_key);
  const [orders, approvals] = orderKeys.length ? await Promise.all([
    db.from("purchase_orders").select("id,po_number,idempotency_key,status").in("idempotency_key", orderKeys),
    db.from("purchase_approval_requests").select("id,idempotency_key,status").in("idempotency_key", orderKeys),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (orders.error || approvals.error) throw new Error("Unable to load linked purchases.");
  const linkedRequestIds = (requestLinks.data ?? []).map((item) => item.material_request_id);
  const linkedRequests = linkedRequestIds.length ? await db.from("material_requests").select("id,request_number,status").in("id", linkedRequestIds) : { data: [], error: null };
  if (linkedRequests.error) throw new Error("Unable to load linked site requests.");
  const linkedRequestLines = linkedRequestIds.length ? await db.from("material_request_lines").select("request_id,material_id,approved_quantity").in("request_id", linkedRequestIds) : { data: [], error: null };
  if (linkedRequestLines.error) throw new Error("Unable to load approved request quantities.");
  const ordersByKey = new Map((orders.data ?? []).map((item) => [item.idempotency_key, item]));
  const approvalsByKey = new Map((approvals.data ?? []).map((item) => [item.idempotency_key, item]));
  const requestsById = new Map((linkedRequests.data ?? []).map((item) => [item.id, item]));
  const approvedByRequestMaterial = new Map((linkedRequestLines.data ?? []).map((line) => [`${line.request_id}:${line.material_id}`, Number(line.approved_quantity)]));
  return <>
    {canSubmit && <section className="mt-6"><h2 className="mb-3 text-base font-semibold">Report a missing material</h2><MissingMaterialForm choices={choices} /></section>}
    <section className="mt-8"><h2 className="text-base font-semibold">Out-of-stock reports</h2>
      {reports.length === 0 ? <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No materials reported out of stock.</p> : <div className="mt-4 grid gap-3">{reports.map((item) => {
        const contexts = (purchaseContexts.data ?? []).filter((context) => context.material_sourcing_request_id === item.id);
        const links = (requestLinks.data ?? []).filter((link) => link.material_sourcing_request_id === item.id);
        const remaining = Math.max(0, Number(item.requested_quantity) - links.reduce((sum, link) => {
          const status = requestsById.get(link.material_request_id)?.status;
          return sum + (["rejected", "cancelled"].includes(status ?? "") ? 0 : status === "partially_approved"
            ? approvedByRequestMaterial.get(`${link.material_request_id}:${link.material_id}`) ?? 0 : Number(link.quantity));
        }, 0));
        const linkedMaterial = contexts[0]?.sourcing_material_id ?? links[0]?.material_id;
        return <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{item.material_name}</h3><p className="mt-1 text-xs text-slate-500">{item.project_name} · {item.site_name} · {item.warehouse_name}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">{item.status === "resolved" ? "Site request created" : item.status === "dismissed" ? "Dismissed" : links.some((link) => ["rejected", "partially_approved", "cancelled"].includes(requestsById.get(link.material_request_id)?.status ?? "")) ? "Needs remaining site request" : contexts.length ? "Supplier sourcing / warehouse receipt" : "Admin sourcing / warehouse receipt"}</span></div>
        <p className="mt-3 text-sm text-slate-700">{item.requested_quantity} {item.unit_name} · Needed {item.needed_on}</p><p className="mt-1 text-sm text-slate-600">{item.reason}</p>
        {item.resolution_note && <p className="mt-3 text-sm text-slate-600">Review: {item.resolution_note}</p>}
        {contexts.length > 0 && <div className="mt-3 text-sm text-slate-700"><p className="font-medium">Supplier purchasing</p>{contexts.map((context) => {
          const order = ordersByKey.get(context.idempotency_key);
          const approval = approvalsByKey.get(context.idempotency_key);
          return <p key={context.idempotency_key}>{order ? <Link href={`/purchase-orders/${order.id}`} className="text-cyan-700 hover:underline">{order.po_number}</Link> : approval ? <Link href={`/purchase-orders/approvals/${approval.id}`} className="text-cyan-700 hover:underline">Owner approval</Link> : "Purchase"} · {order?.status ?? approval?.status ?? "processing"}</p>;
        })}</div>}
        {links.length > 0 && <div className="mt-3 text-sm text-slate-700"><p className="font-medium">Site requests · {remaining} {item.unit_name} remaining to request</p>{links.map((link) => {
          const request = requestsById.get(link.material_request_id);
          return <p key={link.material_request_id}><Link href={`/requests/${link.material_request_id}`} className="text-cyan-700 hover:underline">{request?.request_number ?? "Site request"}</Link> · {link.quantity} {item.unit_name} · {request?.status ?? "submitted"}</p>;
        })}</div>}
        {user.canManage && item.status === "submitted" && <><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link href="/inventory?create=1">Add catalog material</Link></Button><Button variant="outline" size="sm" asChild><Link href={`/purchase-orders?${new URLSearchParams({ create: "1", shortage: item.id, warehouse: item.source_warehouse_id, quantity: String(remaining) })}`}>Purchase material</Link></Button></div><CreateSourcingSiteRequestForm id={item.id} materials={linkedMaterial ? choices.materials.filter((material) => material.id === linkedMaterial) : choices.materials} remaining={remaining} /><DismissMissingMaterialForm id={item.id} /></>}
      </article>})}</div>}
      {(page > 1 || (result.count ?? 0) > page * 20) && <nav aria-label="Out-of-stock report pages" className="mt-4 flex justify-end gap-3">{page > 1 && <Button variant="outline" asChild><Link href={`/requests?view=missing&page=${page - 1}`}>Previous</Link></Button>}{(result.count ?? 0) > page * 20 && <Button variant="outline" asChild><Link href={`/requests?view=missing&page=${page + 1}`}>Next</Link></Button>}</nav>}
    </section>
  </>;
}
