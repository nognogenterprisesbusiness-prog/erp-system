"use client";

import { useActionState } from "react";
import { markAllNotificationsReadAction, markAllNotificationsUnreadAction, markNotificationReadAction, type NotificationActionState } from "@/app/(workspace)/notifications/actions";
import { Button } from "@/components/ui/button";

const initialState: NotificationActionState = { message: "", error: "" };

export function MarkNotificationRead({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markNotificationReadAction, initialState);
  return <form action={action} className="flex flex-col items-start gap-1"><input type="hidden" name="id" value={id} /><Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : "Mark as read"}</Button>{state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}{state.message && <p role="status" className="text-xs text-emerald-700">{state.message}</p>}</form>;
}

export function MarkAllNotificationsRead() {
  const [state, action, pending] = useActionState(markAllNotificationsReadAction, initialState);
  return <form action={action} className="flex flex-col items-start gap-1"><Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : "Mark all as read"}</Button>{state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}{state.message && <p role="status" className="text-xs text-emerald-700">{state.message}</p>}</form>;
}

export function MarkAllNotificationsUnread({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState(markAllNotificationsUnreadAction, initialState);
  return <form action={action} className="flex flex-col items-start gap-1"><Button type="submit" size="sm" variant={compact ? "ghost" : "outline"} disabled={pending}>{pending ? "Saving…" : "Mark all as unread"}</Button>{state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}{!compact && state.message && <p role="status" className="text-xs text-emerald-700">{state.message}</p>}</form>;
}
