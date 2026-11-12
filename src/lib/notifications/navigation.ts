import type { NotificationRow } from "@/types/database";

export function notificationHref(notification: Pick<NotificationRow, "entity_type" | "entity_id" | "project_id" | "warehouse_id">): string | null {
  if (!notification.entity_id && notification.entity_type !== "system") return null;
  switch (notification.entity_type) {
    case "material": return `/materials/${notification.entity_id}`;
    case "material_request": return `/requests/${notification.entity_id}`;
    case "equipment": return `/equipment/${notification.entity_id}`;
    case "vehicle": return `/vehicles/${notification.entity_id}`;
    case "warehouse": return `/warehouses/${notification.entity_id}`;
    case "project": return `/projects/${notification.entity_id}`;
    case "project_site": return notification.project_id ? `/projects/${notification.project_id}` : null;
    case "daily_report": return `/reports/daily/${notification.entity_id}`;
    case "inventory_transaction": return "/inventory/transactions";
    case "supplier": return `/suppliers/${notification.entity_id}`;
    case "qr_code": return `/qr-codes/${notification.entity_id}`;
    default: return null;
  }
}


export function notificationRecordLabel(entityType: string): string {
  return ({ material: "View material", material_request: "View request", equipment: "View equipment", vehicle: "View vehicle", warehouse: "View warehouse", project: "View project", project_site: "View project", daily_report: "View daily report", inventory_transaction: "View stock history", supplier: "View supplier", qr_code: "View QR label" } as Record<string, string>)[entityType] ?? "View related record";
}
