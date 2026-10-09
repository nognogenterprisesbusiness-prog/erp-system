import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { readAllPages, readByIds } from "./read-all-pages";
import type { InventoryLocationRow, InventoryTransactionType, MaterialKind } from "@/types/database";
import { inventoryLocationKind, resolveInventoryScope, type InventoryScope } from "@/lib/inventory/scope";

export type MaterialView = { id: string; code: string; name: string; description: string | null; photo_path: string | null; category_id: string; base_unit_id: string; material_kind: MaterialKind; minimum_stock_level: number; is_active: boolean; archived_at: string | null; categoryName: string; unitName: string; unitSymbol: string };
export type LocationView = InventoryLocationRow & { name: string; detail: string; projectId: string | null };

const getLocationViews = cache(async function getLocationViews() {
  const supabase = await createClient();
  const locations = await readAllPages((from, to) => supabase.from("inventory_locations").select("id,location_type,warehouse_id,project_site_id,created_at").order("id").range(from, to), "inventory locations");
  const warehouseIds = locations.flatMap((item) => item.warehouse_id ? [item.warehouse_id] : []);
  const siteIds = locations.flatMap((item) => item.project_site_id ? [item.project_site_id] : []);
  const [warehouses, sites] = await Promise.all([
    readByIds(warehouseIds, (ids, from, to) => supabase.from("warehouses").select("id,code,name,address").in("id", ids).order("id").range(from, to), "warehouses"),
    readByIds(siteIds, (ids, from, to) => supabase.from("project_sites").select("id,name,address,project_id").in("id", ids).order("id").range(from, to), "project sites"),
  ]);
  const warehouseMap = new Map(warehouses.map((item) => [item.id, item]));
  const siteMap = new Map(sites.map((item) => [item.id, item]));
  return locations.map((location): LocationView => {
    const warehouse = location.warehouse_id ? warehouseMap.get(location.warehouse_id) : undefined;
    const site = location.project_site_id ? siteMap.get(location.project_site_id) : undefined;
    return { ...location, name: warehouse?.name ?? site?.name ?? "Unavailable location", detail: warehouse ? `${warehouse.code} · ${warehouse.address}` : site?.address ?? "", projectId: site?.project_id ?? null };
  });
});

export const getMaterialReferences = cache(async function getMaterialReferences() {
  const supabase = await createClient();
  const [categories, units] = await Promise.all([
    readAllPages((from, to) => supabase.from("material_categories").select("id,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").is("archived_at", null).order("name").order("id").range(from, to), "material categories"),
    readAllPages((from, to) => supabase.from("units_of_measure").select("id,code,name,symbol,dimension,decimal_scale,is_active,created_at").eq("is_active", true).order("name").order("id").range(from, to), "units of measure"),
  ]);
  return { categories, units };
});

