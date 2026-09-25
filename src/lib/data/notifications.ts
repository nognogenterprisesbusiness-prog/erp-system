import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/database";

const pageSize = 20;

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

export async function getNotifications(page: number, unreadOnly: boolean) {
  const supabase = await createClient();
  let query = supabase.from("notifications").select("*", { count: "exact" })
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (unreadOnly) query = query.is("read_at", null);
  const { data, count, error } = await query;
  if (error) throw new Error("Unable to load notifications.");
  const notifications = data ?? [];
  const projectIds = [...new Set(notifications.map((item) => item.project_id).filter((id): id is string => Boolean(id)))];
  const warehouseIds = [...new Set(notifications.map((item) => item.warehouse_id).filter((id): id is string => Boolean(id)))];
  const [projects, warehouses] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    warehouseIds.length ? supabase.from("warehouses").select("id,name").in("id", warehouseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (projects.error || warehouses.error) throw new Error("Unable to load notification locations.");
  return { notifications, count: count ?? 0, pageSize,
    projectNames: new Map((projects.data ?? []).map((item) => [item.id, item.name])),
    warehouseNames: new Map((warehouses.data ?? []).map((item) => [item.id, item.name])) };
}

export async function getNotification(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load notification.");
  if (!data) notFound();
  return data;
}
