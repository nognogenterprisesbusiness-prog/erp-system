import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { z } from "zod";
import { EquipmentRequestActions } from "@/components/assets/equipment-request-actions";
import { EquipmentRequestForm } from "@/components/assets/equipment-request-form";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { readAllPages } from "@/lib/data/read-all-pages";
import { createClient } from "@/lib/supabase/server";

const pageSize = 20;
const statuses = ["all", "submitted", "approved", "checked_out", "overdue", "returned", "rejected"] as const;

export default async function EquipmentRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const canRequest = !user.canManage && user.roles.some((role) => ["engineer", "foreman"].includes(role));
  if (!user.canManage && !canRequest) notFound();
  const params = await searchParams;
  const requestedProject = uuidSchema.safeParse(params.project);
  const requestedSite = uuidSchema.safeParse(params.site);
  const requestedAsset = uuidSchema.safeParse(params.asset);
  const status = z.enum(statuses).safeParse(params.status);
  const rawPage = Number(params.page);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const supabase = await createClient();
  const [projects, sites] = await Promise.all([
    readAllPages((from, to) => supabase.from("projects").select("id,code,name,status").is("archived_at", null).order("code").order("id").range(from, to), "equipment request projects"),
    readAllPages((from, to) => supabase.from("project_sites").select("id,project_id,name,status").order("name").order("id").range(from, to), "equipment request sites"),
  ]);
  const activeProjects = projects.filter((item) => item.status === "active");
  const projectId = requestedProject.success && activeProjects.some((item) => item.id === requestedProject.data) ? requestedProject.data : "";
  const activeSites = sites.filter((item) => item.status === "active" && item.project_id === projectId);
  const siteId = requestedSite.success && activeSites.some((item) => item.id === requestedSite.data) ? requestedSite.data : "";
  const currentStatus = status.success ? status.data : "all";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let query = supabase.from("equipment_requests")
    .select("id,asset_id,asset_code,asset_name,project_id,project_site_id,requested_by,needed_on,expected_return_on,purpose,status,decided_by,decided_at,decision_note,source_location_id,checked_out_by,checked_out_at,returned_by,returned_at,return_note,created_at,updated_at", { count: "exact" })
    .order("created_at", { ascending: false }).order("id");
  if (projectId) query = query.eq("project_id", projectId);
  if (requestedAsset.success) query = query.eq("asset_id", requestedAsset.data);
  if (currentStatus === "overdue") query = query.eq("status", "checked_out").lt("expected_return_on", today);
  else if (currentStatus !== "all") query = query.eq("status", currentStatus);
  const [{ data: requests, count, error: requestError }, { data: equipment, error: equipmentError }] = await Promise.all([
    query.range((page - 1) * pageSize, page * pageSize - 1),
    canRequest && projectId && siteId ? supabase.rpc("get_requestable_equipment", { p_project_id: projectId, p_project_site_id: siteId }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (requestError || equipmentError) throw new Error("Unable to load equipment requests.");
  const projectNames = new Map(projects.map((item) => [item.id, `${item.code} · ${item.name}`]));
  const siteNames = new Map(sites.map((item) => [item.id, item.name]));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (target: number) => { const next = new URLSearchParams(); if (projectId) next.set("project", projectId); if (siteId) next.set("site", siteId); if (requestedAsset.success) next.set("asset", requestedAsset.data); if (currentStatus !== "all") next.set("status", currentStatus); next.set("page", String(target)); return `/equipment/requests?${next}`; };
  return <>
    <PageHeader title={canRequest ? "Equipment requests" : "Equipment handovers"} description={canRequest ? "Request equipment for an assigned project and follow its handover." : "Review project requests, approve handovers, and record returns."} action={<Button variant="outline" asChild><Link href="/equipment">Equipment registry</Link></Button>} />
    {requestedAsset.success && <p className="mt-3 text-sm text-slate-600">Showing requests for the scanned asset. <Link href="/equipment/requests" className="font-semibold text-cyan-700 hover:underline">Clear asset filter</Link></p>}
    <ListFilterBar action="/equipment/requests" className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_170px_auto] lg:items-end">
      {requestedAsset.success && <input type="hidden" name="asset" value={requestedAsset.data} />}
      <label className="grid gap-1 text-xs font-medium text-slate-600">Project<select name="project" defaultValue={projectId} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All projects</option>{activeProjects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Site<select name="site" defaultValue={siteId} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select site</option>{activeSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Status<select name="status" defaultValue={currentStatus} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm">{statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item.replaceAll("_", " ")}</option>)}</select></label>
    </ListFilterBar>
    {canRequest && projectId && siteId && <EquipmentRequestForm key={`${projectId}:${siteId}`} projectId={projectId} siteId={siteId} equipment={equipment ?? []} initialAssetId={requestedAsset.success ? requestedAsset.data : ""} />}
    <div className="mt-5"><DataTableShell empty={(requests ?? []).length === 0 ? <EmptyState kind="items" title="No equipment requests" /> : undefined}>
      <table className="w-full min-w-[960px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Equipment</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Needed / return</th><th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Status</th>{user.canManage && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{(requests ?? []).map((item) => { const overdue = item.status === "checked_out" && item.expected_return_on < today; return <tr key={item.id} className="align-top"><td className="px-5 py-4">{user.canManage || item.status === "checked_out" ? <Link href={`/equipment/${item.asset_id}`} className="font-medium text-slate-800 hover:text-cyan-700">{item.asset_name}</Link> : <span className="font-medium text-slate-800">{item.asset_name}</span>}<span className="block text-xs text-slate-500">{item.asset_code}</span></td><td className="px-4 py-4 text-slate-600">{projectNames.get(item.project_id) ?? "Project"}<span className="block text-xs text-slate-500">{siteNames.get(item.project_site_id) ?? "Site"}</span></td><td className="px-4 py-4 text-slate-600">{item.needed_on}<span className={overdue ? "block text-xs font-semibold text-red-700" : "block text-xs text-slate-500"}>Return {item.expected_return_on}{overdue ? " · overdue" : ""}</span></td><td className="max-w-[230px] px-4 py-4 text-slate-600">{item.purpose}{item.decision_note && <span className="block text-xs text-slate-500">Decision: {item.decision_note}</span>}{item.return_note && <span className="block text-xs text-slate-500">Return: {item.return_note}</span>}</td><td className="px-4 py-4"><span className={overdue ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700"}>{overdue ? "Overdue" : item.status.replaceAll("_", " ")}</span></td>{user.canManage && <td className="px-5 py-4 text-right"><EquipmentRequestActions id={item.id} status={item.status} /></td>}</tr>; })}</tbody></table>
    </DataTableShell></div>
    <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{total} requests</span>{pageCount > 1 && <nav className="flex items-center gap-2" aria-label="Equipment request pages">{page > 1 && <Button size="sm" variant="outline" asChild><Link href={pageHref(page - 1)}>Previous</Link></Button>}<span>Page {page} of {pageCount}</span>{page < pageCount && <Button size="sm" variant="outline" asChild><Link href={pageHref(page + 1)}>Next</Link></Button>}</nav>}</div>
  </>;
}
