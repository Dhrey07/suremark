import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { DomainError } from "@/lib/errors";
import {
  decideAllocation,
  finishPrintJob,
  getPrintLabels,
  reconcileBatch,
  rejectLabel,
  releaseBatch,
  reportProductionEvents,
  requestAllocation,
  runLineSimulation,
  startPrintJob,
  unitStateCounts,
} from "@/lib/services/production";
import { makeTenant, resetDb } from "./fixtures";
import { allocatedBatch, draftBatch, releasedBatch } from "./flow";

let t: Awaited<ReturnType<typeof makeTenant>>;

beforeEach(async () => {
  await resetDb();
  t = await makeTenant("OKL");
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : String(e)));

describe("issuance", () => {
  it("issues unique identities, credentials and codes only after independent approval", async () => {
    const batch = await draftBatch(t, 300);
    const req = await requestAllocation(t.actors.productionManager, batch.id, 330, "");
    expect(await code(decideAllocation(t.actors.productionManager, req.id, true, ""))).toBe("forbidden");

    const res = await decideAllocation(t.actors.factoryManager, req.id, true, "");
    expect(res.approved).toBe(true);
    const db = getDb();
    const units = await db.select().from(schema.units).where(eq(schema.units.batchId, batch.id));
    expect(units).toHaveLength(330);
    expect(new Set(units.map((u) => u.randomIdentity.toString("hex"))).size).toBe(330);
    expect(units.every((u) => u.state === "RESERVED")).toBe(true);
    const codes = await db.select().from(schema.manualCodes);
    expect(new Set(codes.map((c) => c.lookupDigest.toString("hex"))).size).toBe(330);
    expect(await db.$count(schema.credentials)).toBe(330);
    // A decided request cannot be replayed.
    expect(await code(decideAllocation(t.actors.owner, req.id, true, ""))).toBe("conflict");
  });

  it("records maker-checker denials in the audit log", async () => {
    // Holds both request and approve permissions, but may not approve their own request.
    const both = await t.user("both", [
      { key: "production_manager", grants: ["factory"] },
      { key: "factory_manager", grants: ["factory"] },
    ]);
    const batch = await draftBatch(t);
    const req = await requestAllocation(both, batch.id, 20, "");
    expect(await code(decideAllocation(both, req.id, true, ""))).toBe("forbidden");
    const denials = await getDb()
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.decision, "deny"), eq(schema.auditEvents.action, "identity:allocate:approve")));
    expect(denials).toHaveLength(1);
    expect(denials[0].detail).toMatchObject({ reason: "separation_of_duties" });
  });

  it("enforces the batch quota (planned + 10%)", async () => {
    const batch = await draftBatch(t, 100);
    expect(await code(requestAllocation(t.actors.productionManager, batch.id, 111, ""))).toBe("invalid");
    expect(await code(requestAllocation(t.actors.productionManager, batch.id, 110, ""))).toBe("ok");
    expect(await code(requestAllocation(t.actors.productionManager, batch.id, 10, ""))).toBe("conflict");
  });

  it("lets only one of two concurrent approvals issue identities", async () => {
    const batch = await draftBatch(t, 50);
    const req = await requestAllocation(t.actors.productionManager, batch.id, 50, "");
    const results = await Promise.all([
      code(decideAllocation(t.actors.factoryManager, req.id, true, "")),
      code(decideAllocation(t.actors.owner, req.id, true, "")),
    ]);
    expect(results.sort()).toEqual(["conflict", "ok"]);
    expect(await getDb().$count(schema.units)).toBe(50);
  });

  it("keeps identities globally unique across concurrent batches", async () => {
    const batches = await Promise.all([1, 2, 3, 4].map(() => draftBatch(t, 200)));
    const reqs = await Promise.all(batches.map((b) => requestAllocation(t.actors.productionManager, b.id, 200, "")));
    await Promise.all(reqs.map((r) => decideAllocation(t.actors.factoryManager, r.id, true, "")));
    const units = await getDb().select({ r: schema.units.randomIdentity }).from(schema.units);
    expect(units).toHaveLength(800);
    expect(new Set(units.map((u) => u.r.toString("hex"))).size).toBe(800);
  });

  it("makes identities permanent: no deletion, no identity rewrite", async () => {
    await allocatedBatch(t, 5);
    const db = getDb();
    const [unit] = await db.select().from(schema.units).limit(1);
    await expect(db.delete(schema.units).where(eq(schema.units.id, unit.id))).rejects.toThrow();
    await expect(db.update(schema.units).set({ randomIdentity: Buffer.alloc(16) }).where(eq(schema.units.id, unit.id))).rejects.toThrow();
    await expect(db.delete(schema.manualCodes).where(eq(schema.manualCodes.unitId, unit.id))).rejects.toThrow();
  });
});

