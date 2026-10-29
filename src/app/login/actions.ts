"use server";

import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/db";
import { str, type ActionState } from "@/lib/action";
import { signIn, signOut } from "@/lib/session";

async function safeSignIn(email: string, password: string, domain?: "platform" | "manufacturer"): Promise<ActionState & { home?: string }> {
  try {
    const result = await signIn(email, password, domain);
    if (!result.ok) return { error: "Email or password is incorrect." };
    return { ok: true, home: result.home };
  } catch (error) {
    console.error("sign-in unavailable", error);
    return {
      error:
        process.env.NODE_ENV !== "production" && !isDatabaseConfigured()
          ? "Sign-in is unavailable because DATABASE_URL is not configured."
          : "Sign-in is temporarily unavailable. Please try again later.",
    };
  }
}

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await safeSignIn(str(fd, "email"), str(fd, "password"));
  if (res.error) return res;
  redirect(res.home!);
}

export async function manufacturerSignInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await safeSignIn(str(fd, "email"), str(fd, "password"), "manufacturer");
  if (res.error) return res;
  redirect(res.home!);
}

export async function platformSignInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await safeSignIn(str(fd, "email"), str(fd, "password"), "platform");
  if (res.error) return res;
  redirect(res.home!);
}

export async function signOutAction() {
  await signOut();
  redirect("/manufacturer/login");
}
