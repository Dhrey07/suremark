import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { recordDenial } from "@/lib/audit";
import { publicBaseUrl } from "@/lib/request-context";
import { handleTelegramUpdate, verifyTelegramSecret, type TelegramUpdate } from "@/lib/telegram";

const NO_STORE = { "cache-control": "no-store" };

/** Telegram Bot API webhook. Answers each update inline with a sendMessage call. */
export async function POST(req: Request) {
  const secret = verifyTelegramSecret(req.headers.get("x-telegram-bot-api-secret-token"));
  if (secret === "disabled") return new Response(null, { status: 404, headers: NO_STORE });
  if (secret === "invalid") {
    await recordDenial({ actorType: "aggregator", action: "telegram.webhook", detail: { reason: "bad_secret" } });
    return new Response(null, { status: 401, headers: NO_STORE });
  }
  const body = await readJson(req);
  // Acknowledge anything unusable so Telegram does not keep redelivering it.
  if (!body || !Number.isSafeInteger(body.update_id)) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  const reply = await handleTelegramUpdate(body as unknown as TelegramUpdate, await publicBaseUrl());
  return NextResponse.json(reply ?? { ok: true }, { headers: NO_STORE });
}
