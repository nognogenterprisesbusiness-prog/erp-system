"use client";

import { useActionState, useOptimistic } from "react";
import { markAllNotificationsReadAction, markAllNotificationsUnreadAction, markNotificationReadAction, type NotificationActionState } from "@/app/(workspace)/notifications/actions";
import { Button } from "@/components/ui/button";

const initialState: NotificationActionState = { message: "", error: "" };
type Action = (state: NotificationActionState, data: FormData) => Promise<NotificationActionState>;

/**
 * Read state is reversible and has no stock or cost effect, so the result shows
 * at once. React discards the optimistic value when the action settles: the
 * revalidated page then shows the committed state, or the error is shown.
 */
function useOptimisticNotificationAction(serverAction: Action) {
  const [state, action] = useActionState(serverAction, initialState);
  const [done, setDone] = useOptimistic(false);
  const submit = (data: FormData) => {
    setDone(true);
    action(data);
  };
  return { state, submit, done };
}

function Feedback({ state, showMessage = true }: { state: NotificationActionState; showMessage?: boolean }) {
  return <>{state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}{showMessage && state.message && <p role="status" className="text-xs text-emerald-700">{state.message}</p>}</>;
}

export function MarkNotificationRead({ id }: { id: string }) {
  const { state, submit, done } = useOptimisticNotificationAction(markNotificationReadAction);
  return <form action={submit} className="flex flex-col items-start gap-1"><input type="hidden" name="id" value={id} /><Button type="submit" size="sm" variant="outline" disabled={done}>{done ? "Marked as read" : "Mark as read"}</Button><Feedback state={state} /></form>;
}

export function MarkAllNotificationsRead() {
  const { state, submit, done } = useOptimisticNotificationAction(markAllNotificationsReadAction);
  return <form action={submit} className="flex flex-col items-start gap-1"><Button type="submit" size="sm" variant="outline" disabled={done}>{done ? "All marked as read" : "Mark all as read"}</Button><Feedback state={state} /></form>;
}

export function MarkAllNotificationsUnread({ compact = false }: { compact?: boolean }) {
  const { state, submit, done } = useOptimisticNotificationAction(markAllNotificationsUnreadAction);
  return <form action={submit} className="flex flex-col items-start gap-1"><Button type="submit" size="sm" variant={compact ? "ghost" : "outline"} disabled={done}>{done ? "All marked as unread" : "Mark all as unread"}</Button><Feedback state={state} showMessage={!compact} /></form>;
}
