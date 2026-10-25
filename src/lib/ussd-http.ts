import { handleUssd, verifyUssdSignature } from "./ussd";
import { recordDenial } from "./audit";

/** Shared by the public callback route and the in-app phone simulator. */
export async function processUssdCallback(rawBody: string, timestamp: string | null, signature: string | null) {
  if (!verifyUssdSignature(rawBody, timestamp, signature)) {
    await recordDenial({ actorType: "aggregator", action: "ussd.callback", detail: { reason: "bad_signature" } });
    return { status: 401, body: "END Request not authorised." };
  }
  const form = new URLSearchParams(rawBody);
  const phoneNumber = form.get("phoneNumber") ?? "";
  const sessionId = form.get("sessionId") ?? "";
  if (!phoneNumber || !sessionId) return { status: 400, body: "END Invalid request." };
  const body = await handleUssd({ sessionId, serviceCode: form.get("serviceCode") ?? "", phoneNumber, text: form.get("text") ?? "" });
  return { status: 200, body };
}