export async function getMaterialCategories(includeArchived = false) {
  const supabase = await createClient();
  return readAllPages((from, to) => {
    let query = supabase.from("material_categories").select("id,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("name").order("id");
    if (!includeArchived) query = query.is("archived_at", null);
    return query.range(from, to);
  }, "material categories");
}

export async function getMaterials(params: { query?: string; categoryId?: string; status?: "all" | "active" | "inactive"; includeArchived?: boolean } = {}) {
  const supabase = await createClient();
  const search = safeSearchTerm(params.query);
  const [materials, references] = await Promise.all([readAllPages((from, to) => {
    let request = supabase.from("materials").select("id,code,name,description,photo_path,category_id,base_unit_id,material_kind,minimum_stock_level,is_active,archived_at").order("name").order("id");
    if (!params.includeArchived) request = request.is("archived_at", null);
    if (search) request = request.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    if (params.categoryId) request = request.eq("category_id", params.categoryId);
    if (params.status === "active") request = request.eq("is_active", true);
    if (params.status === "inactive") request = request.eq("is_active", false);
    return request.range(from, to);
  }, "materials"), getMaterialReferences()]);
  const categories = new Map(references.categories.map((item) => [item.id, item.name]));
  const units = new Map(references.units.map((item) => [item.id, item]));
  return materials.map((item): MaterialView => ({ ...item, categoryName: categories.get(item.category_id) ?? "Unavailable category", unitName: units.get(item.base_unit_id)?.name ?? "Unavailable unit", unitSymbol: units.get(item.base_unit_id)?.symbol ?? "" }));
}

export async function getMaterial(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const [{ data: material, error }, references] = await Promise.all([
    supabase.from("materials").select("*").eq("id", id).maybeSingle(),
    getMaterialReferences(),
  ]);
  if (error) throw new Error(`Unable to load material: ${error.message}`, { cause: error });
  if (!material) notFound();
  const category = references.categories.find((item) => item.id === material.category_id);
  const unit = references.units.find((item) => item.id === material.base_unit_id);
  const balances = await readAllPages((from, to) => supabase.from("inventory_balances").select("id,material_id,inventory_location_id,quantity_on_hand,reserved_quantity,available_quantity,updated_at").eq("material_id", id).order("updated_at", { ascending: false }).order("id").range(from, to), "material balances");
  const locations = await getLocationViews();
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  return { material, category, unit, references, balances: balances.map((balance) => ({ ...balance, location: locationMap.get(balance.inventory_location_id) })) };
}

// Admin and Finance only; the RPC enforces the same rule.
export async function getMaterialCostBatches(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_material_cost_batches", { p_material_id: id });
  // PGRST202: the batch-costing migration is not applied yet; hide the section.
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error(`Unable to load stock batch prices: ${error.message}`, { cause: error });
  return data ?? [];
}

export async function getInventoryOptions() {
  const supabase = await createClient();
  const [materials, locations, references] = await Promise.all([
    readAllPages((from, to) => supabase.from("materials").select("id,code,name,base_unit_id,material_kind").eq("is_active", true).is("archived_at", null).eq("material_kind", "consumable").order("name").order("id").range(from, to), "active materials"),
    getLocationViews(), getMaterialReferences(),
  ]);
  return { materials, locations, units: references.units };
}

// includeValues (Admin/Finance) adds each balance's stock value; table policies
// return no valuation rows to other roles.
export async function getInventoryBalances(params: { query?: string; locationId?: string; kind?: "all" | "warehouse" | "project_site"; lowStock?: boolean; defaultToFirstLocation?: boolean; page?: number; pageSize?: number; includeValues?: boolean } = {}) {
  const supabase = await createClient();
  const locations = await getLocationViews();
  const allowed = params.kind && params.kind !== "all" ? locations.filter((l) => l.location_type === params.kind) : locations;
  const selectedLocationId = params.locationId || (params.defaultToFirstLocation ? allowed[0]?.id ?? "" : "");
  const page = Number.isSafeInteger(params.page) && params.page! > 0 ? params.page! : 1;
  const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 24));
  if (selectedLocationId && !allowed.some((l) => l.id === selectedLocationId)) return { balances: [], materials: [], locations, selectedLocationId, count: 0 };
  const { data, error } = await supabase.rpc("list_inventory_balances", { p_query: params.query ?? "", p_location_id: selectedLocationId || null, p_kind: params.kind ?? "all", p_low: params.lowStock ?? false, p_offset: (page - 1) * pageSize, p_limit: pageSize });
  if (error) throw new Error("Unable to load inventory balances.", { cause: error });
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const rows = data ?? [];
  // Batched by material so a 500-row export stays within request URL limits.
  const valueRows = params.includeValues && rows.length
    ? await readByIds([...new Set(rows.map((item) => item.material_id))], (batch, from, to) => supabase.from("inventory_valuations").select("id,material_id,inventory_location_id,total_value").in("material_id", batch).order("id").range(from, to), "stock values")
    : [];
  const values = new Map(valueRows.map((item) => [`${item.material_id}:${item.inventory_location_id}`, item.total_value]));
  const balances = rows.map((item) => ({ ...item, material: item.material as MaterialView, location: locationMap.get(item.inventory_location_id), stockValue: values.get(`${item.material_id}:${item.inventory_location_id}`) ?? null }));
  return { balances, materials: balances.map((b) => b.material), locations, selectedLocationId, count: data?.[0]?.total_count ?? 0 };
}

