import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __upaPool?: Pool; __upaDb?: Database };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url, max: process.env.VERCEL ? 5 : 10 });
}

export function getDb(): Database {
  if (!globalForDb.__upaDb) {
    globalForDb.__upaPool = createPool();
    globalForDb.__upaDb = drizzle(globalForDb.__upaPool, { schema });
  }
  return globalForDb.__upaDb;
}

export async function closeDb() {
  await globalForDb.__upaPool?.end();
  globalForDb.__upaPool = undefined;
  globalForDb.__upaDb = undefined;
}

export { schema };
