import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import type { AssetCategoryRow, AssetKind, AssetLocationKind, AssetLocationRow, AssetRow, AssetStatus, EquipmentDetailRow, VehicleDetailRow } from "@/types/database";

export type AssetLocationView = AssetLocationRow & { displayName: string; displayAddress: string };
export type AssetView = AssetRow & {
  categoryName: string;
  location: AssetLocationView | undefined;
  equipment: EquipmentDetailRow | undefined;
  vehicle: VehicleDetailRow | undefined;
};

export const getAssetCategories = cache(async function getAssetCategories(kind?: AssetKind, includeArchived = false) {
  const supabase = await createClient();
  let query = supabase.from("asset_categories").select("id,asset_kind,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("asset_kind").order("name").limit(500);
  if (kind) query = query.eq("asset_kind", kind);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load asset categories.");
  return data ?? [];
});

export const getAssetLocations = cache(async function getAssetLocations(includeArchived = false): Promise<AssetLocationView[]> {
  const supabase = await createClient();
  let locationQuery = supabase.from("asset_locations").select("id,location_kind,inventory_location_id,name,address,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("location_kind").order("name").limit(500);
  if (!includeArchived) locationQuery = locationQuery.is("archived_at", null);
  const { data: assetLocations, error } = await locationQuery;
  if (error) throw new Error("Unable to load asset locations.");
  const inventoryIds = (assetLocations ?? []).flatMap((item) => item.inventory_location_id ? [item.inventory_location_id] : []);
  const { data: inventoryLocations, error: inventoryError } = inventoryIds.length
    ? await supabase.from("inventory_locations").select("id,warehouse_id,project_site_id").in("id", inventoryIds)
    : { data: [], error: null };
  if (inventoryError) throw new Error("Unable to resolve asset locations.");
  const warehouseIds = (inventoryLocations ?? []).flatMap((item) => item.warehouse_id ? [item.warehouse_id] : []);
  const siteIds = (inventoryLocations ?? []).flatMap((item) => item.project_site_id ? [item.project_site_id] : []);
  const [{ data: warehouses, error: warehouseError }, { data: sites, error: siteError }] = await Promise.all([
    warehouseIds.length ? supabase.from("warehouses").select("id,code,name,address").in("id", warehouseIds) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? supabase.from("project_sites").select("id,name,address").in("id", siteIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (warehouseError || siteError) throw new Error("Unable to resolve warehouse and site names.");
  const inventoryMap = new Map((inventoryLocations ?? []).map((item) => [item.id, item]));
  const warehouseMap = new Map((warehouses ?? []).map((item) => [item.id, item]));
  const siteMap = new Map((sites ?? []).map((item) => [item.id, item]));
  return (assetLocations ?? []).map((location) => {
    const inventory = location.inventory_location_id ? inventoryMap.get(location.inventory_location_id) : undefined;
    const warehouse = inventory?.warehouse_id ? warehouseMap.get(inventory.warehouse_id) : undefined;
    const site = inventory?.project_site_id ? siteMap.get(inventory.project_site_id) : undefined;
    return { ...location, displayName: location.name ?? warehouse?.name ?? site?.name ?? "Unavailable location", displayAddress: location.address ?? warehouse?.address ?? site?.address ?? "" };
  });
});

export async function getAssetReferences(kind: AssetKind) {
  const [categories, locations] = await Promise.all([getAssetCategories(kind, false), getAssetLocations(false)]);
  return { categories, locations };
}

export async function getAssets(params: { id?: string; kind: AssetKind; query?: string; categoryId?: string; status?: AssetStatus | "all"; locationId?: string; includeArchived?: boolean }) {
  const supabase = await createClient();
  let request = supabase.from("assets").select("id,asset_kind,code,name,description,category_id,brand,model,acquisition_date,ownership_type,status,current_location_id,condition_notes,created_by,updated_by,archived_at,archived_by,created_at,updated_at").eq("asset_kind", params.kind).order("updated_at", { ascending: false }).limit(500);
  if (params.id) request = request.eq("id", params.id);
  if (!params.includeArchived) request = request.is("archived_at", null);
  if (params.categoryId) request = request.eq("category_id", params.categoryId);
  if (params.locationId) request = request.eq("current_location_id", params.locationId);
  if (params.status && params.status !== "all") request = request.eq("status", params.status);
  const search = safeSearchTerm(params.query);
  if (search) request = request.or(`name.ilike.%${search}%,code.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%`);
  const { data: assets, error } = await request;
  if (error) throw new Error(`Unable to load ${params.kind} records.`);
  const ids = (assets ?? []).map((item) => item.id);
  const [categories, locations, detailResult] = await Promise.all([
    getAssetCategories(params.kind, params.includeArchived ?? false),
    getAssetLocations(params.includeArchived ?? false),
    ids.length
      ? params.kind === "equipment"
        ? supabase.from("equipment_details").select("asset_id,equipment_type,serial_number,acquisition_cost,sku").in("asset_id", ids)
        : supabase.from("vehicle_details").select("asset_id,plate_number,manufacture_year,current_mileage").in("asset_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (detailResult.error) throw new Error(`Unable to load ${params.kind} details.`);
  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  const equipmentMap = params.kind === "equipment" ? new Map((detailResult.data ?? []).map((item) => [item.asset_id, item as EquipmentDetailRow])) : new Map<string, EquipmentDetailRow>();
  const vehicleMap = params.kind === "vehicle" ? new Map((detailResult.data ?? []).map((item) => [item.asset_id, item as VehicleDetailRow])) : new Map<string, VehicleDetailRow>();
  return (assets ?? []).map((asset): AssetView => ({ ...asset, categoryName: categoryMap.get(asset.category_id) ?? "Unavailable classification", location: locationMap.get(asset.current_location_id), equipment: equipmentMap.get(asset.id), vehicle: vehicleMap.get(asset.id) }));
}

export async function getAsset(id: string, expectedKind: AssetKind) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const assets = await getAssets({ id, kind: expectedKind, includeArchived: true });
  const asset = assets[0];
  if (!asset) notFound();
  const supabase = await createClient();
  const { data: events, error } = await supabase.from("asset_events").select("id,asset_id,event_type,previous_status,current_status,previous_location_id,current_location_id,summary,details,actor_id,occurred_at").eq("asset_id", id).order("occurred_at", { ascending: false }).limit(100);
  if (error) throw new Error("Unable to load asset history.");
  const actorIds = [...new Set((events ?? []).map((event) => event.actor_id))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id,full_name").in("id", actorIds) : { data: [] };
  const actorMap = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
  const locationMap = new Map((await getAssetLocations(true)).map((location) => [location.id, location]));
  return { asset, events: (events ?? []).map((event) => ({ ...event, actorName: actorMap.get(event.actor_id) ?? "Authorized user", previousLocation: event.previous_location_id ? locationMap.get(event.previous_location_id) : undefined, currentLocation: event.current_location_id ? locationMap.get(event.current_location_id) : undefined })) };
}

export async function getEquipmentUsage(assetId: string) {
  const supabase = await createClient();
  const { data: entries, count, error } = await supabase.from("project_equipment_usage")
    .select("id,project_id,use_date,hours_used,hourly_rate_snapshot,cost_total,work_note", { count: "exact" })
    .eq("asset_id", assetId).order("use_date", { ascending: false }).limit(50);
  if (error) throw new Error("Unable to load equipment usage history.");
  const usageIds = (entries ?? []).map((entry) => entry.id);
  const projectIds = [...new Set((entries ?? []).map((entry) => entry.project_id))];
  const [reversals, projects] = await Promise.all([
    usageIds.length ? supabase.from("project_equipment_usage_reversals").select("usage_id,reason,reversed_at").in("usage_id", usageIds) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reversals.error || projects.error) throw new Error("Unable to resolve equipment usage history.");
  const reversed = new Map((reversals.data ?? []).map((row) => [row.usage_id, row]));
  const projectNames = new Map((projects.data ?? []).map((row) => [row.id, `${row.code} · ${row.name}`]));
  return { rows: (entries ?? []).map((entry) => ({ ...entry, projectName: projectNames.get(entry.project_id) ?? "Project", reversal: reversed.get(entry.id) })), count: count ?? 0 };
}

export type AssetCategory = AssetCategoryRow;
export type AssetLocationKindValue = AssetLocationKind;
