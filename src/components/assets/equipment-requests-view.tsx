import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { IntentLink as Link } from "@/components/layout/intent-link";
import Image from "next/image";
import { uuidSchema } from "@nognog/domain";
import { z } from "zod";
import { EquipmentRequestActions } from "@/components/assets/equipment-request-actions";
import { EquipmentRequestForm } from "@/components/assets/equipment-request-form";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { readAllPages } from "@/lib/data/read-all-pages";
import { safeSearchTerm } from "@/lib/data/search";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentRequestRow } from "@/types/database";
import { RequestTypeFilter } from "@/components/requests/request-type-filter";

const pageSize = 20;
const statuses = ["all", "submitted", "approved", "checked_out", "overdue", "returned", "rejected"] as const;
const statusLabels: Record<(typeof statuses)[number], string> = { all: "All statuses", submitted: "Submitted", approved: "Approved", checked_out: "Checked out", overdue: "Overdue", returned: "Returned", rejected: "Rejected" };

function HandoverRow({ item, isVehicle, photoPath, projectName, siteName, canManage, today }: {
  item: EquipmentRequestRow;
  isVehicle: boolean;
  photoPath: string | null;
  projectName: string;
  siteName: string;
  canManage: boolean;
  today: string;
}) {
  const overdue = item.status === "checked_out" && item.expected_return_on < today;
  return <tr className="align-top">
    <td className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {photoPath ? <Image src={recordPhotoUrl("assets", item.asset_id)} alt={`${item.asset_name} photo`} fill sizes="48px" unoptimized className="object-cover" /> : <span className="sr-only">No photo uploaded</span>}
        </span>
        <div className="min-w-0">
          {canManage || item.status === "checked_out" ? <Link href={`/${isVehicle ? "vehicles" : "equipment"}/${item.asset_id}`} className="font-medium text-slate-800 hover:text-cyan-700">{item.asset_name}</Link> : <span className="font-medium text-slate-800">{item.asset_name}</span>}
          <span className="block text-xs text-slate-500">{item.asset_code}{isVehicle ? " · Vehicle" : ""}</span>
        </div>
      </div>
    </td>
    <td className="px-4 py-4 text-slate-600">{projectName}<span className="block text-xs text-slate-500">{siteName}</span></td>
    <td className="px-4 py-4 text-slate-600">{item.needed_on}<span className={overdue ? "block text-xs font-semibold text-red-700" : "block text-xs text-slate-500"}>Return {item.expected_return_on}{overdue ? " · overdue" : ""}</span></td>
    <td className="max-w-[230px] px-4 py-4 text-slate-600">{item.purpose}{item.decision_note && <span className="block text-xs text-slate-500">Decision: {item.decision_note}</span>}{item.return_note && <span className="block text-xs text-slate-500">Return: {item.return_note}</span>}</td>
    <td className="px-4 py-4"><span className={overdue ? "rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700"}>{overdue ? "Overdue" : item.status.replaceAll("_", " ")}</span></td>
    {canManage && <td className="px-5 py-4 text-right"><EquipmentRequestActions id={item.id} status={item.status} /></td>}
  </tr>;
}

