import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { readAllPages, readByIds } from "./read-all-pages";
import type { AssetKind, AssetLocationKind, AssetLocationRow, AssetRow, AssetStatus, EquipmentDetailRow, VehicleDetailRow } from "@/types/database";

export type AssetLocationView = AssetLocationRow & { displayName: string; displayAddress: string };
export type AssetView = AssetRow & {
  typeName: string;
  location: AssetLocationView | undefined;
  equipment: EquipmentDetailRow | undefined;
  vehicle: VehicleDetailRow | undefined;
};

export const getAssetLocations = cache(async function getAssetLocations(includeArchived = false): Promise<AssetLocationView[]> {
  const supabase = await createClient();
  const assetLocations = await readAllPages((from, to) => {
    let query = supabase.from("asset_locations").select("id,location_kind,inventory_location_id,name,address,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("location_kind").order("name").order("id");
    if (!includeArchived) query = query.is("archived_at", null);
    return query.range(from, to);
  }, "asset locations");
  const inventoryIds = assetLocations.flatMap((item) => item.inventory_location_id ? [item.inventory_location_id] : []);
  const inventoryLocations = await readByIds(inventoryIds, (ids, from, to) => supabase.from("inventory_locations").select("id,warehouse_id,project_site_id").in("id", ids).order("id").range(from, to), "asset inventory locations");
  const warehouseIds = inventoryLocations.flatMap((item) => item.warehouse_id ? [item.warehouse_id] : []);
  const siteIds = inventoryLocations.flatMap((item) => item.project_site_id ? [item.project_site_id] : []);
  const [warehouses, sites] = await Promise.all([
    readByIds(warehouseIds, (ids, from, to) => supabase.from("warehouses").select("id,code,name,address").in("id", ids).order("id").range(from, to), "asset warehouses"),
    readByIds(siteIds, (ids, from, to) => supabase.from("project_sites").select("id,name,address").in("id", ids).order("id").range(from, to), "asset sites"),
  ]);
  const inventoryMap = new Map(inventoryLocations.map((item) => [item.id, item]));
  const warehouseMap = new Map(warehouses.map((item) => [item.id, item]));
  const siteMap = new Map(sites.map((item) => [item.id, item]));
  return assetLocations.map((location) => {
    const inventory = location.inventory_location_id ? inventoryMap.get(location.inventory_location_id) : undefined;
    const warehouse = inventory?.warehouse_id ? warehouseMap.get(inventory.warehouse_id) : undefined;
    const site = inventory?.project_site_id ? siteMap.get(inventory.project_site_id) : undefined;
    return { ...location, displayName: location.name ?? warehouse?.name ?? site?.name ?? "Unavailable location", displayAddress: location.address ?? warehouse?.address ?? site?.address ?? "" };
  });
});

export async function getAssetReferences() {
  return { locations: await getAssetLocations(false) };
}

/** Wage/rate-free equipment choices at this project's active sites. The posting RPC rechecks custody. */
export async function getProjectEquipmentChoices(projectId: string) {
  if (!uuidSchema.safeParse(projectId).success) return [];
  const supabase = await createClient();
  const sites = await readAllPages((from, to) => supabase.from("project_sites").select("id").eq("project_id", projectId).eq("status", "active").order("id").range(from, to), "project sites");
  if (!sites.length) return [];
  const inventoryIds: string[] = [];
  for (let offset = 0; offset < sites.length; offset += 100) {
    const siteIds = sites.slice(offset, offset + 100).map((site) => site.id);
    const locations = await readAllPages((from, to) => supabase.from("inventory_locations").select("id").in("project_site_id", siteIds).order("id").range(from, to), "site locations");
    inventoryIds.push(...locations.map((location) => location.id));
  }
  const assetLocationIds: string[] = [];
  for (let offset = 0; offset < inventoryIds.length; offset += 100) {
    const locations = await readAllPages((from, to) => supabase.from("asset_locations").select("id").is("archived_at", null).in("inventory_location_id", inventoryIds.slice(offset, offset + 100)).order("id").range(from, to), "equipment locations");
    assetLocationIds.push(...locations.map((location) => location.id));
  }
  const assets: { id: string; code: string; name: string; kind: AssetKind }[] = [];
  for (let offset = 0; offset < assetLocationIds.length; offset += 100) {
    const rows = await readAllPages((from, to) => supabase.from("assets").select("id,code,name,asset_kind").is("archived_at", null).in("status", ["available", "assigned", "in_use"]).in("current_location_id", assetLocationIds.slice(offset, offset + 100)).order("code").order("id").range(from, to), "project equipment");
    assets.push(...rows.map(({ asset_kind, ...asset }) => ({ ...asset, kind: asset_kind })));
  }
  return assets.sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
}

export async function getAssets(params: { id?: string; kind: AssetKind; query?: string; status?: AssetStatus | "all"; locationId?: string; includeArchived?: boolean; page?: number; pageSize?: number }) {
  const supabase = await createClient();
  let request = supabase.from("assets").select("id,asset_kind,code,name,description,category_id,brand,model,acquisition_date,ownership_type,status,current_location_id,condition_notes,photo_path,created_by,updated_by,archived_at,archived_by,created_at,updated_at").eq("asset_kind", params.kind).order("updated_at", { ascending: false }).order("id");
  if (params.id) request = request.eq("id", params.id);
  if (params.page !== undefined && !params.id) {
    const size = Math.max(1, Math.min(100, Math.floor(params.pageSize ?? 24)));
    const offset = (Math.max(1, Math.floor(params.page)) - 1) * size;
    // One extra row determines whether another page exists without a count query.
    request = request.range(offset, offset + size);
  }
  if (!params.includeArchived) request = request.is("archived_at", null);
  if (params.locationId) request = request.eq("current_location_id", params.locationId);
  if (params.status && params.status !== "all") request = request.eq("status", params.status);
  const search = safeSearchTerm(params.query);
  if (search) request = request.or(`name.ilike.%${search}%,code.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%`);
  const { data: assets, error } = await request;
  if (error) throw new Error(`Unable to load ${params.kind} records.`);
  const ids = (assets ?? []).map((item) => item.id);
  const [locations, detailResult] = await Promise.all([
    getAssetLocations(params.includeArchived ?? false),
    ids.length
      ? params.kind === "equipment"
        ? supabase.from("equipment_details").select("asset_id,equipment_type,serial_number,acquisition_cost,sku").in("asset_id", ids)
        : supabase.from("vehicle_details").select("asset_id,vehicle_type,plate_number,manufacture_year,current_mileage").in("asset_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (detailResult.error) throw new Error(`Unable to load ${params.kind} details.`);
  const locationMap = new Map(locations.map((item) => [item.id, item]));
  const equipmentMap = params.kind === "equipment" ? new Map((detailResult.data ?? []).map((item) => [item.asset_id, item as EquipmentDetailRow])) : new Map<string, EquipmentDetailRow>();
  const vehicleMap = params.kind === "vehicle" ? new Map((detailResult.data ?? []).map((item) => [item.asset_id, item as VehicleDetailRow])) : new Map<string, VehicleDetailRow>();
  return (assets ?? []).map((asset): AssetView => ({ ...asset, typeName: asset.asset_kind === "vehicle" ? vehicleMap.get(asset.id)?.vehicle_type ?? "Vehicle" : equipmentMap.get(asset.id)?.equipment_type ?? "Equipment", location: locationMap.get(asset.current_location_id), equipment: equipmentMap.get(asset.id), vehicle: vehicleMap.get(asset.id) }));
}

export async function getAsset(id: string, expectedKind: AssetKind, eventPage = 1) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const assets = await getAssets({ id, kind: expectedKind, includeArchived: true });
  const asset = assets[0];
  if (!asset) notFound();
  const supabase = await createClient();
  const { data: events, count, error } = await supabase.from("asset_events").select("id,asset_id,event_type,previous_status,current_status,previous_location_id,current_location_id,summary,details,actor_id,occurred_at", { count: "exact" }).eq("asset_id", id).order("occurred_at", { ascending: false }).order("id").range((eventPage - 1) * 20, eventPage * 20 - 1);
  if (error) throw new Error("Unable to load asset history.");
  const actorIds = [...new Set((events ?? []).map((event) => event.actor_id))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id,full_name").in("id", actorIds) : { data: [] };
  const actorMap = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
  const locationMap = new Map((await getAssetLocations(true)).map((location) => [location.id, location]));
  return { asset, eventCount: count ?? 0, eventPage, events: (events ?? []).map((event) => ({ ...event, actorName: actorMap.get(event.actor_id) ?? "Authorized user", previousLocation: event.previous_location_id ? locationMap.get(event.previous_location_id) : undefined, currentLocation: event.current_location_id ? locationMap.get(event.current_location_id) : undefined })) };
}

export async function getEquipmentUsage(assetId: string, page = 1) {
  const supabase = await createClient();
  const { data: entries, count, error } = await supabase.from("project_equipment_usage")
    .select("id,project_id,use_date,hours_used,hourly_rate_snapshot,cost_total,work_note", { count: "exact" })
    .eq("asset_id", assetId).order("use_date", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
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
  return { page, rows: (entries ?? []).map((entry) => ({ ...entry, projectName: projectNames.get(entry.project_id) ?? "Project", reversal: reversed.get(entry.id) })), count: count ?? 0 };
}

export type AssetLocationKindValue = AssetLocationKind;
