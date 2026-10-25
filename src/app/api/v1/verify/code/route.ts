import { NextResponse } from "next/server";
import { apiContext, readJson, statusFor } from "@/lib/api";
import { verifyCode } from "@/lib/verify";

export async function POST(req: Request) {
  const body = await readJson(req);
  const code = typeof body?.code === "string" ? body.code : null;
  if (!code) return NextResponse.json({ error: "invalid", message: "Provide { code }" }, { status: 422 });
  const result = await verifyCode(code, apiContext(req, "web"));
  return NextResponse.json(result, { status: statusFor(result.status), headers: { "cache-control": "no-store" } });
}
