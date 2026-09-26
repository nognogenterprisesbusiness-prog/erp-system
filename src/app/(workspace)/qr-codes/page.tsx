import { IntentLink as Link } from "@/components/layout/intent-link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon } from "@hugeicons/core-free-icons";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QrRegistryActions } from "@/components/qr/qr-registry-actions";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { safeSearchTerm } from "@/lib/data/search";
import { requireUser } from "@/lib/auth";
import { listQrCodes, qrEntityLabels } from "@/lib/data/qr-codes";
import type { QrEntityType } from "@/types/database";

const filters: Array<{ value: QrEntityType | "all"; label: string }> = [
  { value: "all", label: "All" }, { value: "material", label: "Materials" }, { value: "equipment", label: "Equipment" },
  { value: "vehicle", label: "Vehicles" }, { value: "warehouse", label: "Warehouses" }, { value: "project_site", label: "Sites" },
];

export default async function QrCodesPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string; q?: string }> }) {
  if (!(await requireUser()).canManage) notFound();
  const { type, page: pageParam, q } = await searchParams;
  const search = safeSearchTerm(q);
  const filter = filters.find((item) => item.value === type)?.value;
  const requestedPage = /^\d{1,6}$/.test(pageParam ?? "") ? Number(pageParam) : 1;
  const page = Math.min(10000, Math.max(1, requestedPage));
  const { codes, count, pageSize } = await listQrCodes(page, filter && filter !== "all" ? filter : undefined, search);
  const exportParams = new URLSearchParams({ ...(filter && filter !== "all" ? { type: filter } : {}), ...(search ? { q: search } : {}) });
  const pageHref = (next: number) => `/qr-codes?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(next) })}`;
  return <>
    <PageHeader eyebrow="Asset identification" title="QR codes" description="Labels identify records only; they never grant access or move stock." action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/scan">Scan QR</Link></Button><Button variant="outline" asChild><a href={`/qr-codes/export?${exportParams}`}><HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={1.6} />Export CSV</a></Button></div>} />
    <ListFilterBar><SearchField name="q" label="Search QR identifier" placeholder="Search QR identifier" defaultValue={search} maxLength={80} /><SelectPicker name="type" label="Record type" defaultValue={filter ?? "all"} options={filters} /></ListFilterBar>
    <div className="mt-5"><DataTableShell empty={codes.length === 0 ? <EmptyState kind={search || (filter && filter !== "all") ? "results" : "items"} title="No QR codes here" description={search ? "Try a different QR identifier or record type." : "Labels appear automatically for eligible records."} /> : undefined}><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Identifier</th><th className="px-4 py-3">Record type</th><th className="px-4 py-3">Generated</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{codes.map((code) => <tr key={code.id}><td className="px-5 py-4 font-mono text-xs font-medium">{code.public_identifier}</td><td className="px-4 py-4">{qrEntityLabels[code.entity_type]}</td><td className="px-4 py-4 text-slate-500">{new Date(code.generated_at).toLocaleDateString("en-PH")}</td><td className="px-4 py-4"><Badge variant={code.status === "active" ? "active" : "neutral"}>{code.status}</Badge></td><td className="px-5 py-4 text-right"><QrRegistryActions id={code.id} identifier={code.public_identifier} label={qrEntityLabels[code.entity_type]} status={code.status} /></td></tr>)}</tbody></table></DataTableShell></div>
    {count > pageSize && <nav aria-label="QR registry pages" className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Page {page} of {Math.ceil(count / pageSize)}</span><div className="flex gap-3">{page > 1 && <Link href={pageHref(page - 1)} className="font-medium text-cyan-700 hover:underline">Previous</Link>}{page * pageSize < count && <Link href={pageHref(page + 1)} className="font-medium text-cyan-700 hover:underline">Next</Link>}</div></nav>}
    <p className="mt-3 text-sm text-slate-500">{count} QR code{count === 1 ? "" : "s"}</p>
  </>;
}
