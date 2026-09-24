import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkNotificationRead } from "@/components/notifications/notification-actions";
import { requireUser } from "@/lib/auth";
import { getNotification, notificationHref } from "@/lib/data/notifications";
import { notificationIdSchema } from "@nognog/domain";

export default async function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!notificationIdSchema.safeParse(id).success) notFound();
  const notification = await getNotification(id);
  const destination = notificationHref(notification);
  return <div className="max-w-2xl"><Link href="/notifications" className="text-xs font-medium text-cyan-700 hover:underline">← Notifications</Link><article className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2"><Badge variant={notification.read_at ? "neutral" : "info"}>{notification.read_at ? "Read" : "Unread"}</Badge><span className="text-xs text-slate-400">{notification.type_code.replaceAll("_", " ").toLowerCase()}</span></div><h1 className="mt-4 text-2xl font-semibold tracking-tight">{notification.title}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p><time className="mt-4 block text-xs text-slate-400">{new Date(notification.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</time><div className="mt-7 flex flex-wrap items-center gap-3">{destination && <Button asChild><Link href={destination}>Open related record</Link></Button>}{!notification.read_at && <MarkNotificationRead id={notification.id} />}</div></article></div>;
}
