import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { env } from "@/lib/env";
import { manufacturerSignInAction } from "@/app/login/actions";
import { isDatabaseConfigured } from "@/db";

export const metadata: Metadata = { title: "Manufacturer sign in" };

const DEMO_ACCOUNTS = [
  { label: "Organization Owner", email: "manufacturer.owner@demo.test", password: "DemoManufacturer2026!" },
  { label: "Production Manager", email: "production.manager@demo.test", password: "DemoProduction2026!" },
  { label: "QA Officer", email: "qa.officer@demo.test", password: "DemoQuality2026!" },
  { label: "Line Operator", email: "line.operator@demo.test", password: "DemoOperator2026!" },
];

export default function ManufacturerLoginPage() {
  return <AuthPage kind="manufacturer" action={manufacturerSignInAction} databaseConfigured={isDatabaseConfigured()} demoAccounts={env.demoMode && process.env.NODE_ENV !== "production" ? DEMO_ACCOUNTS : []} />;
}
