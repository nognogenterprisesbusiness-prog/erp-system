import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { getDailyReportChoices } from "./daily-reports";
import type { MaterialRequestStatus } from "@/types/database";

const PAGE_SIZE = 20;

export async function getMaterialRequestChoices() {
  const user = await requireUser();
  if (!user.canManage && !user.roles.some((role) => ["engineer", "foreman"].includes(role)))
    return { projects: [], sites: [], warehouses: [], links: [], materials: [] };
  const supabase = await createClient();
  const [reportChoices, warehousesResult, materialsResult] = await Promise.all([
    getDailyReportChoices(),
    supabase.rpc("get_requestable_warehouses"),
    supabase.from("materials").select("id,code,name,base_unit_id").eq("is_active", true).eq("material_kind", "consumable").is("archived_at", null).order("name").order("id").range(0, 19),
  ]);
  if (warehousesResult.error || materialsResult.error) throw new Error("Unable to load material request choices.");
  const projectIds = new Set(reportChoices.projects.filter((row) => row.status === "active").map((row) => row.id));
  return {
    projects: reportChoices.projects.filter((row) => row.status === "active"),
    sites: reportChoices.sites.filter((row) => projectIds.has(row.project_id)),
    warehouses: (warehousesResult.data ?? []).filter((row) => projectIds.has(row.project_id)),
    materials: materialsResult.data ?? [],
  };
}

