import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { SitePurchaseForm } from "@/components/site-purchases/site-purchase-forms";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { pageNumber } from "@/lib/data/pagination";
import { getSitePurchaseChoices, getSitePurchases } from "@/lib/data/site-purchases";
import type { SitePurchaseStatus } from "@/types/database";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const tabs: { status: SitePurchaseStatus; label: string }[] = [
  { status: "submitted", label: "Waiting approval" }, { status: "approved", label: "Approved" }, { status: "rejected", label: "Rejected" },
];

// Hardware store purchases by Engineers: they submit, Admin or Finance approves.
export default async function SitePurchasesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; create?: string }> }) {
  const user = await requireUser();
  const canSubmit = user.canManage || user.roles.includes("engineer");
  if (!canSubmit && !user.canViewLaborRates) notFound();
  const query = await searchParams;
  const status = tabs.find((tab) => tab.status === query.status)?.status ?? "submitted";
  const page = pageNumber(query.page);
  const [result, choices] = await Promise.all([getSitePurchases({ status, page }), canSubmit && query.create === "1" ? getSitePurchaseChoices(user.userId, user.canManage) : Promise.resolve(null)]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <>
    <PageHeader eyebrow="Purchasing" title="Site purchases" description={user.canViewLaborRates ? "Materials an Engineer bought at a hardware store. Approve to add them to the site's stock." : "Record materials you bought at a hardware store for your site. Admin or Finance approves them."}
      action={canSubmit && <Button asChild><Link href={`/site-purchases?status=${status}&create=1`}>+ New site purchase</Link></Button>} />
    {choices && <RecordCreateDialog title="New site purchase" initialOpen hideTrigger closeHref={`/site-purchases?status=${status}`}>{choices.sites.length ? <SitePurchaseForm choices={choices} idempotencyKey={randomUUID()} today={today} /> : <EmptyState compact title="No sites to buy for" description="You can record purchases for sites where you are the Engineer." />}</RecordCreateDialog>}
    <nav aria-label="Site purchase status" className="mt-6 flex flex-wrap gap-2">{tabs.map((tab) => <Link key={tab.status} href={`/site-purchases?status=${tab.status}`} aria-current={tab.status === status ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${tab.status === status ? "bg-[#07152d] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>{tab.label}</Link>)}</nav>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState kind="items" title="No site purchases here" description={status === "submitted" ? "New hardware store purchases appear here for approval." : "Nothing in this list yet."} /> : undefined}>
      <table className="w-full min-w-[900px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Purchase</th><th className="px-4 py-3">Project · site</th><th className="px-4 py-3">Store · receipt</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Paid with</th><th className="px-5 py-3">Bought by</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{result.rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/70">
          <td className="px-5 py-4"><Link href={`/site-purchases/${row.id}`} className="font-semibold text-slate-900 hover:text-cyan-700">{row.purchase_number}</Link><p className="text-xs text-slate-500">{row.receipt_date}</p></td>
          <td className="px-4 py-4">{row.project?.name ?? "—"}<p className="text-xs text-slate-500">{row.siteName}</p></td>
          <td className="px-4 py-4">{row.supplier_name}<p className="text-xs text-slate-500">Receipt {row.receipt_number}</p></td>
          <td className="px-4 py-4 text-right font-medium tabular-nums">{peso.format(row.total)}</td>
          <td className="px-4 py-4 text-xs">{row.paid_with === "own_money" ? <span className={`rounded-full px-2 py-0.5 font-semibold ${row.reimbursed_on ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{row.reimbursed_on ? "Own money · reimbursed" : "Own money · to reimburse"}</span> : "Company cash"}</td>
          <td className="px-5 py-4 text-slate-600">{row.submittedByName}</td>
        </tr>)}</tbody></table>
    </DataTableShell>
    <HistoryPagination path="/site-purchases" page={result.page} count={result.count} filters={{ status }} />
  </>;
}
