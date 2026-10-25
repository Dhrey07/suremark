import { asc, desc, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx, type Tx } from "@/db";
import { sha256 } from "./password";

export type AuditInput = {
  manufacturerId?: string | null;
  actorType: "user" | "system" | "consumer" | "aggregator";
  actorId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  decision: "allow" | "deny";
  detail?: Record<string, unknown>;
};

const GENESIS: Buffer = Buffer.alloc(32);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function chainHash(prev: Buffer, e: Omit<AuditInput, "detail"> & { detail: Record<string, unknown>; occurredAt: Date }) {
  const body = canonical({
    manufacturerId: e.manufacturerId ?? null,
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    resourceType: e.resourceType ?? null,
    resourceId: e.resourceId ?? null,
    decision: e.decision,
    detail: e.detail,
    occurredAt: e.occurredAt.toISOString(),
  });
  return sha256(Buffer.concat([prev, Buffer.from(body)]));
}

/** Appends to the global tamper-evident hash chain. Call inside the transaction it describes. */
export async function appendAudit(tx: Tx, input: AuditInput) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('audit_chain'))`);
  const [last] = await tx
    .select({ hash: schema.auditEvents.hash })
    .from(schema.auditEvents)
    .orderBy(desc(schema.auditEvents.seq))
    .limit(1);
  const prevHash = last?.hash ?? GENESIS;
  const occurredAt = new Date();
  const detail = JSON.parse(JSON.stringify(input.detail ?? {}));
  const hash = chainHash(prevHash, { ...input, detail, occurredAt });
  await tx.insert(schema.auditEvents).values({
    manufacturerId: input.manufacturerId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    decision: input.decision,
    detail,
    occurredAt,
    prevHash,
    hash,
  });
}

/** Denials are recorded in their own transaction so they survive the rollback of the denied action. */
export async function recordDenial(input: Omit<AuditInput, "decision">) {
  await getDb().transaction((tx) => appendAudit(tx, { ...input, decision: "deny" }));
}

export async function verifyAuditChain(db: DbOrTx) {
  const rows = await db.select().from(schema.auditEvents).orderBy(asc(schema.auditEvents.seq));
  let prev: Buffer = GENESIS;
  for (const row of rows) {
    const expected = chainHash(prev, {
      manufacturerId: row.manufacturerId,
      actorType: row.actorType as AuditInput["actorType"],
      actorId: row.actorId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      decision: row.decision as AuditInput["decision"],
      detail: row.detail,
      occurredAt: row.occurredAt,
    });
    if (!row.prevHash.equals(prev) || !row.hash.equals(expected)) {
      return { ok: false as const, checked: rows.length, brokenAtSeq: row.seq };
    }
    prev = row.hash;
  }
  return { ok: true as const, checked: rows.length, head: prev.toString("hex") };
}