export async function getMaterialRequests(filters: { search?: string; status?: MaterialRequestStatus | "all"; page?: number } = {}) {
  await requireUser();
  const supabase = await createClient();
  const page = Math.min(10_000, Math.max(1, Number.isSafeInteger(filters.page) ? filters.page! : 1));
  let query = supabase.from("material_requests").select("*", { count: "exact" });
  const search = safeSearchTerm(filters.search);
  if (search) query = query.ilike("request_number", `%${search}%`);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const { data, count, error } = await query.order("requested_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load material requests.");
  const rows = data ?? [];
  const requestIds = rows.map((row) => row.id);
  const projectIds = [...new Set(rows.map((row) => row.project_id))];
  const siteIds = [...new Set(rows.map((row) => row.project_site_id))];
  const [projects, sites, lines] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? supabase.from("project_sites").select("id,name").in("id", siteIds) : Promise.resolve({ data: [], error: null }),
    requestIds.length ? supabase.from("material_request_lines").select("id,request_id,material_id").in("request_id", requestIds).order("id") : Promise.resolve({ data: [], error: null }),
  ]);
  if (projects.error || sites.error || lines.error) throw new Error("Unable to resolve request locations.");
  const materialIds = [...new Set((lines.data ?? []).map((line) => line.material_id))];
  const materials = materialIds.length ? await supabase.from("materials").select("id,name,photo_path").in("id", materialIds) : { data: [], error: null };
  if (materials.error) throw new Error("Unable to load request materials.");
  const projectMap = new Map((projects.data ?? []).map((row) => [row.id, row]));
  const siteMap = new Map((sites.data ?? []).map((row) => [row.id, row.name]));
  const materialMap = new Map((materials.data ?? []).map((row) => [row.id, row]));
  const linesByRequest = new Map<string, { materialId: string; count: number }>();
  for (const line of lines.data ?? []) {
    const current = linesByRequest.get(line.request_id);
    linesByRequest.set(line.request_id, { materialId: current?.materialId ?? line.material_id, count: (current?.count ?? 0) + 1 });
  }
  return {
    requests: rows.map((row) => { const preview = linesByRequest.get(row.id); return { ...row, project: projectMap.get(row.project_id), siteName: siteMap.get(row.project_site_id) ?? "Unavailable site", warehouseName: row.source_warehouse_name, materialPreview: preview ? { materialId: preview.materialId, name: materialMap.get(preview.materialId)?.name ?? "Material", photo_path: materialMap.get(preview.materialId)?.photo_path ?? null, count: preview.count } : null }; }),
    count: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getMaterialRequest(id: string) {
  await requireUser();
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("material_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load material request: ${error.message}`, { cause: error });
  if (!request) notFound();
  const [linesResult, eventsResult, projectResult, siteResult] = await Promise.all([
    supabase.from("material_request_lines").select("*").eq("request_id", id).order("id"),
    supabase.from("material_request_events").select("*").eq("request_id", id).order("occurred_at", { ascending: false }),
    supabase.from("projects").select("id,code,name").eq("id", request.project_id).single(),
    supabase.from("project_sites").select("id,name").eq("id", request.project_site_id).single(),
  ]);
  if (linesResult.error || eventsResult.error || projectResult.error || siteResult.error)
    throw new Error("Unable to load the material request details.");
  const lineIds = (linesResult.data ?? []).map((row) => row.id);
  const [dispatchesResult, fulfillmentResult, reservationsResult] = await Promise.all([
    lineIds.length ? supabase.from("material_request_dispatches").select("*").in("request_line_id", lineIds) : Promise.resolve({ data: [], error: null }),
    lineIds.length ? supabase.from("material_request_fulfillment_events").select("*").in("request_line_id", lineIds).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    lineIds.length ? supabase.from("material_request_reservations").select("*").in("request_line_id", lineIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (dispatchesResult.error || fulfillmentResult.error || reservationsResult.error) throw new Error("Unable to load request fulfillment history.");
  const reservationIds = (reservationsResult.data ?? []).map((row) => row.id);
  const reservationEventsResult = reservationIds.length
    ? await supabase.from("material_request_reservation_events").select("*").in("reservation_id", reservationIds).order("occurred_at", { ascending: false })
    : { data: [], error: null };
  if (reservationEventsResult.error) throw new Error("Unable to load reservation history.");
  const itemIds = (dispatchesResult.data ?? []).map((row) => row.transfer_item_id);
  const itemsResult = itemIds.length
    ? await supabase.from("inventory_transfer_items").select("id,transfer_id,dispatched_quantity,received_quantity,variance_quantity").in("id", itemIds)
    : { data: [], error: null };
  const varianceResult = itemIds.length
    ? await supabase.from("inventory_transfer_variances").select("id,transfer_item_id,quantity,reason,approved_by,approved_at").in("transfer_item_id", itemIds)
    : { data: [], error: null };
  if (itemsResult.error || varianceResult.error) throw new Error("Unable to load transfer quantities and variances.");
  const transferIds = [...new Set((itemsResult.data ?? []).map((row) => row.transfer_id))];
  const transfersResult = transferIds.length
    ? await supabase.from("inventory_transfers").select("id,transfer_number,status,dispatched_at").in("id", transferIds)
    : { data: [], error: null };
  if (transfersResult.error) throw new Error("Unable to load request transfers.");
  const itemMap = new Map((itemsResult.data ?? []).map((row) => [row.id, row]));
  const transferMap = new Map((transfersResult.data ?? []).map((row) => [row.id, row]));
  const dispatches = (dispatchesResult.data ?? []).flatMap((row) => {
    const item = itemMap.get(row.transfer_item_id);
    const transfer = item ? transferMap.get(item.transfer_id) : null;
    return item && transfer ? [{ ...row, item, transfer, remainingQuantity: item.dispatched_quantity - item.received_quantity - item.variance_quantity }] : [];
  });
  const materialIds = [...new Set((linesResult.data ?? []).map((row) => row.material_id))];
  const actorIds = [...new Set([request.requested_by, request.decided_by, ...(eventsResult.data ?? []).map((row) => row.actor_id), ...(fulfillmentResult.data ?? []).map((row) => row.actor_id), ...(varianceResult.data ?? []).map((row) => row.approved_by)].filter((id): id is string => Boolean(id)))];
  const [materialsResult, actorsResult, unitsResult] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id,code,name,photo_path").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("units_of_measure").select("id,symbol").limit(100),
  ]);
  if (materialsResult.error || actorsResult.error || unitsResult.error) throw new Error("Unable to load material request references.");
  const materials = new Map((materialsResult.data ?? []).map((row) => [row.id, row]));
  const actors = new Map((actorsResult.data ?? []).map((row) => [row.id, row.full_name]));
  const units = new Map((unitsResult.data ?? []).map((row) => [row.id, row.symbol]));
  const reservations = new Map((reservationsResult.data ?? []).map((row) => [row.request_line_id, row]));
  const reservationLines = new Map((reservationsResult.data ?? []).map((row) => [row.id, (linesResult.data ?? []).find((line) => line.id === row.request_line_id)]));
  return {
    request, project: projectResult.data!, site: siteResult.data!, warehouse: { id: request.source_warehouse_id, name: request.source_warehouse_name },
    lines: (linesResult.data ?? []).map((row) => ({ ...row, material: materials.get(row.material_id), unitSymbol: units.get(row.unit_of_measure_id) ?? "", reservation: reservations.get(row.id) ?? null })),
    events: (eventsResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.actor_id) ?? "Authorized user" })),
    fulfillmentEvents: (fulfillmentResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.actor_id) ?? "Authorized user", materialName: materials.get((linesResult.data ?? []).find((line) => line.id === row.request_line_id)?.material_id ?? "")?.name ?? "Material" })),
    reservationEvents: (reservationEventsResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.actor_id) ?? "Authorized user", materialName: materials.get(reservationLines.get(row.reservation_id)?.material_id ?? "")?.name ?? "Material" })),
    varianceEvents: (varianceResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.approved_by) ?? "Administrator", materialName: materials.get((linesResult.data ?? []).find((line) => (dispatchesResult.data ?? []).some((dispatch) => dispatch.request_line_id === line.id && dispatch.transfer_item_id === row.transfer_item_id))?.material_id ?? "")?.name ?? "Material" })),
    dispatches,
    requesterName: actors.get(request.requested_by) ?? "Authorized user",
    approverName: request.decided_by ? actors.get(request.decided_by) ?? "Authorized manager" : null,
  };
}
