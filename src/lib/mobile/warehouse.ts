import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { warehouseDispatchSchema, warehouseLocationSchema, warehouseStockSchema, uuidSchema } from "@nognog/domain";
import { z } from "zod";
import type { Database } from "@/types/database";
import { databaseError, MobileError } from "./http";

const pageSize = 20;
type Client = SupabaseClient<Database>;
const searchSchema = z.object({
  warehouseId: uuidSchema,
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().trim().max(80).default(""),
});
const materialSchema = z.object({ code: z.string(), name: z.string(), unitSymbol: z.string() });

export async function readMobileWarehouses(client: Client, actor: string) {
  const assignments = await client.from("warehouse_assignments").select("warehouse_id")
    .eq("user_id", actor).eq("status", "active").order("warehouse_id");
  if (assignments.error) databaseError(assignments.error);
  const ids = assignments.data.map((row) => row.warehouse_id);
  if (!ids.length) return [];
  const [warehouses, locations] = await Promise.all([
    client.from("warehouses").select("id,code,name").in("id", ids).eq("status", "active").order("name").order("id"),
    client.from("inventory_locations").select("id,warehouse_id").in("warehouse_id", ids).eq("location_type", "warehouse"),
  ]);
  if (warehouses.error) databaseError(warehouses.error);
  if (locations.error) databaseError(locations.error);
  const locationIds = new Map(locations.data.map((row) => [row.warehouse_id, row.id]));
  return warehouseLocationSchema.array().parse(warehouses.data.flatMap((warehouse) => {
    const locationId = locationIds.get(warehouse.id);
    return locationId ? [{ ...warehouse, locationId }] : [];
  }));
}

export async function readMobileWarehousePanel(client: Client, actor: string, panel: "stock" | "dispatch", request: Request) {
  const query = searchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new MobileError(400, "Choose a warehouse and check your filters.");
  const { warehouseId, page, search } = query.data;
  const [assignment, warehouse, location] = await Promise.all([
    client.from("warehouse_assignments").select("id").eq("user_id", actor).eq("warehouse_id", warehouseId).eq("status", "active").maybeSingle(),
    client.from("warehouses").select("id").eq("id", warehouseId).eq("status", "active").maybeSingle(),
    client.from("inventory_locations").select("id").eq("warehouse_id", warehouseId).eq("location_type", "warehouse").maybeSingle(),
  ]);
  if (assignment.error) databaseError(assignment.error);
  if (warehouse.error) databaseError(warehouse.error);
  if (location.error) databaseError(location.error);
  if (!assignment.data || !warehouse.data || !location.data)
    throw new MobileError(403, "You no longer have access to this warehouse.");

  const offset = (page - 1) * pageSize;
  if (panel === "dispatch") {
    const result = await client.rpc("list_mobile_warehouse_dispatch", {
      p_warehouse_id: warehouseId, p_offset: offset, p_limit: pageSize + 1,
    });
    if (result.error) databaseError(result.error);
    return warehouseDispatchSchema.parse({ items: result.data.slice(0, pageSize), hasMore: result.data.length > pageSize });
  }

  const result = await client.rpc("list_inventory_balances", {
    p_query: search, p_location_id: location.data.id, p_kind: "warehouse", p_offset: offset, p_limit: pageSize + 1,
  });
  if (result.error) databaseError(result.error);
  const items = result.data.slice(0, pageSize).map((row) => {
    const material = materialSchema.parse(row.material);
    return { id: row.material_id, code: material.code, name: material.name, unit: material.unitSymbol,
      onHand: row.quantity_on_hand, available: row.available_quantity, reserved: row.reserved_quantity };
  });
  return warehouseStockSchema.parse({ items, hasMore: result.data.length > pageSize });
}
