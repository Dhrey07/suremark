import "./load-env";
import { TELEGRAM_COMMANDS } from "../src/lib/telegram";

/**
 * Registers the Telegram webhook and bot commands.
 *   npm run telegram:webhook           set webhook + commands
 *   npm run telegram:webhook -- info   show current webhook status
 *   npm run telegram:webhook -- delete remove the webhook
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

async function call(method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) throw new Error(`${method} failed: ${json.description ?? res.status}`);
  return json.result;
}

async function main() {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const action = process.argv[2] ?? "set";

  if (action === "info") {
    console.log(await call("getMe"));
    console.log(await call("getWebhookInfo"));
    return;
  }
  if (action === "delete") {
    await call("deleteWebhook");
    console.log("Webhook removed.");
    return;
  }
  if (action !== "set") throw new Error(`Unknown action "${action}". Use set, info or delete.`);

  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error("TELEGRAM_WEBHOOK_SECRET must be 32-256 characters of A-Z, a-z, 0-9, _ or -");
  if (!baseUrl.startsWith("https://")) throw new Error("PUBLIC_BASE_URL must be the public https:// URL of the deployment");

  const url = `${baseUrl}/api/v1/telegram/webhook`;
  await call("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  await call("setMyCommands", { commands: TELEGRAM_COMMANDS });
  const me = (await call("getMe")) as { username: string };
  console.log(`Webhook set to ${url} for @${me.username}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
