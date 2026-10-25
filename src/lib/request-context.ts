import "server-only";
import { cookies, headers } from "next/headers";
import { env } from "./env";
import { isState } from "./geo";
import { clientIp, regionFromHeaders, type Channel, type VerifyContext } from "./verify";

export const DEMO_REGION_COOKIE = "upa_demo_region";

export async function requestContext(channel: Channel): Promise<VerifyContext> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const demoRegion = jar.get(DEMO_REGION_COOKIE)?.value;
  const region = env.demoMode && isState(demoRegion) ? demoRegion : regionFromHeaders(h);
  return { channel, region, deviceKey: jar.get("upa_did")?.value ?? null, clientKey: clientIp(h) };
}

export async function demoRegion(): Promise<string | null> {
  if (!env.demoMode) return null;
  const v = (await cookies()).get(DEMO_REGION_COOKIE)?.value;
  return isState(v) ? v : null;
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
