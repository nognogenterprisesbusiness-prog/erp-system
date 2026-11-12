import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getNotification } from "@/lib/data/notifications";

export default async function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const notification = await getNotification((await params).id);
  redirect(`/notifications?open=${notification.id}`);
}
