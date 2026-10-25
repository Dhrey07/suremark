import "./load-env";

import { closeDb } from "../src/db";
import { isEmpty, resetDatabase, seedDemo } from "../src/lib/seed";

// Schema changes and seeding use a direct (unpooled) connection when the platform provides one.
const directUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
if (directUrl) process.env.DATABASE_URL = directUrl;

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  if (ifEmpty && !(await isEmpty())) {
    console.log("database already seeded; skipping");
    return;
  }
  if (!process.env.MASTER_SECRET) throw new Error("MASTER_SECRET is not set");
  await resetDatabase();
  const started = Date.now();
  await seedDemo(process.env.DEMO_PASSWORD ?? "pitch-demo-2026", (m) => console.log(`  ${m}`));
  console.log(`demo data seeded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
