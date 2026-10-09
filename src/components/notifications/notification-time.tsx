import { formatNotificationTime } from "@/lib/notifications/time";

export function NotificationTime({ value, className }: { value: string; className?: string }) {
  return <time dateTime={value} className={className}>{formatNotificationTime(value)}</time>;
}
