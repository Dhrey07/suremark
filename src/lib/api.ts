import { NextResponse } from "next/server";
import { DomainError } from "./errors";
import { clientIp, regionFromHeaders, type Channel, type VerifyContext } from "./verify";

export function apiContext(req: Request, channel: Channel): VerifyContext {
  return {
    channel,
    region: regionFromHeaders(req.headers),
    deviceKey: req.headers.get("x-device-id"),
    clientKey: clientIp(req.headers),
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function apiError(err: unknown) {
  if (err instanceof DomainError) {
    const status = { not_found: 404, forbidden: 403, conflict: 409, invalid: 422, rate_limited: 429 }[err.code];
    return NextResponse.json({ error: err.code, message: err.message }, { status });
  }
  console.error(err);
  return NextResponse.json({ error: "internal" }, { status: 500 });
}

const STATUS_CODE: Record<string, number> = { rate_limited: 429, unavailable: 503 };
export const statusFor = (status: string) => STATUS_CODE[status] ?? 200;
