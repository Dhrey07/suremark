import { processUssdCallback } from "@/lib/ussd-http";

/** Aggregator webhook. Requests must carry x-ussd-timestamp and x-ussd-signature (HMAC-SHA-256 of "<ts>.<body>"). */
export async function POST(req: Request) {
  const raw = await req.text();
  const res = await processUssdCallback(raw, req.headers.get("x-ussd-timestamp"), req.headers.get("x-ussd-signature"));
  return new Response(res.body, { status: res.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
