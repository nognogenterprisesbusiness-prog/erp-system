import "server-only";
import type { Json } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { auditSnapshot } from "./presentation";
import { changedAuditFields } from "./diff";

const references = [
  { table: "warehouses", fields: ["source_warehouse_id", "warehouse_id"], select: "id,name" },
  { table: "projects", fields: ["project_id"], select: "id,name" },
  { table: "project_sites", fields: ["project_site_id"], select: "id,name" },
  { table: "assets", fields: ["asset_id", "vehicle_id"], select: "id,name" },
  { table: "materials", fields: ["material_id"], select: "id,name" },
  { table: "suppliers", fields: ["supplier_id"], select: "id,supplier_name" },
  { table: "profiles", fields: ["profile_id", "driver_id", "submitted_by", "approved_by", "decided_by", "recorded_by", "assigned_by", "ended_by", "reversed_by", "requested_by", "prepared_by", "dispatched_by", "received_by"], select: "id,full_name" },
  { table: "employees", fields: ["employee_id", "worker_id"], select: "id,first_name,middle_name,last_name" },
  { table: "units_of_measure", fields: ["unit_of_measure_id"], select: "id,name,symbol" },
] as const;

/** Resolve only references in this one audit entry, using the same authenticated RLS scope. */
export async function getAuditReferenceNames(oldData: Json | null, newData: Json | null) {
  const supabase = await createClient();
  const snapshots = [auditSnapshot(oldData), auditSnapshot(newData)];
  const changed = new Set(changedAuditFields(oldData, newData).map(change => change.field));
  const names = new Map<string, string>();
  await Promise.all(references.map(async reference => {
    const ids = [...new Set(snapshots.flatMap(snapshot => reference.fields.filter(field => changed.has(field)).flatMap(field => {
      const value = snapshot[field];
      return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? [value] : [];
    })))];
    if (!ids.length) return;
    const { data, error } = await supabase.from(reference.table).select(reference.select).in("id", ids);
    if (error) throw new Error("Unable to load names for the recorded changes.");
    for (const row of data ?? []) {
      if (!("id" in row) || typeof row.id !== "string") continue;
      const label = "full_name" in row && typeof row.full_name === "string" ? row.full_name
        : "supplier_name" in row && typeof row.supplier_name === "string" ? row.supplier_name
        : "name" in row && typeof row.name === "string" ? row.name
        : ["first_name", "middle_name", "last_name"].map(key => key in row ? row[key as keyof typeof row] : null).filter(value => typeof value === "string" && value).join(" ");
      if (label) for (const field of reference.fields) names.set(`${field}:${row.id}`, label);
    }
  }));
  const locationFields = ["source_location_id", "destination_location_id", "current_location_id"];
  const locationIds = [...new Set(snapshots.flatMap(snapshot => locationFields.filter(field => changed.has(field)).flatMap(field => {
    const value = snapshot[field];
    return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? [value] : [];
  })))];
  if (locationIds.length) {
    const locations = await supabase.from("inventory_locations").select("id,warehouse_id,project_site_id").in("id", locationIds);
    if (locations.error) throw new Error("Unable to load recorded locations.");
    const warehouseIds = (locations.data ?? []).flatMap(row => row.warehouse_id ? [row.warehouse_id] : []);
    const siteIds = (locations.data ?? []).flatMap(row => row.project_site_id ? [row.project_site_id] : []);
    const [warehouses, sites] = await Promise.all([
      warehouseIds.length ? supabase.from("warehouses").select("id,name").in("id", warehouseIds) : { data: [], error: null },
      siteIds.length ? supabase.from("project_sites").select("id,name").in("id", siteIds) : { data: [], error: null },
    ]);
    if (warehouses.error || sites.error) throw new Error("Unable to load recorded location names.");
    const labels = new Map([...(warehouses.data ?? []), ...(sites.data ?? [])].map(row => [row.id, row.name]));
    for (const location of locations.data ?? []) {
      const label = labels.get(location.warehouse_id ?? location.project_site_id ?? "");
      if (label) for (const field of locationFields) names.set(`${field}:${location.id}`, label);
    }
  }
  return names;
}
