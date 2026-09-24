"use server";

import { revalidatePath } from "next/cache";
import { notificationIdSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotificationActionState = { message: string; error: string };

export async function markNotificationReadAction(_state: NotificationActionState, formData: FormData): Promise<NotificationActionState> {
  await requireUser();
  const parsed = notificationIdSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { message: "", error: "Invalid notification." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notification_read", { p_notification_id: parsed.data });
  if (error || !data) return { message: "", error: "Notification is unavailable or you no longer have access." };
  revalidatePath("/notifications");
  revalidatePath(`/notifications/${parsed.data}`);
  return { message: "Marked as read.", error: "" };
}

export async function markAllNotificationsReadAction(_state: NotificationActionState): Promise<NotificationActionState> {
  void _state;
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { message: "", error: "Unable to mark notifications as read." };
  revalidatePath("/notifications");
  return { message: data === 0 ? "No unread notifications." : `${data} notification${data === 1 ? "" : "s"} marked as read.`, error: "" };
}

export async function markAllNotificationsUnreadAction(_state: NotificationActionState): Promise<NotificationActionState> {
  void _state;
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_unread");
  if (error) return { message: "", error: "Unable to mark notifications as unread." };
  revalidatePath("/notifications");
  return { message: data === 0 ? "No read notifications." : `${data} notification${data === 1 ? "" : "s"} marked as unread.`, error: "" };
}
