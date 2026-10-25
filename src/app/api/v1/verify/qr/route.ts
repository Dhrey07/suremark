import { NextResponse } from "next/server";
import { apiContext, readJson, statusFor } from "@/lib/api";
import { verifyQr } from "@/lib/verify";

export async function POST(req: Request) {
  const body = await readJson(req);
  const payload = typeof body?.credential === "string" ? body.credential : null;
  if (!payload) return NextResponse.json({ error: "invalid", message: "Provide { credential }" }, { status: 422 });
  const result = await verifyQr(payload, apiContext(req, "qr"));
  return NextResponse.json(result, { status: statusFor(result.status), headers: { "cache-control": "no-store" } });
}
