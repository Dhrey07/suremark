import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "./errors";
import { kms } from "./kms";
import { submitReport } from "./reports";
import { verifyCode, type VerifyResult } from "./verify";

/**
 * USSD adapter (Africa's Talking-style callback: sessionId, serviceCode, phoneNumber, text).
 * Stateless: the menu path is carried in `text` ("1*4827..."), so retries and duplicate session
 * callbacks are safe. Responses start with CON (continue) or END and stay within 182 characters.
 */

export const USSD_SERVICE_CODE = "*347*800#";
const MAX_SKEW_MS = 5 * 60_000;
const MAX_LEN = 182;

export function signUssdRequest(body: string, timestamp: string): string {
  return createHmac("sha256", kms.ussdAggregatorSecret()).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyUssdSignature(body: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false;
  return timingSafeEqual(Buffer.from(signUssdRequest(body, timestamp), "hex"), Buffer.from(signature, "hex"));
}

export type UssdRequest = { sessionId: string; serviceCode: string; phoneNumber: string; text: string };

function clip(s: string) {
  return s.length <= MAX_LEN ? s : s.slice(0, MAX_LEN - 1) + "…";
}

function monthYear(d: string) {
  const [y, m] = d.split("-");
  return `${m}/${y}`;
}

export function ussdResultText(r: VerifyResult): string {
  const p = r.product;
  const b = r.batch;
  switch (r.status) {
    case "issued_no_known_alerts":
      return `ISSUED, NO ALERTS\n${p!.name} ${p!.strength}\nBatch ${b!.lot} Exp ${monthYear(b!.expiryDate)}\nCode can be copied: check pack & seller.${r.history?.previousChecks ? ` Checked ${r.history.previousChecks}x before.` : ""}`;
    case "suspicious":
      return `CAUTION: POSSIBLE COPIED CODE\n${p!.name}\nThis code was checked in a pattern that suggests copying. Do not use if unsure. Dial again, option 2 to report.`;
    case "recalled":
      return `WARNING: RECALLED\n${p!.name} batch ${b!.lot}\n${r.recall?.advice ?? "Do not use. Return to place of purchase."}`;
    case "expired":
      return `WARNING: EXPIRED\n${p!.name} batch ${b!.lot} expired ${monthYear(b!.expiryDate)}. Do not use.`;
    case "not_released":
      return "NOT RELEASED FOR SALE\nDo not use this product. Dial again, option 2 to report where you bought it.";
    case "invalid_code":
      return "Code has a typing error. Codes have 16 digits. Please dial again.";
    case "rate_limited":
      return "Too many attempts. Please try again in a few minutes.";
    case "unavailable":
      return "Service temporarily unavailable. This is NOT a confirmation. Please try later.";
    default:
      return "UNABLE TO VERIFY\nCheck the code and try again. If correct, do not use; dial again, option 2 to report.";
  }
}

export async function handleUssd(req: UssdRequest): Promise<string> {
  const parts = req.text === "" ? [] : req.text.split("*");
  const ctx = { channel: "ussd" as const, region: null, deviceKey: req.phoneNumber, clientKey: req.phoneNumber };

  if (parts.length === 0) {
    return "CON Product Check\n1. Check a product code\n2. Report a suspected fake";
  }
  if (parts[0] === "1") {
    if (parts.length === 1) return "CON Enter the 16-digit code printed on the pack:";
    const r = await verifyCode(parts[1], ctx);
    return `END ${clip(ussdResultText(r))}`;
  }
  if (parts[0] === "2") {
    if (parts.length === 1) return "CON Enter the code on the pack (or 0 if none):";
    if (parts.length === 2) return "CON What looked wrong? (short description)";
    try {
      const res = await submitReport({
        code: parts[1] === "0" ? undefined : parts[1],
        description: parts.slice(2).join(" "),
        channel: "ussd",
        clientKey: req.phoneNumber,
      });
      if (!res.ok) return "END Too many reports. Please try again later.";
      return `END Thank you. Report ref ${res.reference}. Keep the pack and receipt if you can.`;
    } catch (err) {
      if (err instanceof DomainError) return `END ${clip(err.message)}`;
      throw err;
    }
  }
  return "END Invalid option. Please dial again.";
}

