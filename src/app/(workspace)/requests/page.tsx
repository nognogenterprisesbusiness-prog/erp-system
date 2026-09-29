import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { EquipmentRequestsView } from "@/components/assets/equipment-requests-view";
import { RequestTypeNav } from "@/components/requests/request-type-nav";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { getMaterialRequests } from "@/lib/data/material-requests";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";

const statuses = ["submitted", "approved", "partially_approved", "rejected", "cancelled"] as const;
const statusLabels = { submitted: "For approval", approved: "Approved", partially_approved: "Partially approved", rejected: "Rejected", cancelled: "Cancelled" };

export default async function MaterialRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.type === "equipment" || params.type === "vehicle") return <EquipmentRequestsView params={params} kind={params.type} />;
  const search = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const status = z.enum([...statuses, "all"]).safeParse(params.status);
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const filters = { search, status: status.success ? status.data : "all" as const, page };
  const [user, result] = await Promise.all([requireUser(), getMaterialRequests(filters)]);
  const canRequest = !user.canManage && user.roles.some((role) => ["engineer", "foreman"].includes(role));
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (search) next.set("q", search); if (filters.status !== "all") next.set("status", filters.status); next.set("page", String(target)); return `/requests?${next}`; };
  return <>
    <PageHeader title="Requests" description="Review material demand, manager decisions, and delivery progress." action={<div className="flex flex-wrap gap-2">{canRequest && <Button asChild><Link href="/requests/new"><HugeiconsIcon icon={PlusSignIcon} size={17} />New material request</Link></Button>}</div>} />
    <RequestTypeNav active="material" showAssets={user.canManage || canRequest} />
    <ListFilterBar>
      <SearchField name="q" label="Search request number" defaultValue={search} placeholder="Search request number" />
      <div className="min-w-[180px]"><SelectPicker name="status" label="Status" defaultValue={filters.status} options={[{ value: "all", label: "All statuses" }, ...statuses.map((value) => ({ value, label: statusLabels[value] }))]} /></div>
    </ListFilterBar>
    <DataTableShell empty={result.requests.length === 0 ? <EmptyState title="No material requests found" description={canRequest ? "Create a request or change the filters." : "No requests are available to your account."} /> : undefined} footer={<span className="text-xs text-slate-500">{result.count} request{result.count === 1 ? "" : "s"}</span>}>
      <table className="w-full min-w-[980px] text-left text-sm"><thead className={tableHeadClass}><tr>
        <th className="px-5 py-3">Code</th><th className="px-4 py-3">Material</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Source warehouse</th><th className="px-4 py-3">Needed by</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Requested</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{result.requests.map((request) => <tr key={request.id} className="hover:bg-slate-50/70">
        <td className="px-5 py-4 font-semibold"><Link href={`/requests/${request.id}`} className="text-slate-900 hover:text-cyan-700">{request.request_number}</Link></td>
        <td className="px-4 py-4"><Link href={`/requests/${request.id}`} className="flex items-center gap-3 hover:text-cyan-700"><MaterialThumbnail name={request.materialPreview?.name ?? "Material"} photo={request.materialPreview?.photo_path ? recordPhotoUrl("materials", request.materialPreview.materialId) : null} /><span className="min-w-0"><span className="block font-medium text-slate-800">{request.materialPreview?.name ?? "Material"}</span>{(request.materialPreview?.count ?? 0) > 1 && <span className="mt-0.5 block text-xs text-slate-500">+{(request.materialPreview?.count ?? 0) - 1} more materials</span>}</span></Link></td>
        <td className="px-4 py-4"><p className="font-medium text-slate-800">{request.project?.code ?? "—"} · {request.project?.name ?? "Unavailable project"}</p><p className="mt-1 text-xs text-slate-500">{request.siteName}</p></td>
        <td className="px-4 py-4 text-slate-600">{request.warehouseName}</td><td className="px-4 py-4 text-slate-600">{request.required_date}</td>
        <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === "rejected" ? "bg-red-50 text-red-700" : request.status === "submitted" ? "bg-amber-50 text-amber-800" : "bg-cyan-50 text-cyan-800"}`}>{statusLabels[request.status]}</span></td>
        <td className="px-5 py-4 text-right text-xs text-slate-500">{new Date(request.requested_at).toLocaleDateString("en-PH")}</td>
      </tr>)}</tbody></table>
    </DataTableShell>
    {result.pageCount > 1 && <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Request pages">
      {result.page > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(result.page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
      <span className="px-2 text-xs text-slate-500">Page {result.page} of {result.pageCount}</span>
      {result.page < result.pageCount ? <Button asChild variant="outline" size="sm"><Link href={pageHref(result.page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
    </nav>}
  </>;
}
