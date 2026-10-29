import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "../audit";
import { authorize, requireIndependent, type Actor } from "../authz";
import { isUniqueViolation } from "../db-errors";
import { conflict, forbidden, invalid, notFound } from "../errors";

function tenantOf(actor: Actor) {
  if (!actor.membership) throw forbidden();
  return actor.membership.manufacturerId;
}

export async function initiateRecall(actor: Actor, batchId: string, reason: string, consumerAdvice: string) {
  if (reason.trim().length < 10) throw invalid("Describe the reason for the recall (at least 10 characters).");
  if (consumerAdvice.trim().length < 10) throw invalid("Give consumers clear advice (at least 10 characters).");
  const manufacturerId = tenantOf(actor);
  return getDb().transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(schema.batches)
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.manufacturerId, manufacturerId)))
      .for("update");
    if (!batch) throw notFound("Batch not found");
    await authorize(actor, "recall:initiate", { manufacturerId, factoryId: batch.factoryId, lineId: batch.lineId }, { type: "batch", id: batch.id });
    if (batch.status !== "released") throw conflict("Only a released batch can be recalled.");
    try {
      const [request] = await tx
        .insert(schema.approvalRequests)
        .values({
          manufacturerId,
          action: "recall",
          resourceId: batch.id,
          payload: { reason: reason.trim() },
          requesterId: actor.userId,
          requestReason: reason.trim(),
        })
        .returning();
      const [recall] = await tx
        .insert(schema.recalls)
        .values({
          manufacturerId,
          batchId: batch.id,
          reason: reason.trim(),
          consumerAdvice: consumerAdvice.trim(),
          initiatedBy: actor.userId,
          approvalRequestId: request.id,
        })
        .returning();
      await appendAudit(tx, {
        manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "recall.initiate",
        resourceType: "batch",
        resourceId: batch.id,
        decision: "allow",
        detail: { recallId: recall.id, approvalRequestId: request.id, reason: reason.trim() },
      });
      return recall;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("A recall is already open for this batch.");
      throw err;
    }
  });
}

/** Dual control: a second, independent authorized actor activates the recall. */
export async function decideRecall(actor: Actor, recallId: string, approve: boolean, reason: string) {
  const manufacturerId = tenantOf(actor);
  return getDb().transaction(async (tx) => {
    const [recall] = await tx
      .select()
      .from(schema.recalls)
      .where(and(eq(schema.recalls.id, recallId), eq(schema.recalls.manufacturerId, manufacturerId)))
      .for("update");
    if (!recall) throw notFound("Recall not found");
    const [batch] = await tx.select().from(schema.batches).where(eq(schema.batches.id, recall.batchId)).for("update");
    const scope = { manufacturerId, factoryId: batch.factoryId, lineId: batch.lineId };
    await authorize(actor, "recall:approve", scope, { type: "recall", id: recall.id });
    await requireIndependent(actor, "recall:approve", scope, [{ userId: recall.initiatedBy, why: "initiated this recall" }], {
      type: "recall",
      id: recall.id,
    });
    if (recall.status !== "pending_approval") throw conflict("This recall has already been decided.");
    if (!approve && !reason.trim()) throw invalid("A reason is required to reject a recall.");

    const now = new Date();
    await tx
      .update(schema.approvalRequests)
      .set({ status: approve ? "approved" : "rejected", decidedBy: actor.userId, decisionReason: reason.trim() || null, decidedAt: now })
      .where(eq(schema.approvalRequests.id, recall.approvalRequestId));
    await tx
      .update(schema.recalls)
      .set({ status: approve ? "active" : "rejected", effectiveAt: approve ? now : null })
      .where(eq(schema.recalls.id, recall.id));

    let recalledUnits = 0;
    if (approve) {
      const updated = await tx
        .update(schema.units)
        .set({ state: "RECALLED", stateChangedAt: now })
        .where(and(eq(schema.units.batchId, batch.id), inArray(schema.units.state, ["ACTIVE"])))
        .returning({ id: schema.units.id });
      recalledUnits = updated.length;
      await tx.update(schema.batches).set({ status: "recalled" }).where(eq(schema.batches.id, batch.id));
      await tx.update(schema.cartons).set({ status: "recalled" }).where(eq(schema.cartons.batchId, batch.id));
    }
    await appendAudit(tx, {
      manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: approve ? "recall.approve" : "recall.reject",
      resourceType: "recall",
      resourceId: recall.id,
      decision: "allow",
      detail: { batchId: batch.id, recalledUnits, reason: reason.trim() || null },
    });
    return { approved: approve, recalledUnits };
  });
}
