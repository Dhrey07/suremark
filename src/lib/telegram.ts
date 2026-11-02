import { createHash, timingSafeEqual } from "node:crypto";
import { formatDate } from "./dates";
import { env } from "./env";
import { hit } from "./ratelimit";
import { verifyCode, type VerifyContext, type VerifyResult } from "./verify";

/**
 * Telegram bot adapter. Telegram POSTs each Update to the webhook; the reply is returned in the
 * webhook response body as a sendMessage call, so the bot token is only used to register the
 * webhook. Codes go through the same verification engine as QR, web and USSD.
 */

type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot?: boolean };
  text?: string;
  caption?: string;
  photo?: unknown[];
};

export type TelegramUpdate = { update_id: number; message?: TelegramMessage };

export type TelegramReply = {
  method: "sendMessage";
  chat_id: number;
  text: string;
  parse_mode: "HTML";
  link_preview_options: { is_disabled: true };
  reply_parameters: { message_id: number; allow_sending_without_reply: true };
};

export const TELEGRAM_COMMANDS = [
  { command: "check", description: "Check the 16-digit code printed on a pack" },
  { command: "help", description: "How product checks work" },
];

const ICON: Record<VerifyResult["status"], string> = {
  issued_no_known_alerts: "✅",
  suspicious: "⚠️",
  not_released: "⚠️",
  expired: "⛔",
  recalled: "⛔",
  unable_to_verify: "❓",
  invalid_credential: "⛔",
  identity_not_registered: "⚠️",
  invalid_code: "✏️",
  rate_limited: "⏳",
  unavailable: "⏳",
};

const REPORTABLE = new Set<VerifyResult["status"]>([
  "suspicious",
  "not_released",
  "unable_to_verify",
  "invalid_credential",
  "identity_not_registered",
  "recalled",
  "expired",
]);

const HELP = [
  "<b>Suremark product check</b>",
  "Send the 16-digit code printed under the QR code on the pack. Spaces are fine, for example:",
  "<code>4827 3916 0573 2218</code>",
  "",
  "I will tell you whether the manufacturer issued and released it, and warn you about recalls, expiry or signs the code has been copied.",
].join("\n");

const NO_CODE = "I could not find a product code in that message. Please send the 16-digit number printed under the QR code on the pack.";
const NOT_TEXT = "I can only read typed codes. Please type the 16-digit number printed under the QR code on the pack.";
const UNAVAILABLE = "⏳ <b>Verification temporarily unavailable</b>\nWe cannot check codes right now. This is not a confirmation either way — please try again shortly.";

/** Compares the X-Telegram-Bot-Api-Secret-Token header in constant time. */
export function verifyTelegramSecret(header: string | null): "valid" | "invalid" | "disabled" {
  const secret = env.telegramWebhookSecret;
  if (!secret) return "disabled";
  if (!header) return "invalid";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header), digest(secret)) ? "valid" : "invalid";
}

/** Longest run of digits (spaces, dots and dashes allowed between them) in free text. */
export function extractCode(text: string): string | null {
  const runs = text.match(/\d(?:[ .-]*\d)*/g);
  if (!runs) return null;
  return runs.reduce((best, run) => (run.replace(/\D/g, "").length > best.replace(/\D/g, "").length ? run : best));
}

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function clip(value: string, max = 600) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function field(label: string, value: string | null | undefined) {
  return value ? `${label}: <b>${esc(value)}</b>` : null;
}

