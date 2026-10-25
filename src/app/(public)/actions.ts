"use server";

import { cookies } from "next/headers";
import { attempt, str, type ActionState } from "@/lib/action";
import { env } from "@/lib/env";
import { isState } from "@/lib/geo";
import { submitReport } from "@/lib/reports";
import { DEMO_REGION_COOKIE, requestContext } from "@/lib/request-context";
import { signUssdRequest } from "@/lib/ussd";
import { processUssdCallback } from "@/lib/ussd-http";
import { verifyCode, verifyQr, type VerifyResult } from "@/lib/verify";

export async function checkCodeAction(_: ActionState, fd: FormData): Promise<ActionState & { result?: VerifyResult }> {
  const result = await verifyCode(str(fd, "code"), await requestContext("web"));
  return { ok: true, result };
}

export async function checkQrAction(payload: string): Promise<VerifyResult> {
  return verifyQr(payload, await requestContext("qr"));
}

export async function setDemoRegionAction(region: string) {
  if (!env.demoMode) return;
  const jar = await cookies();
  if (isState(region)) jar.set(DEMO_REGION_COOKIE, region, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });
  else jar.delete(DEMO_REGION_COOKIE);
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const ctx = await requestContext("web");
    const res = await submitReport({
      code: str(fd, "code"),
      description: str(fd, "description"),
      region: str(fd, "region") || ctx.region,
      channel: "web",
      clientKey: ctx.clientKey,
    });
    if (!res.ok) return { error: "Too many reports from this connection. Please try again later." };
    return { ok: true, message: `Thank you. Your report reference is ${res.reference}. Keep the pack and receipt if you can.` };
  });
}

/** Phone simulator: builds a signed aggregator callback and sends it through the real adapter. */
export async function ussdSimulateAction(sessionId: string, phoneNumber: string, text: string): Promise<string> {
  if (!/^\+234\d{10}$/.test(phoneNumber)) return "END Enter a Nigerian number in the form +234XXXXXXXXXX.";
  const body = new URLSearchParams({ sessionId, serviceCode: "*347*800#", phoneNumber, networkCode: "62130", text }).toString();
  const ts = String(Date.now());
  const res = await processUssdCallback(body, ts, signUssdRequest(body, ts));
  return res.body;
}
