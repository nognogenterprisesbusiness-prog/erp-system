export type LiveTable =
  | "material_requests"
  | "material_request_lines"
  | "inventory_balances"
  | "inventory_transfers"
  | "inventory_transfer_items"
  | "inventory_transactions"
  | "inventory_stock_counts"
  | "equipment_requests"
  | "assets"
  | "daily_reports"
  | "project_progress_entries"
  | "notifications";

const requestTables = ["material_requests", "material_request_lines", "inventory_balances", "inventory_transfers", "inventory_transfer_items"] as const;

export function liveTablesForPath(pathname: string): readonly LiveTable[] {
  if (pathname === "/requests" || pathname.startsWith("/requests/")) return requestTables;
  if (pathname === "/inventory/transactions") return ["inventory_transactions"];
  if (pathname === "/inventory/transfers") return ["inventory_transfers", "inventory_transfer_items"];
  if (pathname === "/inventory/counts") return ["inventory_stock_counts", "inventory_balances"];
  if (pathname === "/inventory" || pathname.startsWith("/inventory/") || pathname.startsWith("/materials/") || pathname === "/warehouses" || pathname.startsWith("/warehouses/")) return ["inventory_balances"];
  if (pathname === "/equipment/requests") return ["equipment_requests", "assets"];
  if (pathname === "/equipment" || pathname.startsWith("/equipment/")) return ["assets"];
  if (pathname === "/vehicles" || pathname.startsWith("/vehicles/")) return ["assets"];
  if (pathname === "/reports/daily" || pathname.startsWith("/reports/daily/")) return ["daily_reports", "project_progress_entries"];
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return ["notifications"];
  return [];
}

export function refreshIntervalForPath(pathname: string): number | null {
  if (pathname === "/dashboard") return 120_000;
  return liveTablesForPath(pathname).length > 0 ? 90_000 : null;
}
