import { notFound } from "next/navigation";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { ApproveSitePurchaseForm, ReimburseSitePurchaseForm, RejectSitePurchaseForm } from "@/components/site-purchases/site-purchase-forms";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { getSitePurchase } from "@/lib/data/site-purchases";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const postedMessages: Record<string, string> = {
  submitted: "Purchase submitted. Admin or Finance will approve it.", approved: "Approved. The items are now in the site's stock.",
  rejected: "Purchase rejected.", reimbursed: "Marked as reimbursed.",
};
const statusStyle = { submitted: "bg-amber-50 text-amber-800", approved: "bg-emerald-50 text-emerald-700", rejected: "bg-slate-100 text-slate-600" } as const;
const statusLabel = { submitted: "Waiting approval", approved: "Approved", rejected: "Rejected" } as const;

export default async function SitePurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string; action?: string }> }) {
  const user = await requireUser();
  if (!user.canManage && !user.canViewLaborRates && !user.roles.some((role) => role === "engineer" || role === "foreman")) notFound();
  const { id } = await params;
  const query = await searchParams;
  const posted = query.posted;
  const data = await getSitePurchase(id);
  const { purchase } = data;
  const canDecide = user.canViewLaborRates;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <div className="max-w-5xl">
    <PageHeader eyebrow="Site purchase" title={purchase.purchase_number} description={`${data.project?.name ?? ""} · ${data.siteName}`} action={<Button variant="outline" asChild><Link href={`/site-purchases?status=${purchase.status}`}>Back to site purchases</Link></Button>} />
    {posted && postedMessages[posted] && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{postedMessages[posted]}</p>}
    {purchase.status === "approved" && data.stockLocationId && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-slate-700">
      <span>Stock was posted to {data.siteName}. Check this site’s balance and stock history.</span>
      <Button variant="outline" size="sm" asChild><Link href={`/inventory?location=${data.stockLocationId}`}>View site inventory</Link></Button>
      <Button variant="outline" size="sm" asChild><Link href={`/inventory/transactions?location=${data.stockLocationId}`}>View stock history</Link></Button>
    </div>}
    <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[purchase.status]}`}>{statusLabel[purchase.status]}</span><span className="text-lg font-semibold tabular-nums">{peso.format(data.total)}</span></div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Store</dt><dd className="mt-1 font-medium">{purchase.supplier_name}</dd></div>
          <div><dt className="text-xs text-slate-500">Receipt</dt><dd className="mt-1 font-medium">{purchase.receipt_number} · {purchase.receipt_date}</dd></div>
          <div><dt className="text-xs text-slate-500">Bought by</dt><dd className="mt-1 font-medium">{data.submittedByName}</dd></div>
          <div><dt className="text-xs text-slate-500">Paid with</dt><dd className="mt-1 font-medium">{purchase.paid_with === "own_money" ? (purchase.reimbursed_on ? `Own money · reimbursed ${purchase.reimbursed_on} (${purchase.reimbursement_reference})` : "Own money · to reimburse") : "Company cash"}</dd></div>
          {purchase.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Note</dt><dd className="mt-1">{purchase.notes}</dd></div>}
          {purchase.status !== "submitted" && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">{purchase.status === "approved" ? "Approved by" : "Rejected by"}</dt><dd className="mt-1">{data.decidedByName}{purchase.rejection_reason ? ` · ${purchase.rejection_reason}` : ""}</dd></div>}
        </dl>
        {canDecide && purchase.status === "submitted" && <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <RecordCreateDialog title="Reject purchase" triggerLabel="Reject" triggerVariant="outline"><RejectSitePurchaseForm purchaseId={purchase.id} /></RecordCreateDialog>
          <RecordCreateDialog title="Approve purchase" triggerLabel="Approve" initialOpen={query.action === "approve"} closeHref={`/site-purchases/${id}`}><ApproveSitePurchaseForm purchaseId={purchase.id} total={data.total} /></RecordCreateDialog>
        </div>}
        {canDecide && purchase.status === "approved" && purchase.paid_with === "own_money" && !purchase.reimbursed_on && <div className="mt-5 flex justify-end border-t border-slate-100 pt-4"><RecordCreateDialog title="Mark reimbursed" triggerLabel="Mark reimbursed" triggerVariant="outline" initialOpen={query.action === "reimburse"} closeHref={`/site-purchases/${id}`}><ReimburseSitePurchaseForm purchaseId={purchase.id} today={today} /></RecordCreateDialog></div>}
      </div>
      <a href={`/site-purchases/${purchase.id}/receipt`} target="_blank" rel="noopener" className="block aspect-[3/4] w-full max-w-[280px] overflow-hidden self-start rounded-xl border border-slate-200 bg-slate-50" title="Open receipt photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated photo route */}
        <img src={`/site-purchases/${purchase.id}/receipt`} alt={`Receipt ${purchase.receipt_number}`} className="h-full w-full object-contain" />
      </a>
    </section>
    <h2 className="mt-8 text-lg font-semibold text-slate-900">Items bought</h2>
    <DataTableShell footer={<div className="flex justify-end text-sm">Total <span className="ml-3 font-semibold tabular-nums">{peso.format(data.total)}</span></div>}>
      <table className="w-full min-w-[620px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Item</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Price</th><th className="px-5 py-3 text-right">Total</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{data.lines.map((line) => <tr key={line.id}><td className="px-5 py-4"><p className="font-medium">{line.material_name}</p><p className="text-xs text-slate-500">{line.material_code}</p></td><td className="px-4 py-4 text-right tabular-nums">{line.quantity} {line.unit_symbol}</td><td className="px-4 py-4 text-right tabular-nums">{peso.format(Number(line.unit_price))}/{line.unit_symbol}</td><td className="px-5 py-4 text-right font-medium tabular-nums">{peso.format(line.total)}</td></tr>)}</tbody></table>
    </DataTableShell>
  </div>;
}
