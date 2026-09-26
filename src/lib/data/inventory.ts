import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import type { InventoryLocationRow, InventoryTransactionType, MaterialKind } from "@/types/database";

export type MaterialView = { id: string; code: string; name: string; description: string | null; photo_path: string | null; category_id: string; base_unit_id: string; material_kind: MaterialKind; minimum_stock_level: number; is_active: boolean; archived_at: string | null; categoryName: string; unitName: string; unitSymbol: string };
export type LocationView = InventoryLocationRow & { name: string; detail: string; projectId: string | null };

const getLocationViews = cache(async function getLocationViews() {
  const supabase = await createClient();
  const { data: locations, error } = await supabase.from("inventory_locations").select("id,location_type,warehouse_id,project_site_id,created_at").limit(500);
  if (error) throw new Error("Unable to load inventory locations.");
  const warehouseIds = (locations ?? []).flatMap((item) => item.warehouse_id ? [item.warehouse_id] : []);
  const siteIds = (locations ?? []).flatMap((item) => item.project_site_id ? [item.project_site_id] : []);
  const [{ data: warehouses }, { data: sites }] = await Promise.all([
    warehouseIds.length ? supabase.from("warehouses").select("id,code,name,address").in("id", warehouseIds) : Promise.resolve({ data: [] }),
    siteIds.length ? supabase.from("project_sites").select("id,name,address,project_id").in("id", siteIds) : Promise.resolve({ data: [] }),
  ]);
  const warehouseMap = new Map((warehouses ?? []).map((item) => [item.id, item]));
  const siteMap = new Map((sites ?? []).map((item) => [item.id, item]));
  return (locations ?? []).map((location): LocationView => {
    const warehouse = location.warehouse_id ? warehouseMap.get(location.warehouse_id) : undefined;
    const site = location.project_site_id ? siteMap.get(location.project_site_id) : undefined;
    return { ...location, name: warehouse?.name ?? site?.name ?? "Unavailable location", detail: warehouse ? `${warehouse.code} · ${warehouse.address}` : site?.address ?? "", projectId: site?.project_id ?? null };
  });
});

export const getMaterialReferences = cache(async function getMaterialReferences() {
  const supabase = await createClient();
  const [{ data: categories, error: categoryError }, { data: units, error: unitError }] = await Promise.all([
    supabase.from("material_categories").select("id,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").is("archived_at", null).order("name").limit(500),
    supabase.from("units_of_measure").select("id,code,name,symbol,dimension,decimal_scale,is_active,created_at").eq("is_active", true).order("name").limit(100),
  ]);
  if (categoryError || unitError) throw new Error("Unable to load material reference data.");
  return { categories: categories ?? [], units: units ?? [] };
});

export async function getMaterialCategories(includeArchived = false) {
  const supabase = await createClient();
  let query = supabase.from("material_categories").select("id,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("name").limit(500);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load material categories.");
  return data ?? [];
}

export async function getMaterials(params: { query?: string; categoryId?: string; status?: "all" | "active" | "inactive"; includeArchived?: boolean } = {}) {
  const supabase = await createClient();
  let request = supabase.from("materials").select("id,code,name,description,photo_path,category_id,base_unit_id,material_kind,minimum_stock_level,is_active,archived_at").order("name").limit(500);
  if (!params.includeArchived) request = request.is("archived_at", null);
  const search = safeSearchTerm(params.query);
  if (search) request = request.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  if (params.categoryId) request = request.eq("category_id", params.categoryId);
  if (params.status === "active") request = request.eq("is_active", true);
  if (params.status === "inactive") request = request.eq("is_active", false);
  const [{ data: materials, error }, references] = await Promise.all([request, getMaterialReferences()]);
  if (error) throw new Error("Unable to load materials.");
  const categories = new Map(references.categories.map((item) => [item.id, item.name]));
  const units = new Map(references.units.map((item) => [item.id, item]));
  return (materials ?? []).map((item): MaterialView => ({ ...item, categoryName: categories.get(item.category_id) ?? "Unavailable category", unitName: units.get(item.base_unit_id)?.name ?? "Unavailable unit", unitSymbol: units.get(item.base_unit_id)?.symbol ?? "" }));
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
  const { data: balances, error: balanceError } = await supabase.from("inventory_balances").select("id,material_id,inventory_location_id,quantity_on_hand,reserved_quantity,available_quantity,updated_at").eq("material_id", id).order("updated_at", { ascending: false });
  if (balanceError) throw new Error(`Unable to load material balances: ${balanceError.message}`, { cause: balanceError });
  const locations = await getLocationViews();
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  return { material, category, unit, references, balances: (balances ?? []).map((balance) => ({ ...balance, location: locationMap.get(balance.inventory_location_id) })) };
}

export async function getInventoryOptions() {
  const supabase = await createClient();
  const [{ data: materials, error }, locations, references] = await Promise.all([
    supabase.from("materials").select("id,code,name,base_unit_id,material_kind").eq("is_active", true).is("archived_at", null).eq("material_kind", "consumable").order("name").limit(500),
    getLocationViews(), getMaterialReferences(),
  ]);
  if (error) throw new Error("Unable to load inventory options.");
  return { materials: materials ?? [], locations, units: references.units };
}

