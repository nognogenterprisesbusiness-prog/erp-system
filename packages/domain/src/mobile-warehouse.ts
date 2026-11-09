import { z } from "zod";
import { uuidSchema } from "./common";

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
