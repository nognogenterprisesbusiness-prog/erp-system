export type InventoryScope = "warehouses" | "sites" | "overview";

export function parseInventoryScope(value: unknown): InventoryScope | undefined {
  return value === "warehouses" || value === "sites" || value === "overview" ? value : undefined;
}

export function resolveInventoryScope(value: unknown, locations: readonly { location_type: string }[]): InventoryScope {
  return parseInventoryScope(value) ?? (locations.some((location) => location.location_type === "warehouse") ? "warehouses" : "sites");
}

export function inventoryLocationKind(scope: InventoryScope): "warehouse" | "project_site" | "all" {
  return scope === "warehouses" ? "warehouse" : scope === "sites" ? "project_site" : "all";
}

export function inventoryScopeLabel(scope: InventoryScope): string {
  return scope === "warehouses" ? "All warehouses" : scope === "sites" ? "All sites" : "All locations";
}
