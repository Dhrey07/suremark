import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { decodeAndVerifyCuis, issueCuisCredential, type IssuedCuisCredential } from "@/lib/cuis";
import { registerCuisCredentials, type CredentialSubject } from "@/lib/credential-registry";
import { kms } from "@/lib/kms";

/**
 * Non-destructive CUIS v1 backfill. Legacy unit signatures and carton credentials are retained so
 * labels already in circulation remain verifiable. Re-running this function is idempotent.
 */
export async function backfillCuisV1() {
  const db = getDb();
  for (const key of kms.cuisKeyMetadata()) {
    await db
      .insert(schema.signingKeyMetadata)
      .values({ version: key.version, provider: key.provider, status: key.status })
      .onConflictDoUpdate({
        target: schema.signingKeyMetadata.version,
        set: {
          provider: key.provider,
          status: key.status,
          verifyOnlyAt: key.status === "verify_only" ? new Date() : null,
          revokedAt: key.status === "revoked" ? new Date() : null,
        },
      });
  }

  const batches = await db.select().from(schema.batches).where(isNull(schema.batches.cuisCredential));
  for (const batch of batches) {
    const credential = issueCuisCredential({ type: "batch", manufacturerId: batch.manufacturerId, productId: batch.productId });
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(schema.batches)
        .set({
          cuisVersion: credential.version,
          cuisKeyVersion: credential.keyVersion,
          cuisRandomIdentity: credential.randomIdentity,
          cuisAuthTag: credential.authTag,
          cuisCredential: credential.payload,
        })
        .where(and(eq(schema.batches.id, batch.id), isNull(schema.batches.cuisCredential)))
        .returning({ id: schema.batches.id });
      if (updated.some((row) => row.id === batch.id)) {
        await appendAudit(tx, {
          manufacturerId: batch.manufacturerId,
          actorType: "system",
          action: "cuis.batch.backfill",
          resourceType: "batch",
          resourceId: batch.id,
          decision: "allow",
          detail: { version: credential.version, keyVersion: credential.keyVersion },
        });
      }
    });
  }

  const cartons = await db.select().from(schema.cartons).where(isNull(schema.cartons.cuisCredential));
  for (const carton of cartons) {
    const credential = issueCuisCredential({
      type: "carton",
      manufacturerId: carton.manufacturerId,
      productId: carton.productId,
      batchId: carton.batchId,
      randomIdentity: carton.randomIdentity,
    });
    await db
      .update(schema.cartons)
      .set({ cuisVersion: credential.version, cuisKeyVersion: credential.keyVersion, cuisAuthTag: credential.authTag, cuisCredential: credential.payload })
      .where(eq(schema.cartons.id, carton.id));
  }

  const units = await db
    .select({ unit: schema.units, credential: schema.credentials })
    .from(schema.units)
    .innerJoin(schema.credentials, eq(schema.credentials.unitId, schema.units.id))
    .where(isNull(schema.credentials.cuisPayload));
  for (let start = 0; start < units.length; start += 500) {
    const chunk = units.slice(start, start + 500);
    await db.transaction(async (tx) => {
      for (const row of chunk) {
        const credential = issueCuisCredential({
          type: "unit",
          manufacturerId: row.unit.manufacturerId,
          productId: row.unit.productId,
          batchId: row.unit.batchId,
          randomIdentity: row.unit.randomIdentity,
        });
        await tx
          .update(schema.credentials)
          .set({ cuisVersion: credential.version, cuisKeyVersion: credential.keyVersion, cuisAuthTag: credential.authTag, cuisPayload: credential.payload })
          .where(eq(schema.credentials.unitId, row.unit.id));
      }
    });
  }

  let allocations = 0;
  const printJobs = await db.select().from(schema.printJobs);
  for (const job of printJobs) {
    const [existing] = await db.select({ id: schema.identityAllocations.id }).from(schema.identityAllocations).where(eq(schema.identityAllocations.approvalRequestId, job.approvalRequestId));
    if (existing) continue;
    const [issued] = await db.select({ n: count() }).from(schema.units).where(eq(schema.units.printJobId, job.id));
    const issuedCount = Number(issued.n);
    await db.insert(schema.identityAllocations).values({
      manufacturerId: job.manufacturerId,
      batchId: job.batchId,
      approvalRequestId: job.approvalRequestId,
      idempotencyKey: job.approvalRequestId,
      requestedQuantity: job.quantity,
      issuedCount,
      status: issuedCount === job.quantity ? "completed" : "failed",
      attempts: 1,
      lastError: issuedCount === job.quantity ? null : `Legacy allocation expected ${job.quantity}, found ${issuedCount}`,
      startedAt: job.createdAt,
      completedAt: issuedCount === job.quantity ? job.createdAt : null,
    });
    allocations++;
  }

  const registryRecords: CredentialSubject[] = [];
  const toIssued = (payload: string, expectedType: "batch" | "carton" | "unit"): IssuedCuisCredential => {
    const decoded = decodeAndVerifyCuis(payload, expectedType);
    if (!decoded.ok) throw new Error(`Existing ${expectedType} CUIS credential failed authentication: ${decoded.reason}`);
    return { ...decoded.claims, authTag: decoded.authTag, payload };
  };
  const allBatches = await db.select({ id: schema.batches.id, createdBy: schema.batches.createdBy, payload: schema.batches.cuisCredential }).from(schema.batches);
  for (const row of allBatches) if (row.payload) registryRecords.push({ type: "batch", subjectId: row.id, credential: toIssued(row.payload, "batch"), createdBy: row.createdBy });
  const allCartons = await db.select({ id: schema.cartons.id, payload: schema.cartons.cuisCredential }).from(schema.cartons);
  for (const row of allCartons) if (row.payload) registryRecords.push({ type: "carton", subjectId: row.id, credential: toIssued(row.payload, "carton") });
  const allUnits = await db
    .select({ id: schema.units.id, payload: schema.credentials.cuisPayload })
    .from(schema.units)
    .innerJoin(schema.credentials, eq(schema.credentials.unitId, schema.units.id));
  for (const row of allUnits) if (row.payload) registryRecords.push({ type: "unit", subjectId: row.id, credential: toIssued(row.payload, "unit") });
  for (let start = 0; start < registryRecords.length; start += 500) {
    await db.transaction((tx) => registerCuisCredentials(tx, registryRecords.slice(start, start + 500)));
  }

  return { batches: batches.length, cartons: cartons.length, units: units.length, allocations, keyVersions: kms.cuisKeyMetadata().length, registryCredentials: registryRecords.length };
}
