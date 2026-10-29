"use server";

import { redirect } from "next/navigation";
import { attempt, str, type ActionState } from "@/lib/action";
import { invalid } from "@/lib/errors";
import { resetPassword } from "@/lib/password-reset";

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await attempt(async () => {
    const password = str(fd, "password");
    if (password !== str(fd, "confirmPassword")) throw invalid("Passwords do not match.");
    await resetPassword(str(fd, "token"), password);
  });
  if (result.error) return result;
  redirect("/manufacturer/login");
}