// Warehouse totals by default; site and company summaries remain location-scoped.
// Unstocked catalog materials remain visible as zero.
export async function getInventoryMaterials(params: { query?: string; locationId?: string; scope?: InventoryScope; categoryId?: string; status?: "active" | "inactive" | "all"; lowStock?: boolean; page?: number; pageSize?: number; includeValues?: boolean } = {}) {
  const supabase = await createClient();
  const locations = await getLocationViews();
  const selectedLocationId = params.locationId || "";
  if (selectedLocationId && !locations.some((item) => item.id === selectedLocationId)) notFound();
  const scope = resolveInventoryScope(params.scope, locations);
  const locationKind = selectedLocationId ? "all" : inventoryLocationKind(scope);
  const scopedLocationIds = locations.filter((location) => selectedLocationId
    ? location.id === selectedLocationId : locationKind === "all" || location.location_type === locationKind).map((location) => location.id);
  const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 24));
  let page = Number.isSafeInteger(params.page) && params.page! > 0 ? Math.min(params.page!, 10000) : 1;
  const args = { p_query: safeSearchTerm(params.query), p_location_id: selectedLocationId || null,
    p_category_id: params.categoryId || null, p_status: params.status ?? "active",
    p_low: params.lowStock ?? false, p_limit: pageSize, p_location_kind: locationKind };
  const readPage = async (target: number) => {
    const { data, error } = await supabase.rpc("list_inventory_materials", { ...args, p_offset: (target - 1) * pageSize });
    if (error) throw new Error("Unable to load inventory materials.", { cause: error });
    return data ?? [];
  };
  let rows = await readPage(page);
  let count = Number(rows[0]?.total_count ?? 0);
  if (page > 1 && !rows.length) {
    const first = await readPage(1);
    count = Number(first[0]?.total_count ?? 0);
    page = Math.max(1, Math.ceil(count / pageSize));
    rows = page === 1 ? first : await readPage(page);
  }
  const materialIds = rows.map((item) => item.material_id);
  const [balances, valueRows] = await Promise.all([
    !selectedLocationId && rows.length && scopedLocationIds.length ? readByIds(materialIds, (ids, from, to) => supabase.from("inventory_balances")
      .select("id,material_id,inventory_location_id,quantity_on_hand,available_quantity")
      .in("material_id", ids).in("inventory_location_id", scopedLocationIds).gt("quantity_on_hand", 0).order("id").range(from, to), "material stock locations") : Promise.resolve([]),
    params.includeValues && rows.length && scopedLocationIds.length ? readByIds(materialIds, (ids, from, to) => {
      let query = supabase.from("inventory_valuations").select("id,material_id,total_value,quantity_on_hand")
        .in("material_id", ids).order("id");
      query = query.in("inventory_location_id", scopedLocationIds);
      return query.range(from, to);
    }, "inventory material values") : Promise.resolve([]),
  ]);
  const values = new Map<string, number | null>();
  const valueQuantities = new Map<string, number>();
  for (const item of valueRows) {
    valueQuantities.set(item.material_id, (valueQuantities.get(item.material_id) ?? 0) + Math.round(Number(item.quantity_on_hand) * 10000));
    const previous = values.get(item.material_id) ?? 0;
    if (values.has(item.material_id) && values.get(item.material_id) === null) continue;
    values.set(item.material_id, Number(item.quantity_on_hand) > 0 && item.total_value === null
      ? null : previous + Number(item.total_value ?? 0));
  }
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  const stocks = new Map<string, { id: string; name: string; onHand: number; available: number }[]>();
  for (const balance of balances) {
    const location = locationMap.get(balance.inventory_location_id);
    if (!location) continue;
    const entries = stocks.get(balance.material_id) ?? [];
    entries.push({ id: location.id, name: location.name, onHand: Number(balance.quantity_on_hand), available: Number(balance.available_quantity) });
    stocks.set(balance.material_id, entries);
  }
  return { rows: rows.map((item) => ({ ...item,
    stockValue: Number(item.quantity_on_hand) === 0 ? 0 : valueQuantities.get(item.material_id) === Math.round(Number(item.quantity_on_hand) * 10000) ? values.get(item.material_id) ?? null : null,
    stockLocations: (stocks.get(item.material_id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  })), locations, selectedLocationId, scope, count, page };
}

// includeCosts (Admin/Finance) adds each movement's cost through a guarded RPC;
// the cost columns are not readable from the table itself.
export async function getInventoryTransactions(params: { type?: InventoryTransactionType | "all"; locationId?: string; transactionId?: string; page?: number; includeCosts?: boolean } = {}) {
  const supabase = await createClient();
  const requestedPage = params.page ?? 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const pageSize = 50;
  let request = supabase.from("inventory_transactions").select("id,material_id,quantity,unit_of_measure_id,source_location_id,destination_location_id,transaction_type,transfer_id,transfer_item_id,transfer_phase,reference_document,project_id,responsible_user_id,transaction_date,remarks,reversal_of,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (params.transactionId) { if (!uuidSchema.safeParse(params.transactionId).success) notFound(); request = request.eq("id", params.transactionId); }
  if (params.type && params.type !== "all") request = request.eq("transaction_type", params.type);
  if (params.locationId) {
    const locationId = uuidSchema.safeParse(params.locationId);
    if (!locationId.success) throw new Error("Invalid inventory location filter.");
    request = request.or(`source_location_id.eq.${locationId.data},destination_location_id.eq.${locationId.data}`);
  }
  const [{ data, count, error }, locations] = await Promise.all([
    request.range((page - 1) * pageSize, page * pageSize - 1), getLocationViews(),
  ]);
  if (error) throw new Error("Unable to load inventory transactions.");
  const materialIds = [...new Set((data ?? []).map((item) => item.material_id))];
  const unitIds = [...new Set((data ?? []).map((item) => item.unit_of_measure_id))];
  const actorIds = [...new Set((data ?? []).map((item) => item.responsible_user_id))];
  const projectIds = [...new Set((data ?? []).flatMap((item) => item.project_id ? [item.project_id] : []))];
  const [materialsResult, unitsResult, actorsResult, projectsResult] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id,code,name").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    unitIds.length ? supabase.from("units_of_measure").select("id,symbol").in("id", unitIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [] }),
  ]);
  if (materialsResult.error || unitsResult.error) throw new Error("Unable to resolve inventory transaction details.");
  const ids = (data ?? []).map((item) => item.id);
  const corrections = ids.length ? await readByIds(ids, (batch, from, to) => supabase.from("inventory_transactions").select("reversal_of,remarks").in("reversal_of", batch).order("id").range(from, to), "inventory reversals") : [];
  const links = ids.length ? await readByIds((data ?? []).flatMap((item) => item.transfer_item_id ? [item.transfer_item_id] : []), (batch, from, to) => supabase.from("material_request_dispatches").select("transfer_item_id").in("transfer_item_id", batch).order("transfer_item_id").range(from, to), "request dispatches") : [];
  const transferItems = await readByIds((data ?? []).flatMap((item) => item.transfer_item_id ? [item.transfer_item_id] : []), (batch, from, to) => supabase.from("inventory_transfer_items").select("id,received_quantity,variance_quantity").in("id", batch).order("id").range(from, to), "transfer correction status");
  const itemStatus = new Map(transferItems.map((item) => [item.id, item]));
  const costRows = params.includeCosts && ids.length ? await supabase.rpc("get_inventory_transaction_costs", { p_transaction_ids: ids }) : null;
  // PGRST202: cost function not deployed yet; show the history without costs.
  if (costRows?.error && costRows.error.code !== "PGRST202") throw new Error("Unable to load inventory movement costs.", { cause: costRows.error });
  const costs = new Map((costRows?.data ?? []).map((row) => [row.transaction_id, row]));
  const reversed = new Map(corrections.map((r) => [r.reversal_of, r.remarks]));
  const requestItems = new Set(links.map((r) => r.transfer_item_id));
  const materialMap = new Map((materialsResult.data ?? []).map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  const unitMap = new Map((unitsResult.data ?? []).map((item) => [item.id, item.symbol]));
  const actorMap = new Map((actorsResult.data ?? []).map((item) => [item.id, item.full_name]));
  const projectMap = new Map((projectsResult.data ?? []).map((item) => [item.id, item]));
  return { transactions: (data ?? []).map((item) => ({ ...item, cost_total: costs.get(item.id)?.cost_total ?? null, cost_unit: costs.get(item.id)?.cost_unit ?? null, supplier_name: costs.get(item.id)?.supplier_name ?? null, correctionReason: reversed.get(item.id), canReverse: costs.get(item.id)?.cost_total != null && !reversed.has(item.id) && (item.transaction_type === "STOCK_IN" || item.transaction_type === "STOCK_OUT" || item.transaction_type === "MATERIAL_CONSUMPTION" || item.transfer_phase === "receipt" || (item.transfer_phase === "dispatch" && !requestItems.has(item.transfer_item_id ?? "") && itemStatus.get(item.transfer_item_id ?? "")?.received_quantity === 0 && itemStatus.get(item.transfer_item_id ?? "")?.variance_quantity === 0)), material: materialMap.get(item.material_id), source: item.source_location_id ? locationMap.get(item.source_location_id) : undefined, destination: item.destination_location_id ? locationMap.get(item.destination_location_id) : undefined, unitSymbol: unitMap.get(item.unit_of_measure_id) ?? "", responsibleName: actorMap.get(item.responsible_user_id) ?? "Unavailable user", project: item.project_id ? projectMap.get(item.project_id) : undefined })), locations, count: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / pageSize)) };
}

