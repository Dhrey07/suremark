"use server";

import { redirect } from "next/navigation";
import { str, type ActionState } from "@/lib/action";
import { signIn, signOut } from "@/lib/session";

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await signIn(str(fd, "email"), str(fd, "password"));
  if (!res.ok) return { error: "Email or password is incorrect." };
  redirect(res.home);
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
