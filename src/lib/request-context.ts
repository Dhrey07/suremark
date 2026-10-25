import "server-only";
import { cookies, headers } from "next/headers";
import { clientIp, regionFromHeaders, type Channel, type VerifyContext } from "./verify";

export async function requestContext(channel: Channel): Promise<VerifyContext> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  return { channel, region: regionFromHeaders(h), deviceKey: jar.get("upa_did")?.value ?? null, clientKey: clientIp(h) };
}

/** Public base URL encoded into printed QR codes. */
export async function publicBaseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
