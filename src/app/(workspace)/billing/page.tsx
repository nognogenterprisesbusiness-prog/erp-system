import Link from "next/link";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireFinanceViewer } from "@/lib/auth";
import { getInvoices } from "@/lib/data/billing";

const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireFinanceViewer();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const result = await getInvoices({ page, query });
  const pageHref = (target: number) => `/billing?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(target) })}`;
  return <>
    <PageHeader title="Client billing" description="Issued project invoices, partial payments, and outstanding balances." action={<Button asChild><Link href="/billing/new"><HugeiconsIcon icon={PlusSignIcon} size={17} /> New invoice</Link></Button>} />
    <form className="mt-7 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <SearchField name="q" label="Search invoices" defaultValue={query} placeholder="Search invoice, client, or description" wrapperClassName="min-w-[220px] flex-1" />
      <Button variant="outline">Search</Button>
    </form>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No invoices found" description="Issue an invoice or change the search." /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} invoice{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[790px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <th className="px-5 py-3">Code</th><th className="px-4 py-3">Project / client</th><th className="px-4 py-3">Issued / due</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-5 py-3">Status</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/70">
        <td className="px-5 py-4 font-semibold"><Link href={`/billing/${row.id}`} className="text-slate-900 hover:text-cyan-700">{row.invoice_number}</Link></td>
        <td className="px-4 py-4"><p className="font-medium text-slate-800">{row.project_code} · {row.project_name}</p><p className="mt-1 text-xs text-slate-500">{row.client_name}</p></td>
        <td className="px-4 py-4 text-slate-600">{row.issued_on}<br /><span className="text-xs text-slate-500">Due {row.due_on}</span></td>
        <td className="px-4 py-4 text-right font-medium">{money(row.amount)}</td><td className="px-4 py-4 text-right">{money(row.balance?.paid_amount ?? 0)}</td><td className="px-4 py-4 text-right font-semibold">{money(row.balance?.outstanding_amount ?? 0)}</td>
        <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === "void" ? "bg-slate-100 text-slate-600" : row.balance?.outstanding_amount === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{row.status === "void" ? "Void" : row.balance?.outstanding_amount === 0 ? "Paid" : "Open"}</span></td>
      </tr>)}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Invoice pages" className="mt-4 flex items-center justify-end gap-2">
      {result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
      <span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>
      {result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
    </nav>}
  </>;
}