export async function getInventoryBalances(params: { query?: string; locationId?: string; kind?: "all" | "warehouse" | "project_site"; lowStock?: boolean; defaultToFirstLocation?: boolean; page?: number; pageSize?: number } = {}) {
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
  const balances = (data ?? []).map((item) => ({ ...item, material: item.material as MaterialView, location: locationMap.get(item.inventory_location_id) }));
  return { balances, materials: balances.map((b) => b.material), locations, selectedLocationId, count: data?.[0]?.total_count ?? 0 };
}

export async function getInventoryTransactions(params: { type?: InventoryTransactionType | "all"; locationId?: string; page?: number } = {}) {
  const supabase = await createClient();
  const requestedPage = params.page ?? 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const pageSize = 50;
  let request = supabase.from("inventory_transactions").select("id,material_id,quantity,unit_of_measure_id,source_location_id,destination_location_id,transaction_type,transfer_id,transfer_item_id,transfer_phase,reference_document,project_id,responsible_user_id,transaction_date,remarks,reversal_of,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id");
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
  const materialMap = new Map((materialsResult.data ?? []).map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  const unitMap = new Map((unitsResult.data ?? []).map((item) => [item.id, item.symbol]));
  const actorMap = new Map((actorsResult.data ?? []).map((item) => [item.id, item.full_name]));
  const projectMap = new Map((projectsResult.data ?? []).map((item) => [item.id, item]));
  return { transactions: (data ?? []).map((item) => ({ ...item, material: materialMap.get(item.material_id), source: item.source_location_id ? locationMap.get(item.source_location_id) : undefined, destination: item.destination_location_id ? locationMap.get(item.destination_location_id) : undefined, unitSymbol: unitMap.get(item.unit_of_measure_id) ?? "", responsibleName: actorMap.get(item.responsible_user_id) ?? "Unavailable user", project: item.project_id ? projectMap.get(item.project_id) : undefined })), locations, count: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / pageSize)) };
}

export async function getInventoryTransfers() {
  const supabase = await createClient();
  const [{ data: transfers, error }, { data: items }, materials, locations] = await Promise.all([
    supabase.from("inventory_transfers").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("inventory_transfer_items").select("id,transfer_id,material_id,unit_of_measure_id,dispatched_quantity,received_quantity,variance_quantity,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
    getMaterials({ status: "all", includeArchived: true }), getLocationViews(),
  ]);
  if (error) throw new Error("Unable to load transfers.");
  const itemIds = (items ?? []).map((item) => item.id);
  const { data: links, error: linksError } = itemIds.length
    ? await supabase.from("material_request_dispatches").select("request_line_id,transfer_item_id").in("transfer_item_id", itemIds)
    : { data: [], error: null };
  if (linksError) throw new Error("Unable to identify request-bound transfers.");
  const linkMap = new Map((links ?? []).map((link) => [link.transfer_item_id, link]));
  const itemMap = new Map((items ?? []).map((item) => [item.transfer_id, item])); const materialMap = new Map(materials.map((item) => [item.id, item])); const locationMap = new Map(locations.map((item) => [item.id, item]));
  return (transfers ?? []).map((transfer) => { const item = itemMap.get(transfer.id); return { ...transfer, item, requestBound: item ? linkMap.has(item.id) : false, material: item ? materialMap.get(item.material_id) : undefined, source: locationMap.get(transfer.source_location_id), destination: locationMap.get(transfer.destination_location_id) }; });
}

export async function getUnvaluedOpeningStock() {
  const supabase = await createClient();
  const [{ data: valuations, error }, materials, locations] = await Promise.all([
    supabase.from("inventory_valuations").select("material_id,inventory_location_id,quantity_on_hand").is("total_value", null).gt("quantity_on_hand", 0).limit(1000),
    getMaterials({ status: "all", includeArchived: true }), getLocationViews(),
  ]);
  if (error) throw new Error("Unable to load stock valuation status.");
  const materialMap = new Map(materials.map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  return (valuations ?? []).map((item) => ({ ...item, material: materialMap.get(item.material_id), location: locationMap.get(item.inventory_location_id) }));
}

export async function getUnvaluedLegacyTransitQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unvalued_legacy_transit_queue");
  if (error) throw new Error("Unable to load legacy in-transit reconciliation queue.");
  return data ?? [];
}

export async function getSiteConsumptionOptions() {
  const supabase = await createClient();
  const [options, { data: projects, error: projectError }] = await Promise.all([
    getInventoryOptions(),
    supabase.from("projects").select("id,code,name").eq("status", "active").is("archived_at", null).order("name").limit(500),
  ]);
  if (projectError) throw new Error("Unable to load available site stock.");
  const projectIds = new Set((projects ?? []).map((item) => item.id));
  const sites = options.locations.filter((item) => item.location_type === "project_site" && item.projectId && projectIds.has(item.projectId));
  return { ...options, projects: projects ?? [], sites, balances: [] as { material_id: string; inventory_location_id: string; available_quantity: number }[] };
}

export async function getProjectMaterialCost(projectId: string) {
  const parsed = uuidSchema.safeParse(projectId);
  if (!parsed.success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_material_cost", { p_project_id: parsed.data });
  if (error) throw new Error(`Unable to load verified project material costs: ${error.message}`, { cause: error });
  return data ?? [];
}