export function telegramResultText(r: VerifyResult, baseUrl: string): string {
  const lines: (string | null)[] = [`${ICON[r.status]} <b>${esc(r.headline)}</b>`, esc(r.message)];

  if (r.recall) {
    lines.push("", "<b>What to do</b>", esc(clip(r.recall.advice)), `<i>Reason: ${esc(clip(r.recall.reason))} · Effective ${formatDate(r.recall.effectiveAt)}</i>`);
  }

  const { product: p, batch: b, manufacturer: m } = r;
  if (p && b && m) {
    lines.push(
      "",
      `<b>${esc([p.brand, p.variant || p.name, p.strength].filter(Boolean).join(" "))}</b>`,
      field("Manufacturer", m.name),
      field("Category", p.category),
      field("Form / pack", [p.dosageForm, p.packSize].filter(Boolean).join(" · ")),
      field("Registration no. (declared by manufacturer)", p.nafdacRegNo),
      field("Regulatory check", p.regulatoryStatus?.replaceAll("_", " ")),
      field("Batch / lot", b.lot),
      field("Carton", b.cartonCode),
      field("Manufactured", formatDate(b.manufactureDate)),
      field("Expires", formatDate(b.expiryDate)),
    );
    if (p.regulatorySimulated) {
      lines.push("", `<i>Simulated development registry match — a prototype-only test result, not an authoritative NAFDAC verification. Source: ${esc(p.regulatorySource ?? "—")}.</i>`);
    } else if (p.regulatorySource) {
      lines.push("", `<i>Regulatory source: ${esc(p.regulatorySource)}</i>`);
    }
    const h = r.history;
    if (h && h.previousChecks > 0) {
      const first = [h.firstCheckedAt && `, first on ${formatDate(h.firstCheckedAt)}`, h.firstRegion && h.firstRegion !== "Unknown" && ` in ${esc(h.firstRegion)}`].filter(Boolean).join("");
      lines.push("", `This code has been checked ${h.previousChecks} time${h.previousChecks === 1 ? "" : "s"} before${first}. If you have just bought this pack and did not check it earlier, be cautious.`);
    } else if (h && r.status === "issued_no_known_alerts") {
      lines.push("", "This is the first time this code has been checked.");
    }
    lines.push("", "<i>A matching identity shows the code was issued and released; it cannot prove this physical pack has not received a copied label.</i>");
  }

  if (REPORTABLE.has(r.status)) lines.push("", `<a href="${esc(`${baseUrl}/report`)}">Report a suspected fake</a>`);
  return lines.filter((line) => line !== null).join("\n");
}

async function respond(message: TelegramMessage, baseUrl: string): Promise<string | null> {
  const text = (message.text ?? message.caption ?? "").trim();
  const command = text.match(/^\/([A-Za-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  // In groups, only answer commands addressed to the bot, never ordinary conversation.
  if (message.chat.type !== "private" && !command) return null;
  if (!text) return message.photo ? NOT_TEXT : HELP;

  let candidate: string | null;
  if (command) {
    const name = command[1].toLowerCase();
    if (name !== "start" && name !== "check") return HELP;
    // `/start <code>` arrives from t.me/<bot>?start=<code> deep links.
    candidate = extractCode(command[2] ?? "");
    if (!candidate) return name === "start" ? HELP : `${NO_CODE}\nExample: <code>/check 4827 3916 0573 2218</code>`;
  } else {
    candidate = extractCode(text);
    if (!candidate) return NO_CODE;
  }

  // The Telegram user id is stable per person: it drives copied-code device signals and rate limits.
  const subject = `telegram:${message.from?.id ?? message.chat.id}`;
  const ctx: VerifyContext = { channel: "telegram", region: null, deviceKey: subject, clientKey: subject };
  return telegramResultText(await verifyCode(candidate, ctx), baseUrl);
}

/** Returns the sendMessage reply for an update, or null when there is nothing to answer. */
export async function handleTelegramUpdate(update: TelegramUpdate, baseUrl: string): Promise<TelegramReply | null> {
  const message = update.message;
  if (!message || message.from?.is_bot) return null;
  let text: string | null;
  try {
    // Telegram redelivers an update when the webhook is slow or fails; never count a check twice.
    if (!(await hit(`tg:update:${update.update_id}`, 1))) return null;
    text = await respond(message, baseUrl);
  } catch (err) {
    console.error("telegram update failed", err);
    text = UNAVAILABLE;
  }
  if (!text) return null;
  return {
    method: "sendMessage",
    chat_id: message.chat.id,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
  };
}
