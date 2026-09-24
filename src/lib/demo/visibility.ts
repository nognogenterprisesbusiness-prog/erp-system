import { isDemoManager, type DemoData, type DemoRole } from "./schema";

export function visibleDemoProjectIds(tables: DemoData, role: DemoRole, userId: string): Set<string> {
  if (isDemoManager(role) || role === "accounting") return new Set(tables.projects.map((project) => project.id));
  return new Set(tables.projectAssignments.filter((row) => row.userId === userId).map((row) => row.projectId));
}

export function visibleDemoWarehouseIds(tables: DemoData, role: DemoRole, userId: string): Set<string> {
  if (isDemoManager(role)) return new Set(tables.warehouses.map((warehouse) => warehouse.id));
  return new Set(tables.warehouseMemberships.filter((row) => row.userId === userId).map((row) => row.warehouseId));
}

export function visibleDemoEquipmentLocations(tables: DemoData, role: DemoRole, userId: string): Set<string> {
  const projectIds = visibleDemoProjectIds(tables, role, userId);
  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId);
  return new Set([
    ...tables.warehouses.filter((row) => warehouseIds.has(row.id)).map((row) => row.name),
    ...tables.sites.filter((row) => projectIds.has(row.projectId)).map((row) => row.name),
  ]);
}
