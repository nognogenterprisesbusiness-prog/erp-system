import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { listQrCodes, qrEntityLabels } from "@/lib/data/qr-codes";
import type { QrEntityType } from "@/types/database";

const filters: Array<{ value: QrEntityType | "all"; label: string }> = [
  { value: "all", label: "All" }, { value: "material", label: "Materials" }, { value: "equipment", label: "Equipment" },
  { value: "vehicle", label: "Vehicles" }, { value: "warehouse", label: "Warehouses" }, { value: "project_site", label: "Sites" },
];

export default async function QrCodesPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  if (!(await requireUser()).canManage) notFound();
  const { type, page: pageParam } = await searchParams;
  const filter = filters.find((item) => item.value === type)?.value;
  const requestedPage = /^\d{1,6}$/.test(pageParam ?? "") ? Number(pageParam) : 1;
  const page = Math.max(1, requestedPage);
  const { codes, count, pageSize } = await listQrCodes(page, filter && filter !== "all" ? filter : undefined);
  const pageHref = (next: number) => `/qr-codes?${new URLSearchParams({ ...(filter && filter !== "all" ? { type: filter } : {}), page: String(next) })}`;
  return <>
    <PageHeader eyebrow="Asset identification" title="QR codes" description="One active label per record. Labels identify records only; they never grant access or move stock." />
    <nav aria-label="Filter QR codes" className="mt-6 flex flex-wrap gap-2">{filters.map((item) => <Link key={item.value} href={item.value === "all" ? "/qr-codes" : `/qr-codes?type=${item.value}`} aria-current={(filter ?? "all") === item.value ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-medium ${(filter ?? "all") === item.value ? "bg-[#07152d] text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-cyan-400"}`}>{item.label}</Link>)}</nav>
    <div className="mt-5"><DataTableShell empty={codes.length === 0 ? <EmptyState kind={filter && filter !== "all" ? "results" : "items"} title="No QR codes here" description="Open a material, asset, warehouse, or project site to generate a label." /> : undefined}><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Identifier</th><th className="px-4 py-3">Record type</th><th className="px-4 py-3">Generated</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{codes.map((code) => <tr key={code.id}><td className="px-5 py-4 font-mono text-xs font-medium">{code.public_identifier}</td><td className="px-4 py-4">{qrEntityLabels[code.entity_type]}</td><td className="px-4 py-4 text-slate-500">{new Date(code.generated_at).toLocaleDateString("en-PH")}</td><td className="px-4 py-4"><Badge variant={code.status === "active" ? "active" : "neutral"}>{code.status}</Badge></td><td className="px-5 py-4 text-right"><Link className="font-semibold text-cyan-700 hover:underline" href={`/qr-codes/${code.id}`}>View</Link></td></tr>)}</tbody></table></DataTableShell></div>
    {count > pageSize && <nav aria-label="QR registry pages" className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Page {page} of {Math.ceil(count / pageSize)}</span><div className="flex gap-3">{page > 1 && <Link href={pageHref(page - 1)} className="font-medium text-cyan-700 hover:underline">Previous</Link>}{page * pageSize < count && <Link href={pageHref(page + 1)} className="font-medium text-cyan-700 hover:underline">Next</Link>}</div></nav>}
  </>;
}
