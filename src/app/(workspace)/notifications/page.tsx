import { IntentLink as Link } from "@/components/layout/intent-link";
import { notificationListQuerySchema } from "@nognog/domain";
import { NotificationTime } from "@/components/notifications/notification-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkAllNotificationsRead, MarkAllNotificationsUnread } from "@/components/notifications/notification-actions";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/data/notifications";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ unread?: string; page?: string }> }) {
  await requireUser();
  const parsed = notificationListQuerySchema.safeParse(await searchParams);
  const { unread, page } = parsed.success ? parsed.data : { unread: "0", page: 1 };
  const unreadOnly = unread === "1";
  const { notifications, count, pageSize, projectNames, warehouseNames } = await getNotifications(page, unreadOnly);
  const pageHref = (next: number) => `/notifications?${new URLSearchParams({ ...(unreadOnly ? { unread: "1" } : {}), page: String(next) })}`;
  return <>
    <PageHeader title="Notifications" action={<div className="flex flex-wrap gap-2"><MarkAllNotificationsRead /><MarkAllNotificationsUnread /></div>} />
    <nav aria-label="Notification filters" className="mt-7 flex gap-2"><Button asChild size="sm" variant={unreadOnly ? "outline" : "default"}><Link href="/notifications">All</Link></Button><Button asChild size="sm" variant={unreadOnly ? "default" : "outline"}><Link href="/notifications?unread=1">Unread</Link></Button></nav>
    {notifications.length === 0 ? <div className="mt-5 rounded-xl border border-slate-200 bg-white"><EmptyState kind="notifications" title={unreadOnly ? "No unread notifications" : "No notifications yet"} /></div> : <ol className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{notifications.map((item) => <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/notifications/${item.id}`} className="text-sm font-semibold hover:text-cyan-700 hover:underline">{item.title}</Link>{!item.read_at && <Badge variant="info">Unread</Badge>}{item.priority === "high" && <Badge variant="review">High priority</Badge>}</div><p className="mt-1 text-xs text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400">{item.project_id && projectNames.get(item.project_id) ? `${projectNames.get(item.project_id)} · ` : ""}{item.warehouse_id && warehouseNames.get(item.warehouse_id) ? `${warehouseNames.get(item.warehouse_id)} · ` : ""}<NotificationTime value={item.created_at} /></p></div><Link href={`/notifications/${item.id}`} className="shrink-0 text-xs font-semibold text-cyan-700 hover:underline">View</Link></li>)}</ol>}
    {count > pageSize && <nav aria-label="Notification pages" className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Page {page} of {Math.ceil(count / pageSize)}</span><div className="flex gap-3">{page > 1 && <Link className="font-medium text-cyan-700 hover:underline" href={pageHref(page - 1)}>Previous</Link>}{page * pageSize < count && <Link className="font-medium text-cyan-700 hover:underline" href={pageHref(page + 1)}>Next</Link>}</div></nav>}
  </>;
}
