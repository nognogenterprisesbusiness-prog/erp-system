import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { warehouseDispatchSchema, warehouseLocationSchema, warehouseStockSchema, warehouseOperationsSchema, warehouseOperationCommandSchema, uuidSchema } from "@nognog/domain";
import { z } from "zod";
import type { Database } from "@/types/database";
import { boundedBody, databaseError, MobileError } from "./http";

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

async function requireWarehouse(client: Client, actor: string, warehouseId: string) {
  const locations = await readMobileWarehouses(client, actor);
  if (!locations.some((item) => item.id === warehouseId)) throw new MobileError(403, "You no longer have access to this warehouse.");
}

export async function readMobileWarehouseOperations(client: Client, actor: string, request: Request) {
  const parsed = searchSchema.extend({ mode: z.enum(["release", "receive", "vehicles"]), requestId: uuidSchema.optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new MobileError(400, "Choose a warehouse and operation.");
  const q = parsed.data;
  await requireWarehouse(client, actor, q.warehouseId);
  const args = { p_search: q.search, p_offset: (q.page - 1) * pageSize, p_limit: pageSize + 1 };
  if (q.mode === "vehicles") {
    const vehicles = await client.rpc("get_delivery_vehicle_choices", args);
    if (vehicles.error) databaseError(vehicles.error);
    return warehouseOperationsSchema.parse({ releases: [], receipts: [], vehicles: vehicles.data.slice(0, pageSize), hasMore: vehicles.data.length > pageSize });
  }
  if (q.mode === "release") {
    const releases = await client.rpc("list_request_release_allocations", { ...args, p_warehouse_id: q.warehouseId, p_request_id: q.requestId });
    if (releases.error) databaseError(releases.error);
    return warehouseOperationsSchema.parse({ releases: releases.data.slice(0, pageSize), receipts: [], vehicles: [], hasMore: releases.data.length > pageSize });
  }
  const receipts = await client.rpc("list_mobile_warehouse_receipts", { ...args, p_warehouse_id: q.warehouseId });
  if (receipts.error) databaseError(receipts.error);
  const items = receipts.data.slice(0, pageSize);
  const inspections = items.length ? await client.rpc("get_open_purchase_inspections", { p_line_ids: items.map((item) => item.line_id) }) : { data: [], error: null };
  if (inspections.error) databaseError(inspections.error);
  return warehouseOperationsSchema.parse({ releases: [], vehicles: [], hasMore: receipts.data.length > pageSize,
    receipts: items.map((item) => ({ ...item, inspections: inspections.data.filter((inspection) => inspection.purchase_order_line_id === item.line_id) })),
  });
}

export async function postMobileWarehouseOperation(client: Client, actor: string, request: Request) {
  const bytes = await boundedBody(request, 20_000);
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MobileError(400, "The operation details are invalid."); }
  const parsed = warehouseOperationCommandSchema.safeParse(body);
  if (!parsed.success) throw new MobileError(422, "Check the quantities and delivery details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  await requireWarehouse(client, actor, input.warehouseId);
  if (input.action === "release") {
    const allocation = await client.from("material_request_reservations").select("inventory_location_id").eq("id", input.allocationId).maybeSingle();
    if (allocation.error) databaseError(allocation.error);
    const location = allocation.data ? await client.from("inventory_locations").select("warehouse_id").eq("id", allocation.data.inventory_location_id).maybeSingle() : { data: null, error: null };
    if (location.error) databaseError(location.error);
    if (location.data?.warehouse_id !== input.warehouseId) throw new MobileError(403, "This material allocation belongs to another warehouse.");
    const result = await client.rpc("dispatch_request_allocation_with_manifest", {
      p_idempotency_key: input.idempotencyKey, p_reservation_id: input.allocationId, p_quantity: input.quantity,
      p_transaction_date: input.transactionDate, p_remarks: input.remarks || null,
      p_vehicle_asset_id: input.vehicleAssetId || null, p_vehicle_label: input.vehicleLabel,
      p_driver_name: input.driverName, p_delivery_reference: input.deliveryReference,
    });
    if (result.error) databaseError(result.error);
    return { id: result.data, message: "Materials released. The site can now confirm receipt." };
  }
  const line = await client.from("purchase_order_lines").select("purchase_order_id").eq("id", input.lineId).maybeSingle();
  if (line.error) databaseError(line.error);
  const order = line.data ? await client.from("purchase_orders").select("warehouse_id").eq("id", line.data.purchase_order_id).maybeSingle() : { data: null, error: null };
  if (order.error) databaseError(order.error);
  if (order.data?.warehouse_id !== input.warehouseId) throw new MobileError(403, "This delivery belongs to another warehouse.");
  if (input.action === "receive-inspected") {
    const inspection = await client.from("purchase_delivery_inspections").select("purchase_order_line_id,accepted_quantity,delivery_reference,inspected_on").eq("id", input.inspectionId).maybeSingle();
    if (inspection.error) databaseError(inspection.error);
    if (!inspection.data || inspection.data.purchase_order_line_id !== input.lineId) throw new MobileError(422, "Choose the inspection for this delivery.");
    const result = await client.rpc("receive_purchase_order_line", { p_idempotency_key: input.idempotencyKey, p_line_id: input.lineId,
      p_quantity: inspection.data.accepted_quantity, p_goods_total_cost: null, p_delivery_reference: inspection.data.delivery_reference,
      p_received_on: input.receivedOn, p_cost_variance_reason: null });
    if (result.error) databaseError(result.error);
    return { id: result.data, message: "Accepted materials added to warehouse stock." };
  }
  if (line.data?.purchase_order_id !== input.orderId) throw new MobileError(422, "Choose the correct purchase order.");
  const result = await client.rpc("receive_mobile_purchase_delivery", {
    p_key: input.idempotencyKey, p_line_id: input.lineId, p_delivered: input.deliveredQuantity,
    p_accepted: input.acceptedQuantity, p_reference: input.deliveryReference, p_received_on: input.inspectedOn, p_note: input.qualityNote || null,
  });
  if (result.error) databaseError(result.error);
  return { id: result.data, message: Number(input.acceptedQuantity) > 0 ? "Delivery received. Accepted materials added to warehouse stock." : "Delivery rejected. No stock was added." };
}
