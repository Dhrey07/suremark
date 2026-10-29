import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { env } from "@/lib/env";
import { platformSignInAction } from "@/app/login/actions";
import { isDatabaseConfigured } from "@/db";

export const metadata: Metadata = { title: "Platform administration sign in" };

const DEMO_ACCOUNTS = [{ label: "Platform Administrator", email: "platform.admin@demo.test", password: "DemoPlatform2026!" }];

export default function PlatformLoginPage() {
  return <AuthPage kind="platform" action={platformSignInAction} databaseConfigured={isDatabaseConfigured()} demoAccounts={env.demoMode && process.env.NODE_ENV !== "production" ? DEMO_ACCOUNTS : []} />;
}