export async function getInventoryTransfers(page = 1) {
  const supabase = await createClient();
  const pageSize = 25;
  const { data: transfers, count, error } = await supabase.from("inventory_transfers").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("Unable to load transfers.");
  const transferIds = (transfers ?? []).map((transfer) => transfer.id);
  const [{ data: items, error: itemError }, locations] = await Promise.all([
    transferIds.length ? supabase.from("inventory_transfer_items").select("id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity,variance_quantity,created_at,updated_at").in("transfer_id", transferIds) : Promise.resolve({ data: [], error: null }),
    getLocationViews(),
  ]);
  if (itemError) throw new Error("Unable to load transfer items.");
  const itemIds = (items ?? []).map((item) => item.id);
  const materialIds = [...new Set((items ?? []).map((item) => item.material_id))];
  const unitIds = [...new Set((items ?? []).map((item) => item.unit_of_measure_id))];
  const [linksResult, materialsResult, unitsResult] = await Promise.all([
    itemIds.length ? supabase.from("material_request_dispatches").select("request_line_id,transfer_item_id").in("transfer_item_id", itemIds) : Promise.resolve({ data: [], error: null }),
    materialIds.length ? supabase.from("materials").select("id,name").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    unitIds.length ? supabase.from("units_of_measure").select("id,symbol").in("id", unitIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (linksResult.error || materialsResult.error || unitsResult.error) throw new Error("Unable to resolve transfer details.");
  const links = linksResult.data ?? [];
  const linkMap = new Map((links ?? []).map((link) => [link.transfer_item_id, link]));
  const itemMap = new Map((items ?? []).map((item) => [item.transfer_id, item])); const materialMap = new Map((materialsResult.data ?? []).map((item) => [item.id, item])); const unitMap = new Map((unitsResult.data ?? []).map((item) => [item.id, item.symbol])); const locationMap = new Map(locations.map((item) => [item.id, item]));
  return { count: count ?? 0, rows: (transfers ?? []).map((transfer) => { const item = itemMap.get(transfer.id); return { ...transfer, item, requestBound: item ? linkMap.has(item.id) : false, material: item ? { ...materialMap.get(item.material_id), unitSymbol: unitMap.get(item.unit_of_measure_id) ?? "" } : undefined, source: locationMap.get(transfer.source_location_id), destination: locationMap.get(transfer.destination_location_id) }; }) };
}

export async function getUnvaluedOpeningStock() {
  const supabase = await createClient();
  const [valuations, materials, locations] = await Promise.all([
    readAllPages((from, to) => supabase.from("inventory_valuations").select("material_id,inventory_location_id,quantity_on_hand").is("total_value", null).gt("quantity_on_hand", 0).order("material_id").order("inventory_location_id").range(from, to), "unvalued opening stock"),
    getMaterials({ status: "all", includeArchived: true }), getLocationViews(),
  ]);
  const materialMap = new Map(materials.map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  return valuations.map((item) => ({ ...item, material: materialMap.get(item.material_id), location: locationMap.get(item.inventory_location_id) }));
}

export async function getUnvaluedLegacyTransitQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unvalued_legacy_transit_queue");
  if (error) throw new Error("Unable to load legacy in-transit reconciliation queue.");
  return data ?? [];
}

export async function getSiteConsumptionOptions() {
  const supabase = await createClient();
  const [options, projects] = await Promise.all([
    getInventoryOptions(),
    readAllPages((from, to) => supabase.from("projects").select("id,code,name").eq("status", "active").is("archived_at", null).order("name").order("id").range(from, to), "active projects"),
  ]);
  const projectIds = new Set(projects.map((item) => item.id));
  const sites = options.locations.filter((item) => item.location_type === "project_site" && item.projectId && projectIds.has(item.projectId));
  return { ...options, projects, sites, balances: [] as { material_id: string; inventory_location_id: string; available_quantity: number }[] };
}

export async function getProjectMaterialCost(projectId: string) {
  const parsed = uuidSchema.safeParse(projectId);
  if (!parsed.success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_material_cost", { p_project_id: parsed.data });
  if (error) throw new Error(`Unable to load verified project material costs: ${error.message}`, { cause: error });
  return data ?? [];
}
