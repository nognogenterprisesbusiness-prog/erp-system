import { randomUUID } from "node:crypto";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { uuidSchema } from "@nognog/domain";
import { notFound } from "next/navigation";
import { BillingCorrectionForm, RecordPaymentForm } from "@/components/billing/billing-forms";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireFinanceViewer } from "@/lib/auth";
import { getInvoice } from "@/lib/data/billing";

const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string }> }) {
  const user = await requireFinanceViewer();
  const id = (await params).id;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { invoice, balance, payments } = await getInvoice(id);
  const posted = (await searchParams).posted;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const outstanding = balance?.outstanding_amount ?? 0;
  return <>
    <PageHeader title={invoice.invoice_number} description={`${invoice.project_code} · ${invoice.project_name} · ${invoice.client_name}`} action={<Button variant="outline" asChild><Link href="/billing">Back to billing</Link></Button>} />
    {posted && ["payment", "reversal", "void"].includes(posted) && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{posted === "payment" ? "Payment recorded." : posted === "reversal" ? "Payment reversed with an audit record." : "Invoice voided."}</p>}
    <section className="mt-7 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3 sm:p-6">
      <div><p className="text-xs text-slate-500">Invoice amount</p><p className="mt-1 text-xl font-semibold text-slate-900">{money(invoice.amount)}</p></div>
      <div><p className="text-xs text-slate-500">Paid</p><p className="mt-1 text-xl font-semibold text-slate-900">{money(balance?.paid_amount ?? 0)}</p></div>
      <div><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 text-xl font-semibold text-slate-900">{money(outstanding)}</p></div>
      <div className="sm:col-span-3 border-t border-slate-100 pt-4 text-sm text-slate-600"><span className="font-medium text-slate-800">{invoice.description}</span><span className="ml-3">Issued {invoice.issued_on} · Due {invoice.due_on} · {invoice.status === "void" ? "Void" : outstanding === 0 ? "Paid" : "Open"}</span></div>
      {invoice.status === "void" && <p className="sm:col-span-3 text-xs text-slate-600">Void reason: {invoice.void_reason}</p>}
    </section>
    {invoice.status === "issued" && outstanding > 0 && <div className="mt-5"><RecordPaymentForm invoiceId={id} idempotencyKey={randomUUID()} today={today} outstanding={outstanding} /></div>}
    <h2 className="mt-8 text-lg font-semibold text-slate-900">Payment history</h2>
    <DataTableShell empty={payments.length === 0 ? <EmptyState compact title="No payments recorded" description="Record a partial or full payment above." /> : undefined} footer={<span className="text-xs text-slate-500">{payments.length} payment{payments.length === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[650px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Reference</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment.id}>
        <td className="px-5 py-4 font-medium text-slate-800">{payment.reference}</td><td className="px-4 py-4 text-slate-600">{payment.paid_on}</td><td className="px-4 py-4 text-right">{money(payment.amount)}</td>
        <td className="px-5 py-4">{payment.reversal ? <span className="text-xs text-slate-500">Reversed · {payment.reversal.reason}</span> : user.canManage ? <details className="max-w-xs"><summary className="cursor-pointer text-xs font-medium text-cyan-700">Posted · Correct</summary><div className="mt-3"><BillingCorrectionForm kind="reverse" invoiceId={id} paymentId={payment.id} idempotencyKey={randomUUID()} /></div></details> : <span className="text-xs text-emerald-700">Posted</span>}</td>
      </tr>)}</tbody></table>
    </DataTableShell>
    {user.canManage && invoice.status === "issued" && outstanding === invoice.amount && <details className="mt-6 max-w-md rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-medium text-slate-700">Void invoice</summary><div className="mt-4"><BillingCorrectionForm kind="void" invoiceId={id} /></div></details>}
  </>;
}