/** Equipment or vehicle request list; the requests page authorizes access and renders the header. */
export async function EquipmentRequestsView({ params, kind, canManage, canRequest, showFilters = true, listingType = kind }: { params: Record<string, string | string[] | undefined>; kind: "equipment" | "vehicle"; canManage: boolean; canRequest: boolean; showFilters?: boolean; listingType?: "all" | "equipment" | "vehicle" }) {
  const requestedProject = uuidSchema.safeParse(params.project);
  const requestedSite = uuidSchema.safeParse(params.site);
  const requestedAsset = uuidSchema.safeParse(params.asset);
  const status = z.enum(statuses).safeParse(params.status);
  const search = typeof params.q === "string" ? params.q.slice(0, 100) : "";
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
    .select("id,asset_id,asset_code,asset_name,project_id,project_site_id,requested_by,needed_on,expected_return_on,purpose,status,decided_by,decided_at,decision_note,source_location_id,checked_out_by,checked_out_at,returned_by,returned_at,return_note,created_at,updated_at,asset:assets!equipment_requests_asset_id_fkey!inner(asset_kind)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id");
  query = query.eq("asset.asset_kind", kind);
  if (projectId) query = query.eq("project_id", projectId);
  if (requestedAsset.success) query = query.eq("asset_id", requestedAsset.data);
  const term = safeSearchTerm(search);
  if (term) query = query.or(`asset_name.ilike.%${term}%,asset_code.ilike.%${term}%`);
  if (currentStatus === "overdue") query = query.eq("status", "checked_out").lt("expected_return_on", today);
  else if (currentStatus !== "all") query = query.eq("status", currentStatus);
  const [{ data: requests, count, error: requestError }, { data: equipment, error: equipmentError }] = await Promise.all([
    query.range((page - 1) * pageSize, page * pageSize - 1),
    canRequest && projectId && siteId ? supabase.rpc("get_requestable_equipment", { p_project_id: projectId, p_project_site_id: siteId }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (requestError || equipmentError) throw new Error("Unable to load equipment requests.");
  const assetIds = [...new Set((requests ?? []).map((item) => item.asset_id))];
  const { data: photos, error: photoError } = assetIds.length ? await supabase.rpc("get_asset_photo_paths", { p_asset_ids: assetIds }) : { data: [], error: null };
  if (photoError) throw new Error("Unable to load equipment requests.");
  const photoPaths = new Map((photos ?? []).map((photo) => [photo.asset_id, photo.photo_path]));
  const projectNames = new Map(projects.map((item) => [item.id, `${item.code} · ${item.name}`]));
  const siteNames = new Map(sites.map((item) => [item.id, item.name]));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (target: number) => { const next = new URLSearchParams(); next.set("type", listingType); if (projectId) next.set("project", projectId); if (siteId) next.set("site", siteId); if (requestedAsset.success) next.set("asset", requestedAsset.data); if (currentStatus !== "all") next.set("status", currentStatus); if (search) next.set("q", search); next.set("page", String(target)); return `/requests?${next}`; };
  return <>
    {requestedAsset.success && <p className="mt-3 text-sm text-slate-600">Showing requests for the scanned asset. <Link href={`/requests?type=${kind}`} className="font-semibold text-cyan-700 hover:underline">Clear asset filter</Link></p>}
    {showFilters && <ListFilterBar>
      {requestedAsset.success && <input type="hidden" name="asset" value={requestedAsset.data} />}
      <RequestTypeFilter defaultValue={kind} />
      <SearchField name="q" label={`Search ${kind}`} defaultValue={search} placeholder={`Search ${kind}`} />
      <div className="min-w-[220px]"><SelectPicker name="project" label="Project" defaultValue={projectId || "all"} options={[{ value: "all", label: "All projects" }, ...activeProjects.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} /></div>
      {canRequest && projectId && <div className="min-w-[180px]"><SelectPicker name="site" label="Site" defaultValue={siteId || "all"} options={[{ value: "all", label: "Select site" }, ...activeSites.map((item) => ({ value: item.id, label: item.name }))]} /></div>}
      <div className="min-w-[180px]"><SelectPicker name="status" label="Status" defaultValue={currentStatus} options={statuses.map((value) => ({ value, label: statusLabels[value] }))} /></div>
    </ListFilterBar>}
    {canRequest && projectId && siteId && <EquipmentRequestForm key={`${projectId}:${siteId}:${kind}`} projectId={projectId} siteId={siteId} equipment={(equipment ?? []).filter((item) => item.asset_kind === kind)} kind={kind} initialAssetId={requestedAsset.success ? requestedAsset.data : ""} />}
    <div className="mt-5"><DataTableShell empty={(requests ?? []).length === 0 ? <EmptyState kind="items" title={`No ${kind} requests`} /> : undefined}>
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className={tableHeadClass}><tr><th className="px-5 py-3">Equipment / vehicle</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Needed / return</th><th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-slate-100">{(requests ?? []).map((item) => (
          <HandoverRow key={item.id} item={item} isVehicle={kind === "vehicle"} photoPath={photoPaths.get(item.asset_id) ?? null} projectName={projectNames.get(item.project_id) ?? "Project"} siteName={siteNames.get(item.project_site_id) ?? "Site"} canManage={canManage} today={today} />
        ))}</tbody>
      </table>
    </DataTableShell></div>
    <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{total} requests</span>{pageCount > 1 && <nav className="flex items-center gap-2" aria-label="Equipment request pages">{page > 1 && <Button size="sm" variant="outline" asChild><Link href={pageHref(page - 1)}>Previous</Link></Button>}<span>Page {page} of {pageCount}</span>{page < pageCount && <Button size="sm" variant="outline" asChild><Link href={pageHref(page + 1)}>Next</Link></Button>}</nav>}</div>
  </>;
}
