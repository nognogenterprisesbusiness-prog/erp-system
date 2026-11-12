import type { Json } from "@/types/database";
import { changedAuditFields } from "./diff";
import { displayDate, displayQuantity, displayStatus } from "@/lib/ui/display";

const recordLabels: Record<string, string> = {
  materials: "Material", inventory_transactions: "Stock movement", inventory_transfers: "Stock transfer",
  warehouses: "Warehouse", warehouse_assignments: "Warehouse assignment", projects: "Project",
  project_sites: "Project site", project_assignments: "Project assignment", employees: "Employee",
  employee_project_assignments: "Worker assignment", assets: "Equipment or vehicle", asset_locations: "Unit location",
  asset_events: "Unit history entry", asset_expenses: "Unit expense", asset_expense_reversals: "Unit expense reversal",
  daily_reports: "Daily report", daily_report_events: "Daily report history entry", material_requests: "Material request",
  material_request_lines: "Requested material", material_request_events: "Request history entry",
  equipment_requests: "Equipment or vehicle request", equipment_request_events: "Unit request history entry",
  qr_codes: "QR label", profiles: "User account", user_roles: "Account role", employee_categories: "Employee category",
  departments: "Department", labor_rates: "Worker rate", equipment_hour_rates: "Unit hourly rate",
  project_attendance: "Posted attendance", attendance_scans: "Attendance scan", employee_attendance_cards: "Employee ID card",
  project_additional_expenses: "Project expense", project_expense_reversals: "Project expense reversal",
  project_budget_changes: "Approved budget adjustment", project_equipment_usage: "Project unit use",
  purchase_orders: "Purchase order", purchase_order_lines: "Purchase item", purchase_order_receipts: "Warehouse receipt",
  site_purchases: "Site purchase", site_purchase_lines: "Site purchase item", suppliers: "Supplier",
  supplier_prices: "Supplier price", supplier_quotations: "Supplier quotation", supplier_payments: "Supplier payment",
  client_invoices: "Client invoice", client_payments: "Client payment", payroll_runs: "Payroll run",
};
export const auditRecordTypes = Object.keys(recordLabels).sort((left, right) => recordLabels[left].localeCompare(recordLabels[right]));
const fieldLabels: Record<string, string> = {
  code: "Code", name: "Name", full_name: "Full name", status: "Status", is_active: "Active account",
  source_warehouse_id: "Source warehouse", warehouse_id: "Warehouse", source_location_id: "From location",
  destination_location_id: "To location", current_location_id: "Current location", project_id: "Project",
  project_site_id: "Project site", employee_id: "Employee", worker_id: "Worker", asset_id: "Equipment or vehicle",
  material_id: "Material", profile_id: "User account", driver_id: "Driver", supplier_id: "Supplier",
  role: "Account role", quantity: "Quantity", requested_quantity: "Requested quantity", approved_quantity: "Approved quantity",
  dispatched_quantity: "Released quantity", received_quantity: "Received quantity", variance_quantity: "Missing or damaged quantity",
  min_stock_level: "Minimum stock", unit_of_measure_id: "Unit of measure", amount: "Amount (PHP)",
  unit_price: "Unit price (PHP)", contract_amount: "Contract amount (PHP)", approved_budget: "Approved budget (PHP)",
  hourly_rate: "Hourly rate (PHP)", daily_rate: "Daily rate (PHP)", cost_total: "Total cost (PHP)",
  hours_worked: "Hours worked", hours_used: "Hours used", needed_on: "Needed by", work_date: "Work date",
  receipt_date: "Receipt date", use_date: "Use date", effective_start_date: "Effective from", reference: "Reference",
  request_number: "Request number", po_number: "Purchase number", purchase_number: "Purchase number",
  invoice_number: "Invoice number", report_number: "Report number", note: "Note", remarks: "Remarks",
  reason: "Reason", summary: "Recorded description", event_type: "History action", start_date: "Start date", end_date: "End date",
  submitted_by: "Submitted by", approved_by: "Approved by", decided_by: "Reviewed by", recorded_by: "Recorded by",
  assigned_by: "Assigned by", ended_by: "Assignment ended by", reversed_by: "Reversed by", vehicle_id: "Vehicle",
  revision: "Report version", submitted_at: "Submitted on", decided_at: "Reviewed on", approved_at: "Approved on",
  requested_by: "Requested by", prepared_by: "Prepared by", dispatched_by: "Released by", received_by: "Received by",
  required_date: "Needed by", source_warehouse_name: "Warehouse name when saved",
};
const systemFields = new Set(["id", "created_at", "updated_at", "occurred_at", "created_by", "updated_by", "actor_id", "idempotency_key", "request_key", "submission_key", "command_key", "command_payload", "submission_payload", "report_snapshot"]);
const moneyFields = /^(amount|unit_price|total_price|total_amount|order_total|contract_amount|approved_budget|hourly_rate|daily_rate|cost_total|budget_delta|hourly_rate_snapshot|daily_rate_snapshot|unit_cost|unit_cost_snapshot|total_cost)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AuditSnapshot = Record<string, Json | undefined>;
export function auditSnapshot(value: Json | null): AuditSnapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function auditRecordLabel(table: string): string { return recordLabels[table] ?? displayStatus(table); }
export function auditActionLabel(action: string): string {
  return ({ insert: "Added", update: "Updated", delete: "Deleted" } as Record<string, string>)[action.toLowerCase()] ?? displayStatus(action);
}
export function auditFieldLabel(field: string): string { return fieldLabels[field] ?? displayStatus(field); }
export function auditRecordName(table: string, oldData: Json | null, newData: Json | null): string {
  const data = { ...auditSnapshot(oldData), ...auditSnapshot(newData) };
  const person = [data.first_name, data.middle_name, data.last_name].filter(value => typeof value === "string" && value).join(" ");
  if (person) return person;
  for (const key of ["request_number", "po_number", "purchase_number", "invoice_number", "report_number", "payroll_number", "transfer_number", "full_name", "name", "supplier_name", "code", "public_identifier"]) {
    if (typeof data[key] === "string" && data[key]) return data[key];
  }
  const reportSnapshot = auditSnapshot(data.report_snapshot ?? null);
  if (typeof reportSnapshot.report_number === "string" && reportSnapshot.report_number) return reportSnapshot.report_number;
  return auditRecordLabel(table);
}
export type AuditReferenceNames = ReadonlyMap<string, string>;
export function auditValue(field: string, value: Json | undefined, names: AuditReferenceNames = new Map()): string {
  if (value === undefined) return "Not recorded";
  if (value === null || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && uuid.test(value)) return names.get(`${field}:${value}`) ?? `Reference ${value}`;
  if (moneyFields.test(field) && (typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)))) return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(value));
  if (typeof value === "number") return displayQuantity(value);
  if (typeof value === "string") {
    if ((field.endsWith("_date") || field.endsWith("_on") || field === "date") && /^\d{4}-\d{2}-\d{2}$/.test(value)) return displayDate(value);
    if (field.endsWith("_at") && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value));
    if (["status", "role", "event_type", "entity_type", "transaction_type", "category", "paid_with", "ownership_type"].includes(field) || field.endsWith("_kind")) return displayStatus(value);
    return value;
  }
  if (Array.isArray(value)) return value.length ? value.map(item => auditValue(field, item, names)).join("; ") : "None";
  return Object.entries(value).map(([key, item]) => `${auditFieldLabel(key)}: ${auditValue(key, item, names)}`).join("\n") || "None";
}
export function auditChanges(oldData: Json | null, newData: Json | null, names: AuditReferenceNames = new Map()) {
  const old = auditSnapshot(oldData), next = auditSnapshot(newData);
  return changedAuditFields(oldData, newData).map(change => {
    let before = auditValue(change.field, old[change.field], names), after = auditValue(change.field, next[change.field], names);
    if (before === after && old[change.field] !== next[change.field]) {
      before += ` (saved value: ${change.before})`;
      after += ` (saved value: ${change.after})`;
    }
    const empty = (value: Json | undefined) => value === null || value === undefined || value === "";
    return { field: change.field, label: auditFieldLabel(change.field), before, after,
      technical: systemFields.has(change.field) || (change.field.endsWith("_id") && !fieldLabels[change.field]) || change.field.endsWith("_key") || change.field.endsWith("_hash") || (empty(old[change.field]) && empty(next[change.field])),
    };
  }).sort((left, right) => Number(right.field === "status") - Number(left.field === "status"));
}
export function auditSummary(action: string, oldData: Json | null, newData: Json | null): string {
  const changes = auditChanges(oldData, newData).filter(change => !change.technical);
  const event = auditSnapshot(newData).event_type;
  if (action.toLowerCase() === "insert" && typeof event === "string") return `Recorded action: ${displayStatus(event)}.`;
  if (action.toLowerCase() === "insert") return "New record saved. View its recorded details.";
  if (action.toLowerCase() === "delete") return "Record deleted. Its previous details remain in this history.";
  if (!changes.length) return "System information updated. View details for the recorded changes.";
  const status = changes.find(change => change.field === "status");
  if (status) return `Status changed from ${status.before} to ${status.after}.${changes.length > 1 ? ` ${changes.length - 1} other ${changes.length === 2 ? "detail" : "details"} changed.` : ""}`;
  const labels = changes.slice(0, 3).map(change => change.label.toLowerCase());
  return `Changed ${labels.join(", ")}${changes.length > 3 ? ` and ${changes.length - 3} more` : ""}.`;
}
