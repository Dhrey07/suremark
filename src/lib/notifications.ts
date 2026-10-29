import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./authz";
import { notFound } from "./errors";

export async function listNotifications(actor: Actor, unreadOnly = false) {
  return getDb().select().from(schema.notifications)
    .where(and(eq(schema.notifications.userId, actor.userId), unreadOnly ? isNull(schema.notifications.readAt) : undefined))
    .orderBy(desc(schema.notifications.createdAt)).limit(100);
}

export async function unreadNotificationCount(actor: Actor) {
  const [row] = await getDb().select({ n: count() }).from(schema.notifications)
    .where(and(eq(schema.notifications.userId, actor.userId), isNull(schema.notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markNotificationRead(actor: Actor, id: string) {
  const rows = await getDb().update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, actor.userId), isNull(schema.notifications.readAt)))
    .returning({ id: schema.notifications.id });
  if (!rows.length) {
    const [owned] = await getDb().select({ id: schema.notifications.id }).from(schema.notifications)
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, actor.userId)));
    if (!owned) throw notFound("Notification not found");
  }
}

export async function markAllNotificationsRead(actor: Actor) {
  await getDb().update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, actor.userId), isNull(schema.notifications.readAt)));
}
