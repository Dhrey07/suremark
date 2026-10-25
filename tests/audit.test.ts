import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { verifyAuditChain } from "@/lib/audit";
import { makeTenant, resetDb } from "./fixtures";
import { releasedBatch } from "./flow";

beforeEach(resetDb);

describe("audit chain", () => {
  it("is append-only and detects tampering", async () => {
    const t = await makeTenant("OKL");
    await releasedBatch(t, { quantity: 3 });
    const db = getDb();
    const ok = await verifyAuditChain(db);
    expect(ok.ok).toBe(true);
    expect(ok.checked).toBeGreaterThan(5);
    await expect(db.update(schema.auditEvents).set({ action: "x" })).rejects.toThrow();
    await expect(db.delete(schema.auditEvents)).rejects.toThrow();

    // Simulate a privileged attacker bypassing the trigger.
    await db.execute(sql`alter table audit_events disable trigger audit_events_append_only`);
    await db.execute(sql`update audit_events set detail = '{"activated": 999}'::jsonb where action = 'batch.release'`);
    await db.execute(sql`alter table audit_events enable trigger audit_events_append_only`);
    const broken = await verifyAuditChain(db);
    expect(broken.ok).toBe(false);
  });
});
