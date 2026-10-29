import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { listNotifications } from "@/lib/notifications";
import { requireActor } from "@/lib/session";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

export default async function NotificationsPage() {
  const actor = await requireActor();
  const notifications = await listNotifications(actor);
  const hasUnread = notifications.some((n) => !n.readAt);
  return <>
    <PageHeader title="Notifications" description="Operational events delivered to you from real workflow changes." action={hasUnread ? <ActionForm action={markAllNotificationsReadAction}><SubmitButton variant="secondary" size="sm">Mark all read</SubmitButton></ActionForm> : undefined} />
    <Card>
      {notifications.length === 0 ? <EmptyState>No notifications yet.</EmptyState> : <ul className="divide-y divide-slate-100">
        {notifications.map((n) => <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{n.title}</span>{!n.readAt && <Badge tone="violet">Unread</Badge>}</div>
            <p className="mt-1 text-sm text-slate-600">{n.body}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>{formatDateTime(n.createdAt)}</span>{n.href && <Link className="font-medium text-brand-700" href={n.href}>Open record →</Link>}</div>
          </div>
          {!n.readAt && <ActionForm action={markNotificationReadAction}><input type="hidden" name="notificationId" value={n.id} /><SubmitButton variant="ghost" size="sm">Mark read</SubmitButton></ActionForm>}
        </li>)}
      </ul>}
    </Card>
  </>;
}
