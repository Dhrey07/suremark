"use server";

import { attempt, str, type ActionState } from "@/lib/action";
import { env } from "@/lib/env";
import { createPasswordReset } from "@/lib/password-reset";

export async function requestPasswordResetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const token = await createPasswordReset(str(fd, "email"));
    const demoLink = token && env.demoMode && process.env.NODE_ENV !== "production" ? ` Demo link: /reset-password?token=${token}` : "";
    return { ok: true, message: `If that account exists, password-reset instructions are ready.${demoLink}` };
  });
}
