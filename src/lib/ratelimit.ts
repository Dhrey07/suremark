import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const WINDOW_MS = 10 * 60_000;

/**
 * Fixed-window counter in Postgres. Returns false once `limit` hits occur within the window.
 * Keys are pseudonymous digests, never raw IPs or phone numbers.
 */
export async function hit(key: string, limit: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  const [row] = await getDb()
    .insert(schema.rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [schema.rateLimitBuckets.key, schema.rateLimitBuckets.windowStart],
      set: { count: sql`${schema.rateLimitBuckets.count} + 1` },
    })
    .returning({ count: schema.rateLimitBuckets.count });
  if (Math.random() < 0.01) {
    await getDb().execute(sql`delete from rate_limit_buckets where window_start < now() - interval '1 day'`);
  }
  return row.count <= limit;
}

export async function peek(key: string): Promise<number> {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  const rows = await getDb().execute<{ count: number }>(
    sql`select count from rate_limit_buckets where key = ${key} and window_start = ${windowStart.toISOString()}`,
  );
  return Number(rows.rows[0]?.count ?? 0);
}
