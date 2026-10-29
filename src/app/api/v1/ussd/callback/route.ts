import { processUssdCallback } from "@/lib/ussd-http";

/** Authenticated aggregator webhook. Validation is handled by the private provider adapter. */
export async function POST(req: Request) {
  const raw = await req.text();
  const res = await processUssdCallback(raw, req.headers.get("x-ussd-timestamp"), req.headers.get("x-ussd-signature"));
  return new Response(res.body, { status: res.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
