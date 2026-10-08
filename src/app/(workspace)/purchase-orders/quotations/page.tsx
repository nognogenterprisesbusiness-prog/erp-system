import { randomUUID } from "node:crypto";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { SearchField } from "@/components/ui/search-field";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { SupplierQuotationForm } from "@/components/purchase-orders/purchase-order-forms";
import { requireProcurementViewer } from "@/lib/auth";
import { todayInManila } from "@/lib/date";
import { getSupplierQuotationLines } from "@/lib/data/procurement-stages";
import { getPurchaseOrderChoices } from "@/lib/data/purchase-orders";
import { pageNumber } from "@/lib/data/pagination";
import { readAllPages } from "@/lib/data/read-all-pages";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@nognog/domain";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export default async function SupplierQuotationsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireProcurementViewer();
  const params = await searchParams;
  const page = pageNumber(typeof params.page === "string" ? params.page : undefined);
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const material = uuidSchema.safeParse(params.material);
  const selectedMaterial = material.success ? material.data : undefined;
  const supabase = await createClient();
  const [result, choices, materials] = await Promise.all([
    getSupplierQuotationLines(page, query, selectedMaterial),
    user.canManage && params.create === "1" ? getPurchaseOrderChoices() : null,
    readAllPages((from, to) => supabase.from("materials").select("id,code,name")
      .eq("material_kind", "consumable").eq("is_active", true).is("archived_at", null)
      .order("name").order("id").range(from, to), "quotation material filters"),
  ]);
  const today = todayInManila();
  const pageHref = (target: number) => `/purchase-orders/quotations?${new URLSearchParams({
    ...(query ? { q: query } : {}), ...(selectedMaterial ? { material: selectedMaterial } : {}), page: String(target),
  })}`;
  return <>
    <PageHeader eyebrow="Purchasing & suppliers" title="Supplier quotations"
      description="Compare written offers before buying. A quote does not change stock or the supplier's purchase-price history."
      action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/purchase-orders">Back to purchases</Link></Button>{user.canManage && <Button asChild><Link href="/purchase-orders/quotations?create=1">Add quotation</Link></Button>}</div>} />
    {choices && <RecordCreateDialog title="Add supplier quotation" initialOpen hideTrigger closeHref="/purchase-orders/quotations">
      {choices.suppliers.length && choices.materials.length ? <SupplierQuotationForm choices={choices} idempotencyKey={randomUUID()} today={today} /> : <EmptyState title="Supplier or material missing" description="Add an active supplier and material first." />}
    </RecordCreateDialog>}
    {params.posted === "1" && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Quotation saved. You can now use it for a purchase.</p>}
    <ListFilterBar><SearchField name="q" label="Search quotations" defaultValue={query} placeholder="Supplier, quotation reference or material" />
      <select name="material" defaultValue={selectedMaterial ?? ""} aria-label="Compare quotes for material" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All materials</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
    </ListFilterBar>
    <DataTableShell empty={result.rows.length === 0 ? <EmptyState title="No quotations found" description="Add a supplier quote or change the search." /> : undefined}
      footer={<span className="text-xs text-slate-500">{result.count} quoted item{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[900px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <th className="px-5 py-3">Material</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Reference</th>
        <th className="px-4 py-3">Quoted / valid until</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Unit price</th><th className="px-5 py-3">Action</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((row) => <tr key={`${row.quotation_id}:${row.material_id}`}>
        <td className="px-5 py-4 font-medium text-slate-900">{row.material_name}</td><td className="px-4 py-4">{row.supplier_name}</td><td className="px-4 py-4"><Link href={`/purchase-orders/quotations/${row.quotation_id}`} className="text-cyan-700 hover:underline">{row.reference}</Link></td>
        <td className="px-4 py-4">{row.quoted_on}{row.valid_until ? ` · ${row.valid_until}` : " · no expiry"}</td>
        <td className="px-4 py-4 tabular-nums">{row.quantity} {row.unit_symbol}</td><td className="px-4 py-4 tabular-nums">{money.format(Number(row.unit_price))}</td>
        <td className="px-5 py-4">{user.canManage && (!row.valid_until || row.valid_until >= today) && row.quoted_on <= today ? <Button variant="outline" size="sm" asChild><Link href={`/purchase-orders?create=1&quotation=${row.quotation_id}`}>Use quote</Link></Button> : "—"}</td>
      </tr>)}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav aria-label="Quotation pages" className="mt-4 flex items-center justify-end gap-2">
      {result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
      <span className="text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>
      {result.page < result.pageCount ? <Button variant="outline" size="sm" asChild><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
    </nav>}
  </>;
}
