import "./load-env";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db";

// Schema changes and seeding use a direct (unpooled) connection when the platform provides one.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

async function main() {
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log("migrations applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