describe("production and release", () => {
  it("reconciles generated = activated + rejected + voided and activates only good units", async () => {
    const { batch, sim } = await releasedBatch(t, { quantity: 40, smudged: 3, holdBack: 2 });
    expect(sim.printed).toBe(35);
    expect(sim.rejected).toBe(3);
    const counts = await getDb().transaction((tx) => unitStateCounts(tx, batch.id));
    expect(counts).toEqual({ ACTIVE: 35, REJECTED: 3, VOIDED: 2 });
    const [rec] = await getDb().select().from(schema.reconciliations).where(eq(schema.reconciliations.batchId, batch.id));
    expect(rec).toMatchObject({ issued: 40, printed: 35, rejected: 3, voided: 2, physicalCount: 35 });
  });

  it("blocks reconciliation when the physical count does not match", async () => {
    const { batch, printJobId } = await allocatedBatch(t, 10);
    await startPrintJob(t.actors.operator, printJobId);
    await runLineSimulation(t.actors.operator, printJobId, randomUUID(), { smudged: 0, holdBack: 0 });
    await finishPrintJob(t.actors.operator, printJobId);
    expect(await code(reconcileBatch(t.actors.productionManager, batch.id, 9, ""))).toBe("conflict");
    const counts = await getDb().transaction((tx) => unitStateCounts(tx, batch.id));
    expect(counts).toEqual({ PRINTED_PENDING: 10 });
  });

  it("requires the print job to be finished and never activates without QA release", async () => {
    const { batch, printJobId } = await allocatedBatch(t, 10);
    await startPrintJob(t.actors.operator, printJobId);
    await runLineSimulation(t.actors.operator, printJobId, randomUUID(), { smudged: 0, holdBack: 0 });
    expect(await code(reconcileBatch(t.actors.productionManager, batch.id, 10, ""))).toBe("conflict");
    await finishPrintJob(t.actors.operator, printJobId);
    expect(await code(releaseBatch(t.actors.qa, batch.id, true, "ok"))).toBe("conflict");
    await reconcileBatch(t.actors.productionManager, batch.id, 10, "");
    const counts = await getDb().transaction((tx) => unitStateCounts(tx, batch.id));
    expect(counts).toEqual({ QA_PENDING: 10 });
  });

  it("refuses release by anyone who created, requested or printed the batch", async () => {
    // A user holding both production and QA roles still cannot release their own batch.
    const dual = await t.user("dual", [
      { key: "production_manager", grants: ["factory"] },
      { key: "qa_officer", grants: ["factory"] },
    ]);
    const batch = await (await import("@/lib/services/production")).createBatch(dual, {
      productId: t.product.id,
      lineId: t.line.id,
      lot: "DUAL-1",
      manufactureDate: "2026-10-01",
      expiryDate: "2028-01-01",
      plannedQuantity: 5,
    });
    const req = await requestAllocation(dual, batch.id, 5, "");
    const { printJobId } = (await decideAllocation(t.actors.factoryManager, req.id, true, "")) as { printJobId: string };
    await startPrintJob(t.actors.operator, printJobId);
    await runLineSimulation(t.actors.operator, printJobId, randomUUID(), { smudged: 0, holdBack: 0 });
    await finishPrintJob(t.actors.operator, printJobId);
    await reconcileBatch(dual, batch.id, 5, "");
    await expect(releaseBatch(dual, batch.id, true, "ok")).rejects.toThrow(/Independent approver required/);
    expect(await code(releaseBatch(t.actors.qa, batch.id, true, "ok"))).toBe("ok");
  });

  it("makes production events idempotent and outcomes immutable", async () => {
    const { printJobId } = await allocatedBatch(t, 3);
    await startPrintJob(t.actors.operator, printJobId);
    const labels = await getPrintLabels(t.actors.operator, printJobId);
    const ev = { eventId: randomUUID(), unitId: labels[0].unitId, type: "printed" as const };
    expect(await reportProductionEvents(t.actors.operator, printJobId, [ev])).toEqual({ recorded: 1, duplicates: 0 });
    expect(await reportProductionEvents(t.actors.operator, printJobId, [ev])).toEqual({ recorded: 0, duplicates: 1 });
    expect(
      await code(reportProductionEvents(t.actors.operator, printJobId, [{ eventId: randomUUID(), unitId: labels[0].unitId, type: "printed" }])),
    ).toBe("conflict");
    // Damaged after printing: rejected permanently.
    await rejectLabel(t.actors.operator, printJobId, labels[0].unitId, "Torn during packing");
    const [u] = await getDb().select().from(schema.units).where(eq(schema.units.id, labels[0].unitId));
    expect(u.state).toBe("REJECTED");
  });

  it("requires a valid lease to read print data", async () => {
    const { printJobId } = await allocatedBatch(t, 3);
    expect(await code(getPrintLabels(t.actors.operator, printJobId))).toBe("conflict");
    expect(await code(getPrintLabels(t.actors.operatorLine2, printJobId))).toBe("forbidden");
    await startPrintJob(t.actors.operator, printJobId);
    expect(await getPrintLabels(t.actors.operator, printJobId)).toHaveLength(3);
  });
});
