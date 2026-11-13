export type LiveTable =
  | "material_requests"
  | "material_request_lines"
  | "site_purchases"
  | "inventory_balances"
  | "inventory_transfers"
  | "inventory_transfer_items"
  | "inventory_transactions"
  | "inventory_stock_counts"
  | "equipment_requests"
  | "assets"
  | "asset_expenses"
  | "asset_events"
  | "attendance_scans"
  | "live_refresh_signals"
  | "daily_reports"
  | "project_progress_entries"
  | "projects"
  | "project_sites"
  | "project_assignments"
  | "project_attendance"
  | "project_attendance_reversals"
  | "project_equipment_usage"
  | "project_equipment_usage_reversals"
  | "project_additional_expenses"
  | "project_expense_reversals"
  | "project_budget_changes"
  | "client_invoices"
  | "client_payments"
  | "client_payment_reversals"
  | "daily_report_resource_links"
  | "notifications";

const requestTables = ["material_requests", "material_request_lines", "inventory_balances", "inventory_transfers", "inventory_transfer_items"] as const;
const projectTables = ["projects", "project_sites", "project_assignments", "project_progress_entries", "inventory_transactions", "project_attendance", "project_attendance_reversals", "project_equipment_usage", "project_equipment_usage_reversals", "project_additional_expenses", "project_expense_reversals", "project_budget_changes", "client_invoices", "client_payments", "client_payment_reversals", "daily_reports", "daily_report_resource_links"] as const;

export function liveTablesForPath(pathname: string, requestType?: string | null): readonly LiveTable[] {
  if (pathname === "/requests" && (requestType === "equipment" || requestType === "vehicle")) return ["equipment_requests", "assets"];
  if (pathname === "/requests" || pathname.startsWith("/requests/")) return requestTables;
  if (pathname === "/site-purchases" || pathname.startsWith("/site-purchases/")) return ["site_purchases", "inventory_balances"];
  if (pathname === "/inventory/transactions") return ["inventory_transactions"];
  if (pathname === "/inventory/transfers") return ["inventory_transfers", "inventory_transfer_items"];
  if (pathname === "/inventory/counts") return ["inventory_stock_counts", "inventory_balances"];
  if (pathname === "/inventory" || pathname.startsWith("/inventory/") || pathname.startsWith("/materials/") || pathname === "/warehouses" || pathname.startsWith("/warehouses/")) return ["inventory_balances"];
  if (pathname === "/users" || pathname.startsWith("/users/")) return ["live_refresh_signals"];
  if (pathname.startsWith("/equipment/") || pathname.startsWith("/vehicles/")) return ["assets", "asset_expenses", "asset_events", "live_refresh_signals", "project_equipment_usage", "project_equipment_usage_reversals", "site_purchases"];
  if (pathname === "/equipment") return ["assets"];
  if (pathname === "/vehicles") return ["assets"];
  if (pathname.startsWith("/projects/") && /\/attendance(?:\/|$)/.test(pathname)) return ["projects", "project_sites", "project_assignments", "project_attendance", "project_attendance_reversals", "attendance_scans"];
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return projectTables;
  if (pathname === "/attendance") return ["project_attendance", "project_attendance_reversals", "attendance_scans"];
  if (pathname === "/billing" || pathname.startsWith("/billing/")) return ["client_invoices", "client_payments", "client_payment_reversals"];
  if (pathname === "/reports/daily" || pathname.startsWith("/reports/daily/")) return ["daily_reports", "project_progress_entries", "daily_report_resource_links", "project_attendance", "project_equipment_usage", "inventory_transactions"];
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return ["notifications"];
  return [];
}

export function refreshIntervalForPath(pathname: string, requestType?: string | null): number | null {
  if (pathname === "/dashboard") return 120_000;
  return liveTablesForPath(pathname, requestType).length > 0 ? 90_000 : null;
}
