"use client";

import { useCallback, useState } from "react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordCreateDialog, useRecordDialog } from "@/components/ui/record-create-dialog";
import { notificationHref, notificationRecordLabel } from "@/lib/notifications/navigation";
import type { NotificationRow } from "@/types/database";
import { NotificationTime } from "./notification-time";
import { MarkNotificationRead } from "./notification-actions";

export type NotificationPreviewData = Pick<NotificationRow, "id" | "title" | "message" | "read_at" | "priority" | "created_at" | "entity_type" | "entity_id" | "project_id" | "warehouse_id">;

export function NotificationPreview({ notification, initialOpen = false, closeHref, onClosed, hideTrigger = false }: { notification: NotificationPreviewData; initialOpen?: boolean; closeHref?: string; onClosed?: () => void; hideTrigger?: boolean }) {
  return <RecordCreateDialog size="sm" title="Notification" triggerLabel="View" triggerAriaLabel={`View ${notification.title}`} triggerVariant="outline" triggerSize="sm" triggerIcon={null} initialOpen={initialOpen} closeHref={closeHref} onClosed={onClosed} hideTrigger={hideTrigger}><NotificationMessage notification={notification} /></RecordCreateDialog>;
}

function NotificationMessage({ notification }: { notification: NotificationPreviewData }) {
  const dialog = useRecordDialog();
  const [read, setRead] = useState(!!notification.read_at);
  const onRead = useCallback(() => setRead(true), []);
  const destination = notificationHref(notification);
  return <article>
    <div className="flex flex-wrap items-center gap-2"><Badge variant={read ? "neutral" : "info"}>{read ? "Read" : "Unread"}</Badge>{notification.priority === "high" && <Badge variant="review">High priority</Badge>}<NotificationTime value={notification.created_at} className="text-xs text-slate-500" /></div>
    <h3 className="mt-4 break-words text-xl font-semibold leading-7">{notification.title}</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{notification.message}</p>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">{!read && <MarkNotificationRead id={notification.id} onRead={onRead} />}{destination && <Button asChild><Link href={destination} onClick={() => dialog?.close()}>{notificationRecordLabel(notification.entity_type)}</Link></Button>}</div>
  </article>;
}
