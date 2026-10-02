import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { readAllPages, readByIds } from "./read-all-pages";
import { getDailyReportChoices } from "./daily-reports";
import type { MaterialRequestStatus } from "@/types/database";

const PAGE_SIZE = 20;

export async function getMaterialRequestChoices(preferred?: { projectId: string; warehouseId: string; materialId?: string }) {
  const user = await requireUser();
  if (!user.canManage && !user.roles.some((role) => ["engineer", "foreman"].includes(role)))
    return { projects: [], sites: [], warehouses: [], materials: [], requestableMaterials: [], initialStockWarehouseId: "" };
  const supabase = await createClient();
  const [reportChoices, warehousesResult, materialsResult] = await Promise.all([
    getDailyReportChoices(),
    supabase.rpc("get_requestable_warehouses"),
    supabase.from("materials").select("id,code,name,base_unit_id").eq("is_active", true).eq("material_kind", "consumable").is("archived_at", null).order("name").order("id").range(0, 19),
  ]);
  if (warehousesResult.error || materialsResult.error) throw new Error("Unable to load material request choices.");
  const projects = reportChoices.projects.filter((row) => row.status === "active");
  const projectIds = new Set(projects.map((row) => row.id));
  const warehouses = (warehousesResult.data ?? []).filter((row) => projectIds.has(row.project_id));
  const initialWarehouse = warehouses.find((row) => row.project_id === preferred?.projectId && row.warehouse_id === preferred.warehouseId)
    ?? warehouses.find((row) => row.project_id === projects[0]?.id);
  const initialStock = initialWarehouse
    ? await supabase.rpc("search_requestable_warehouse_stock", { p_project_id: initialWarehouse.project_id, p_warehouse_id: initialWarehouse.warehouse_id, p_limit: 20 })
    : { data: [], error: null };
  if (initialStock.error) throw new Error("Unable to load available warehouse materials.");
  const stockRows = [...(initialStock.data ?? [])];
  if (initialWarehouse && preferred?.materialId && !stockRows.some((row) => row.id === preferred.materialId)) {
    const prefilled = await supabase.rpc("search_requestable_warehouse_stock", {
      p_project_id: initialWarehouse.project_id, p_warehouse_id: initialWarehouse.warehouse_id,
      p_material_id: preferred.materialId, p_limit: 1,
    });
    if (prefilled.error) throw new Error("Unable to verify the requested material.");
    stockRows.push(...(prefilled.data ?? []));
  }
  const requestableDetails = stockRows.length
    ? await supabase.from("materials").select("id,code,name,base_unit_id").in("id", stockRows.map((row) => row.id))
    : { data: [], error: null };
  if (requestableDetails.error) throw new Error("Unable to load warehouse material details.");
  const materialById = new Map((requestableDetails.data ?? []).map((row) => [row.id, row]));
  return {
    projects,
    sites: reportChoices.sites.filter((row) => projectIds.has(row.project_id)),
    warehouses,
    initialStockWarehouseId: initialWarehouse?.warehouse_id ?? "",
    materials: materialsResult.data ?? [],
    requestableMaterials: stockRows.flatMap((row) => {
      const material = materialById.get(row.id);
      return material ? [{ ...material, availableQuantity: row.available_quantity }] : [];
    }),
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
  const { data, count, error } = await query.order("requested_at", { ascending: false }).order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load material requests.");
  const rows = data ?? [];
  const requestIds = rows.map((row) => row.id);
  const [contexts, lines] = await Promise.all([
    requestIds.length ? supabase.rpc("get_material_request_context", { p_request_ids: requestIds }) : Promise.resolve({ data: [], error: null }),
    requestIds.length ? supabase.from("material_request_lines").select("id,request_id,material_id").in("request_id", requestIds).order("id") : Promise.resolve({ data: [], error: null }),
  ]);
  if (contexts.error || lines.error || contexts.data?.length !== rows.length) throw new Error("Unable to resolve request locations.");
  const materialIds = [...new Set((lines.data ?? []).map((line) => line.material_id))];
  const materials = materialIds.length ? await supabase.from("materials").select("id,name,photo_path").in("id", materialIds) : { data: [], error: null };
  if (materials.error) throw new Error("Unable to load request materials.");
  const contextMap = new Map((contexts.data ?? []).map((row) => [row.request_id, row]));
  const materialMap = new Map((materials.data ?? []).map((row) => [row.id, row]));
  const linesByRequest = new Map<string, { materialId: string; count: number }>();
  for (const line of lines.data ?? []) {
    const current = linesByRequest.get(line.request_id);
    linesByRequest.set(line.request_id, { materialId: current?.materialId ?? line.material_id, count: (current?.count ?? 0) + 1 });
  }
  return {
    requests: rows.map((row) => {
      const preview = linesByRequest.get(row.id);
      const context = contextMap.get(row.id);
      if (!context) throw new Error("Unable to resolve request location.");
      const material = preview ? materialMap.get(preview.materialId) : null;
      return {
        ...row,
        project: { id: context.project_id, code: context.project_code, name: context.project_name },
        siteName: context.site_name,
        warehouseName: row.source_warehouse_name,
        materialPreview: preview ? { materialId: preview.materialId, name: material?.name ?? "Material", photo_path: material?.photo_path ?? null, count: preview.count } : null,
      };
    }),
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
  const [linesResult, eventsResult, contextResult] = await Promise.all([
    supabase.from("material_request_lines").select("*").eq("request_id", id).order("id"),
    supabase.from("material_request_events").select("*").eq("request_id", id).order("occurred_at", { ascending: false }),
    supabase.rpc("get_material_request_context", { p_request_ids: [id] }),
  ]);
  if (linesResult.error || eventsResult.error || contextResult.error || contextResult.data?.length !== 1)
    throw new Error("Unable to load the material request details.");
  const context = contextResult.data[0];
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
  const [manifestsResult, acceptancesResult] = await Promise.all([
    transferIds.length ? supabase.from("material_delivery_manifests").select("transfer_id,vehicle_label,driver_name,delivery_reference,dispatched_by,created_at").in("transfer_id", transferIds) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? supabase.from("material_delivery_acceptances").select("inventory_transaction_id,transfer_item_id,received_quantity,condition,quality_note,received_by,created_at").in("transfer_item_id", itemIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (manifestsResult.error || acceptancesResult.error) throw new Error("Unable to load delivery checks.");
  const itemMap = new Map((itemsResult.data ?? []).map((row) => [row.id, row]));
  const transferMap = new Map((transfersResult.data ?? []).map((row) => [row.id, row]));
  const corrections = await readByIds((acceptancesResult.data ?? []).map((r) => r.inventory_transaction_id), (ids, from, to) => supabase.from("inventory_corrections").select("original_transaction_id,reason,actor_id,created_at").in("original_transaction_id", ids).order("original_transaction_id").range(from, to), "receipt corrections");
  const correctionMap = new Map(corrections.map((c) => [c.original_transaction_id, c]));
  const manifestMap = new Map((manifestsResult.data ?? []).map((row) => [row.transfer_id, row]));
  const dispatches = (dispatchesResult.data ?? []).flatMap((row) => {
    const item = itemMap.get(row.transfer_item_id);
    const transfer = item ? transferMap.get(item.transfer_id) : null;
    return item && transfer ? [{ ...row, item, transfer, manifest: manifestMap.get(transfer.id), acceptances: (acceptancesResult.data ?? []).filter((entry) => entry.transfer_item_id === item.id), remainingQuantity: item.dispatched_quantity - item.received_quantity - item.variance_quantity }] : [];
  });
  const materialIds = [...new Set((linesResult.data ?? []).map((row) => row.material_id))];
  const actorIds = [...new Set([request.requested_by, request.decided_by, ...(eventsResult.data ?? []).map((row) => row.actor_id), ...(fulfillmentResult.data ?? []).map((row) => row.actor_id), ...(varianceResult.data ?? []).map((row) => row.approved_by), ...(acceptancesResult.data ?? []).map((row) => row.received_by), ...corrections.map((c) => c.actor_id)].filter((id): id is string => Boolean(id)))];
  const [materialsResult, actorsResult, units] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id,code,name,photo_path").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    readAllPages((from, to) => supabase.from("units_of_measure").select("id,symbol").order("id").range(from, to), "request units"),
  ]);
  if (materialsResult.error || actorsResult.error) throw new Error("Unable to load material request references.");
  const materials = new Map((materialsResult.data ?? []).map((row) => [row.id, row]));
  const actors = new Map((actorsResult.data ?? []).map((row) => [row.id, row.full_name]));
  const unitMap = new Map(units.map((row) => [row.id, row.symbol]));
  const reservations = new Map((reservationsResult.data ?? []).map((row) => [row.request_line_id, row]));
  const reservationLines = new Map((reservationsResult.data ?? []).map((row) => [row.id, (linesResult.data ?? []).find((line) => line.id === row.request_line_id)]));
  return {
    request, project: { id: context.project_id, code: context.project_code, name: context.project_name }, site: { id: context.site_id, name: context.site_name }, warehouse: { id: request.source_warehouse_id, name: request.source_warehouse_name },
    lines: (linesResult.data ?? []).map((row) => ({ ...row, material: materials.get(row.material_id), unitSymbol: unitMap.get(row.unit_of_measure_id) ?? "", reservation: reservations.get(row.id) ?? null })),
    events: (eventsResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.actor_id) ?? "Authorized user" })),
    fulfillmentEvents: (fulfillmentResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.actor_id) ?? "Authorized user", materialName: materials.get((linesResult.data ?? []).find((line) => line.id === row.request_line_id)?.material_id ?? "")?.name ?? "Material" })),
    reservationEvents: (reservationEventsResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.actor_id) ?? "Authorized user", materialName: materials.get(reservationLines.get(row.reservation_id)?.material_id ?? "")?.name ?? "Material" })),
    varianceEvents: (varianceResult.data ?? []).map((row) => ({ ...row, actorName: actors.get(row.approved_by) ?? "Administrator", materialName: materials.get((linesResult.data ?? []).find((line) => (dispatchesResult.data ?? []).some((dispatch) => dispatch.request_line_id === line.id && dispatch.transfer_item_id === row.transfer_item_id))?.material_id ?? "")?.name ?? "Material" })),
    correctionEvents: corrections.map((c) => ({ ...c, actorName: actors.get(c.actor_id) ?? "Administrator" })),
    dispatches: dispatches.map((dispatch) => ({ ...dispatch, acceptances: dispatch.acceptances.map((entry) => ({ ...entry, receiverName: actors.get(entry.received_by) ?? "Authorized recipient", correctionReason: correctionMap.get(entry.inventory_transaction_id)?.reason })) })),
    requesterName: actors.get(request.requested_by) ?? "Authorized user",
    approverName: request.decided_by ? actors.get(request.decided_by) ?? "Authorized manager" : null,
  };
}
