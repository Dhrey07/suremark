import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { submitReport } from "@/lib/reports";
import { clientIp, regionFromHeaders } from "@/lib/verify";

export async function POST(req: Request) {
  const body = await readJson(req);
  try {
    const res = await submitReport({
      code: typeof body?.code === "string" ? body.code : undefined,
      description: typeof body?.description === "string" ? body.description : "",
      region: typeof body?.region === "string" ? body.region : regionFromHeaders(req.headers),
      channel: "web",
      clientKey: clientIp(req.headers),
    });
    if (!res.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    return NextResponse.json({ reference: res.reference }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
