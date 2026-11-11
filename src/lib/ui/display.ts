const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const quantities = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });
const dates = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export function displayMoney(value: string | number) { return peso.format(Number(value)); }
export function displayQuantity(value: string | number) { return quantities.format(Number(value)); }
export function displayDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dates.format(date);
}
export function displayStatus(value: string): string {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function projectSiteLabel(project: string | null | undefined, site: string | null | undefined): string {
  const projectName = project?.trim() ?? "";
  const siteName = site?.trim() ?? "";
  return projectName.toLocaleLowerCase("en-PH") === siteName.toLocaleLowerCase("en-PH") ? projectName : [projectName, siteName].filter(Boolean).join(" · ");
}

const auditRecords: Record<string, string> = {
  daily_report_events: "daily report history", daily_reports: "daily report", material_requests: "material request",
  material_request_events: "material request history", project_additional_expenses: "project expense",
  inventory_transactions: "stock movement", assets: "equipment or vehicle", client_invoices: "client invoice",
};
export function auditActivityLabel(action: string, table: string): string {
  const record = auditRecords[table] ?? table.replaceAll("_", " ");
  const verb = ({ insert: "Added", update: "Updated", delete: "Deleted" } as Record<string, string>)[action] ?? displayStatus(action);
  return `${verb} ${record}`;
}
