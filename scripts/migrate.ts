import "./load-env";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db";

// Schema changes and seeding use a direct (unpooled) connection when the platform provides one.
const directUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
if (directUrl) process.env.DATABASE_URL = directUrl;

function preflight() {
  const missing = [];
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) missing.push("DATABASE_URL (add Neon Postgres under the project's Storage tab)");
  if (!process.env.MASTER_SECRET) missing.push("MASTER_SECRET (generate with: openssl rand -base64 48)");
  if (missing.length) {
    console.error(`\nMissing environment variables:\n${missing.map((m) => `  - ${m}`).join("\n")}\nSet them in Vercel → Project → Settings → Environment Variables, then redeploy.\n`);
    process.exit(1);
  }
}

async function main() {
  preflight();
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log("migrations applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
