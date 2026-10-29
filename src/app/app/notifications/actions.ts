"use server";

import { revalidatePath } from "next/cache";
import { attempt, str, type ActionState } from "@/lib/action";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { requireActor } from "@/lib/session";

export async function markNotificationReadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return attempt(async () => {
    await markNotificationRead(actor, str(fd, "notificationId"));
    revalidatePath("/app/notifications");
    revalidatePath("/app", "layout");
  });
}

export async function markAllNotificationsReadAction(_: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  return attempt(async () => {
    await markAllNotificationsRead(actor);
    revalidatePath("/app/notifications");
    revalidatePath("/app", "layout");
  });
}
