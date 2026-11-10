import { z } from "zod";
import { uuidSchema } from "./common";
import { dispatchRequestAllocationSchema } from "./material-requests";
import { inspectPurchaseDeliverySchema } from "./procurement";

export const warehouseLocationSchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  code: z.string(),
  name: z.string(),
});

export const warehouseStockSchema = z.object({
  items: z.array(z.object({
    id: uuidSchema,
    code: z.string(),
    name: z.string(),
    unit: z.string(),
    onHand: z.coerce.number().finite(),
    available: z.coerce.number().finite(),
    reserved: z.coerce.number().finite(),
  })),
  hasMore: z.boolean(),
});

export const warehouseDispatchSchema = z.object({
  items: z.array(z.object({
    id: uuidSchema,
    request_number: z.string(),
    project_name: z.string(),
    site_name: z.string(),
    required_date: z.iso.date(),
    ready_lines: z.coerce.number().int().positive(),
  })),
  hasMore: z.boolean(),
});

export const mobileWarehouseHeader = "x-nognog-warehouse-ui";

export function isMobileWarehouseAccount(roles: readonly string[]) {
  return roles.includes("warehouse_staff") && !roles.some((role) =>
    role === "admin" || role === "engineer" || role === "foreman" || role === "driver",
  );
}

export const warehouseReleaseItemSchema = z.object({
  id: uuidSchema, request_id: uuidSchema, request_number: z.string(),
  project_name: z.string(), site_name: z.string(), material_name: z.string(), material_code: z.string(),
  unit: z.string(), remaining: z.coerce.number().positive(), warehouse_id: uuidSchema, warehouse_name: z.string(),
});
export const warehouseInspectionSchema = z.object({
  id: uuidSchema, delivery_reference: z.string(), accepted_quantity: z.coerce.number().positive(),
  delivered_quantity: z.coerce.number().positive(), quality_note: z.string().nullable(),
});
export const warehouseReceiptItemSchema = z.object({
  line_id: uuidSchema, order_id: uuidSchema, po_number: z.string(), supplier_name: z.string(),
  warehouse_id: uuidSchema, warehouse_name: z.string(), material_name: z.string(), material_code: z.string(),
  unit_symbol: z.string(), remaining_quantity: z.coerce.number().positive(),
  inspections: z.array(warehouseInspectionSchema),
});
export const warehouseOperationsSchema = z.object({
  releases: z.array(warehouseReleaseItemSchema), receipts: z.array(warehouseReceiptItemSchema),
  vehicles: z.array(z.object({ id: uuidSchema, label: z.string() })), hasMore: z.boolean(),
});
export const warehouseReleaseCommandSchema = dispatchRequestAllocationSchema.safeExtend({
  action: z.literal("release"), warehouseId: uuidSchema,
});
export const warehouseReceiveCommandSchema = inspectPurchaseDeliverySchema.safeExtend({
  action: z.literal("receive"), warehouseId: uuidSchema,
});
export const warehouseReceiveInspectedSchema = z.object({
  action: z.literal("receive-inspected"), warehouseId: uuidSchema, idempotencyKey: uuidSchema,
  lineId: uuidSchema, inspectionId: uuidSchema, receivedOn: z.iso.date(),
});
export const warehouseOperationCommandSchema = z.discriminatedUnion("action", [
  warehouseReleaseCommandSchema, warehouseReceiveCommandSchema, warehouseReceiveInspectedSchema,
]);
export type WarehouseOperationCommand = z.infer<typeof warehouseOperationCommandSchema>;
