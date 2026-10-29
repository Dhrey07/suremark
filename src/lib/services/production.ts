import { randomBytes, createHash, randomInt, randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, like, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import { appendAudit, recordDenial } from "../audit";
import { authorize, requireIndependent, ROLES, type Actor, type Scope } from "../authz";
import { CODE_NAMESPACE, checkCode, generateCode } from "../codes";
import { buildPayload, CREDENTIAL_FORMAT_VERSION, decodeAndVerify, signClaims } from "../credential";
import { decodeAndVerifyCuis, issueCuisCredential, looksLikeCuisCredential } from "../cuis";
import { registerCuisCredentials } from "../credential-registry";
import { isUniqueViolation, uuidFrom } from "../db-errors";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { kms } from "../kms";
import { lagosToday } from "../dates";

const ISSUANCE_CHUNK = 500;
const MAX_ALLOCATION = 5000;
const OVERAGE_PERCENT = 10; // labels may exceed planned output to absorb spoilage
const LEASE_HOURS = 8;

function tenantOf(actor: Actor): string {
  if (!actor.membership) throw forbidden();
  return actor.membership.manufacturerId;
}

function batchScope(b: { manufacturerId: string; factoryId: string; lineId: string }): Scope {
  return { manufacturerId: b.manufacturerId, factoryId: b.factoryId, lineId: b.lineId };
}

/** Tenant-filtered load: other tenants' batches are indistinguishable from missing ones. */
async function loadBatch(tx: Tx, actor: Actor, batchId: string, lock = false) {
  const q = tx
    .select()
    .from(schema.batches)
    .where(and(eq(schema.batches.id, batchId), eq(schema.batches.manufacturerId, tenantOf(actor))));
  const [batch] = lock ? await q.for("update") : await q;
  if (!batch) throw notFound("Batch not found");
  const [manufacturer] = await tx.select({ status: schema.manufacturers.operationalStatus }).from(schema.manufacturers).where(eq(schema.manufacturers.id, batch.manufacturerId));
  if (!manufacturer || manufacturer.status !== "active") throw forbidden("Manufacturer operations are suspended.");
  return batch;
}

async function loadJob(tx: Tx, actor: Actor, jobId: string, lock = false) {
  const q = tx
    .select()
    .from(schema.printJobs)
    .where(and(eq(schema.printJobs.id, jobId), eq(schema.printJobs.manufacturerId, tenantOf(actor))));
  const [job] = lock ? await q.for("update") : await q;
  if (!job) throw notFound("Print job not found");
  return job;
}

// ---------------------------------------------------------------- batches

export type CreateBatchInput = {
  productId: string;
  lineId: string;
  lot?: string;
  manufactureDate: string;
  expiryDate: string;
  plannedQuantity?: number;
  packagingVersionId?: string;
  cartonCount?: number;
  looseUnits?: number;
  productionNotes?: string;
  batchGroupId?: string;
};

async function automaticBatchReference(tx: Tx, manufacturerAlias: string, productAlias: string, manufactureDate: string) {
  const base = `${manufacturerAlias}-${productAlias}-${manufactureDate.replaceAll("-", "")}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${base}))`);
  const existing = await tx
    .select({ lot: schema.batches.lot })
    .from(schema.batches)
    .where(like(schema.batches.lot, `${base}-%`));
  const highest = existing.reduce((max, row) => {
    const suffix = Number.parseInt(row.lot.slice(base.length + 1), 10);
    return Number.isInteger(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `${base}-${String(highest + 1).padStart(3, "0")}`;
}

async function createBatchRow(tx: Tx, actor: Actor, input: CreateBatchInput) {
  const manufacturerId = tenantOf(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.manufactureDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) {
    throw invalid("Enter valid manufacturing and expiry dates.");
  }
  if (input.expiryDate <= input.manufactureDate) throw invalid("Expiry date must be after the manufacturing date.");
  if (input.expiryDate <= lagosToday()) throw invalid("Expiry date must be in the future.");
  const [manufacturer] = await tx.select({ status: schema.manufacturers.operationalStatus, alias: schema.manufacturers.alias }).from(schema.manufacturers).where(eq(schema.manufacturers.id, manufacturerId));
  if (!manufacturer || manufacturer.status !== "active") throw forbidden("Manufacturer operations are suspended.");
  const [line] = await tx
    .select()
    .from(schema.productionLines)
    .where(and(eq(schema.productionLines.id, input.lineId), eq(schema.productionLines.manufacturerId, manufacturerId)));
  if (!line || !line.active) throw notFound("Production line not found");
  const [product] = await tx
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.id, input.productId), eq(schema.products.manufacturerId, manufacturerId)));
  if (!product) throw notFound("Product not found");
  if (product.status !== "approved") throw conflict("This product has not been approved for issuance yet.");
  const lot = input.lot?.trim()
    ? input.lot.trim().toUpperCase()
    : await automaticBatchReference(tx, manufacturer.alias, product.alias, input.manufactureDate);
  if (!/^[A-Z0-9\-\/]{3,32}$/.test(lot)) throw invalid("Batch reference must be 3-32 characters: letters, digits, '-' or '/'.");

  let packaging: typeof schema.packagingVersions.$inferSelect | undefined;
  if (input.packagingVersionId) {
    [packaging] = await tx
      .select()
      .from(schema.packagingVersions)
      .where(
        and(
          eq(schema.packagingVersions.id, input.packagingVersionId),
          eq(schema.packagingVersions.productId, product.id),
          eq(schema.packagingVersions.manufacturerId, manufacturerId),
          eq(schema.packagingVersions.active, true),
        ),
      );
    if (!packaging) throw notFound("Active packaging version not found for this product.");
    if (!Number.isInteger(input.cartonCount) || (input.cartonCount ?? 0) < 0 || (input.cartonCount ?? 0) > 10000) {
      throw invalid("Cartons per batch must be between 0 and 10,000.");
    }
    if (!Number.isInteger(input.looseUnits ?? 0) || (input.looseUnits ?? 0) < 0 || (input.looseUnits ?? 0) > MAX_ALLOCATION) throw invalid("Loose units must be a whole number between 0 and 5,000.");
    const calculated = packaging.unitsPerCarton * input.cartonCount! + (input.looseUnits ?? 0);
    if (input.plannedQuantity !== undefined && input.plannedQuantity !== calculated) throw invalid(`Planned quantity must equal ${input.cartonCount} cartons × ${packaging.unitsPerCarton} units + ${input.looseUnits ?? 0} loose units (${calculated}).`);
    input.plannedQuantity = calculated;
  }
  if (!Number.isInteger(input.plannedQuantity) || input.plannedQuantity! < 1 || input.plannedQuantity! > MAX_ALLOCATION) {
    throw invalid(`Planned quantity must be between 1 and ${MAX_ALLOCATION} in this prototype.`);
  }

  const scope = { manufacturerId, factoryId: line.factoryId, lineId: line.id };
  await authorize(actor, "batch:create", scope);

  try {
    const batchId = randomUUID();
    const cuis = issueCuisCredential({ type: "batch", manufacturerId, productId: product.id });
    const [batch] = await tx
      .insert(schema.batches)
      .values({
        id: batchId,
        manufacturerId,
        productId: product.id,
        factoryId: line.factoryId,
        lineId: line.id,
        lot,
        cuisVersion: cuis.version,
        cuisKeyVersion: cuis.keyVersion,
        cuisRandomIdentity: cuis.randomIdentity,
        cuisAuthTag: cuis.authTag,
        cuisCredential: cuis.payload,
        manufactureDate: input.manufactureDate,
        expiryDate: input.expiryDate,
        plannedQuantity: input.plannedQuantity!,
        packagingVersionId: packaging?.id,
        unitsPerCarton: packaging?.unitsPerCarton,
        cartonCount: packaging ? input.cartonCount : undefined,
        looseUnits: packaging ? input.looseUnits ?? 0 : 0,
        productionNotes: input.productionNotes?.trim() || null,
        batchGroupId: input.batchGroupId,
        createdBy: actor.userId,
        createdByName: actor.name,
        createdByRole: actor.title || actor.membership?.roles.map((role) => ROLES[role]?.label).filter(Boolean).join(", ") || "Manufacturer user",
        lastModifiedBy: actor.userId,
      })
      .returning();
    await registerCuisCredentials(tx, [{ type: "batch", subjectId: batch.id, credential: cuis, createdBy: actor.userId }]);
    await appendAudit(tx, {
      manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "batch.create",
      resourceType: "batch",
      resourceId: batch.id,
      decision: "allow",
      detail: { lot, product: product.alias, plannedQuantity: input.plannedQuantity, cartonCount: input.cartonCount, looseUnits: input.looseUnits ?? 0, unitsPerCarton: packaging?.unitsPerCarton, batchGroupId: input.batchGroupId, creatorName: actor.name, creatorRole: actor.title, credentialProtocol: "CUIS", credentialVersion: cuis.version, keyVersion: cuis.keyVersion },
    });
    return batch;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`Lot ${lot} already exists for this product.`);
    throw err;
  }
}

export async function createBatch(actor: Actor, input: CreateBatchInput) {
  return getDb().transaction((tx) => createBatchRow(tx, actor, input));
}

export type CreateBatchSetInput = Omit<CreateBatchInput, "lot" | "plannedQuantity" | "batchGroupId"> & {
  lotPrefix: string;
  batchCount: number;
  cartonCount: number;
};

/** Creates a related set atomically so a partial multi-batch production plan cannot be left behind. */
export async function createBatchSet(actor: Actor, input: CreateBatchSetInput) {
  if (!Number.isInteger(input.batchCount) || input.batchCount < 1 || input.batchCount > 20) throw invalid("Create between 1 and 20 batches at once.");
  const groupId = randomUUID();
  return getDb().transaction(async (tx) => {
    const [packaging] = await tx
      .select()
      .from(schema.packagingVersions)
      .where(and(eq(schema.packagingVersions.id, input.packagingVersionId ?? ""), eq(schema.packagingVersions.productId, input.productId), eq(schema.packagingVersions.active, true)));
    if (!packaging) throw notFound("Select an active packaging version.");
    const plannedQuantity = packaging.unitsPerCarton * input.cartonCount + (input.looseUnits ?? 0);
    const batches = [];
    for (let i = 1; i <= input.batchCount; i++) {
      batches.push(
        await createBatchRow(tx, actor, {
          ...input,
          batchGroupId: groupId,
          plannedQuantity,
          looseUnits: input.looseUnits ?? 0,
          lot: `${input.lotPrefix.trim().toUpperCase()}-${String(i).padStart(2, "0")}`,
        }),
      );
    }
    return { groupId, batches, plannedQuantity, totalUnits: plannedQuantity * input.batchCount, totalCartons: input.cartonCount * input.batchCount };
  });
}

// ---------------------------------------------------------------- allocation (maker-checker)

export async function requestAllocation(actor: Actor, batchId: string, quantity: number, reason: string) {
  return getDb().transaction(async (tx) => {
    const batch = await loadBatch(tx, actor, batchId, true);
    await authorize(actor, "identity:allocate:request", batchScope(batch), { type: "batch", id: batch.id });
    if (batch.status !== "draft") throw conflict("Identities can only be requested for a draft batch.");
    const max = batch.plannedQuantity + Math.floor(batch.plannedQuantity * OVERAGE_PERCENT / 100);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) {
      throw invalid(`Request between 1 and ${max} identities (planned quantity + 10% spoilage allowance).`);
    }
    const [request] = await tx
      .insert(schema.approvalRequests)
      .values({
        manufacturerId: batch.manufacturerId,
        action: "identity_allocation",
        resourceId: batch.id,
        payload: { quantity },
        requesterId: actor.userId,
        requestReason: reason.trim() || null,
      })
      .returning();
    await tx.update(schema.batches).set({ status: "allocation_pending", lastModifiedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.batches.id, batch.id));
    await appendAudit(tx, {
      manufacturerId: batch.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "identity.allocation.request",
      resourceType: "batch",
      resourceId: batch.id,
      decision: "allow",
      detail: { approvalRequestId: request.id, quantity },
    });
    return request;
  });
}

export async function decideAllocation(actor: Actor, requestId: string, approve: boolean, reason: string) {
  const db = getDb();
  const prepared = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(schema.approvalRequests)
      .where(
        and(
          eq(schema.approvalRequests.id, requestId),
          eq(schema.approvalRequests.manufacturerId, tenantOf(actor)),
          eq(schema.approvalRequests.action, "identity_allocation"),
        ),
      )
      .for("update");
    if (!request) throw notFound("Approval request not found");
    const batch = await loadBatch(tx, actor, request.resourceId, true);
    const scope = batchScope(batch);
    await authorize(actor, "identity:allocate:approve", scope, { type: "approval_request", id: request.id });
    await requireIndependent(actor, "identity:allocate:approve", scope, [{ userId: request.requesterId, why: "requested this allocation" }], {
      type: "approval_request",
      id: request.id,
    });
    if (request.status === "rejected") throw conflict("This request was rejected and cannot be reused.");
    if (request.status === "approved" && !approve) throw conflict("An approved allocation cannot be changed to rejected.");
    if (request.status === "pending" && !approve && !reason.trim()) throw invalid("A reason is required to reject a request.");

    if (!approve) {
      await tx
        .update(schema.approvalRequests)
        .set({ status: "rejected", decidedBy: actor.userId, decisionReason: reason.trim(), decidedAt: new Date() })
        .where(eq(schema.approvalRequests.id, request.id));
      await tx.update(schema.batches).set({ status: "draft", lastModifiedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.batches.id, batch.id));
      await appendAudit(tx, {
        manufacturerId: batch.manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "identity.allocation.reject",
        resourceType: "batch",
        resourceId: batch.id,
        decision: "allow",
        detail: { approvalRequestId: request.id, reason },
      });
      return { approved: false as const, batch, request, quantity: 0 };
    }

    const quantity = Number(request.payload.quantity);
    if (request.status === "pending") {
      await tx
        .update(schema.approvalRequests)
        .set({ status: "approved", decidedBy: actor.userId, decisionReason: reason.trim() || null, decidedAt: new Date() })
        .where(eq(schema.approvalRequests.id, request.id));
      await tx
        .insert(schema.identityAllocations)
        .values({
          manufacturerId: batch.manufacturerId,
          batchId: batch.id,
          approvalRequestId: request.id,
          idempotencyKey: request.id,
          requestedQuantity: quantity,
        })
        .onConflictDoNothing({ target: schema.identityAllocations.approvalRequestId });
    }
    return { approved: true as const, batch, request, quantity };
  });
  if (!prepared.approved) return { approved: false as const };

  try {
    return await db.transaction(async (tx) => {
      const [allocation] = await tx
        .select()
        .from(schema.identityAllocations)
        .where(eq(schema.identityAllocations.approvalRequestId, prepared.request.id))
        .for("update");
      if (!allocation) throw new Error("Approved allocation is missing its durable issuance record");
      const [existingJob] = await tx.select().from(schema.printJobs).where(eq(schema.printJobs.approvalRequestId, prepared.request.id));
      if (allocation.status === "completed") {
        if (!existingJob || allocation.issuedCount !== prepared.quantity) throw new Error("Completed allocation has inconsistent persisted counts");
        return { approved: true as const, printJobId: existingJob.id };
      }
      await tx
        .update(schema.identityAllocations)
        .set({ status: "issuing", attempts: sql`${schema.identityAllocations.attempts} + 1`, startedAt: new Date(), updatedAt: new Date(), lastError: null })
        .where(eq(schema.identityAllocations.id, allocation.id));
      const batch = await loadBatch(tx, actor, prepared.batch.id, true);
      const job = existingJob ?? (await issueUnits(tx, batch, prepared.request.id, prepared.quantity));
      const [issued] = await tx.select({ n: count() }).from(schema.units).where(eq(schema.units.printJobId, job.id));
      const issuedCount = Number(issued.n);
      if (issuedCount !== prepared.quantity) throw new Error(`Incomplete allocation: expected ${prepared.quantity}, persisted ${issuedCount}`);
      await tx
        .update(schema.identityAllocations)
        .set({ status: "completed", issuedCount, completedAt: new Date(), updatedAt: new Date(), lastError: null })
        .where(eq(schema.identityAllocations.id, allocation.id));
      await tx.update(schema.batches).set({ status: "allocated", lastModifiedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.batches.id, batch.id));
      await appendAudit(tx, {
        manufacturerId: batch.manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "identity.allocation.approve",
        resourceType: "batch",
        resourceId: batch.id,
        decision: "allow",
        detail: { approvalRequestId: prepared.request.id, allocationId: allocation.id, quantity: prepared.quantity, issuedCount, printJobId: job.id, manifestHash: job.manifestHash.toString("hex"), keyVersion: job.keyVersion, credentialProtocol: "CUIS" },
      });
      return { approved: true as const, printJobId: job.id };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown issuance failure";
    await db
      .update(schema.identityAllocations)
      .set({ status: "failed", lastError: message, updatedAt: new Date() })
      .where(eq(schema.identityAllocations.approvalRequestId, prepared.request.id));
    throw error;
  }
}

/**
 * Atomic issuance: CSPRNG identities, authoritative CUIS v1 credentials, legacy Ed25519
 * compatibility credentials and numeric references, reserved in bounded chunks. Collisions on
 * the global unique indexes are retried with fresh randomness.
 */
async function issueUnits(tx: Tx, batch: typeof schema.batches.$inferSelect, approvalRequestId: string, quantity: number) {
  const [[issuer], [product]] = await Promise.all([
    tx.select({ shortId: schema.manufacturers.shortId, alias: schema.manufacturers.alias }).from(schema.manufacturers).where(eq(schema.manufacturers.id, batch.manufacturerId)),
    tx.select({ shortId: schema.products.shortId, alias: schema.products.alias }).from(schema.products).where(eq(schema.products.id, batch.productId)),
  ]);
  const keyVersion = kms.activeSigningKeyVersion();
  const [job] = await tx
    .insert(schema.printJobs)
    .values({
      manufacturerId: batch.manufacturerId,
      batchId: batch.id,
      lineId: batch.lineId,
      approvalRequestId,
      quantity,
      keyVersion,
      manifestHash: Buffer.alloc(32),
    })
    .returning();

  const cartonIssuance = batch.cartonCount && batch.unitsPerCarton
    ? Array.from({ length: batch.cartonCount }, (_, i) => {
            const cartonIndex = i + 1;
            const randomIdentity = randomBytes(16);
            const code = `${issuer.alias}-${product.alias}-B${batch.shortId.toString(36).toUpperCase()}-C${String(cartonIndex).padStart(3, "0")}`;
            const body = `${batch.id}:${cartonIndex}:${randomIdentity.toString("base64url")}`;
            const credential = `CT1.${randomIdentity.toString("base64url")}.${kms.mac("carton-credential", body).subarray(0, 16).toString("base64url")}`;
            const cuis = issueCuisCredential({ type: "carton", manufacturerId: batch.manufacturerId, productId: batch.productId, batchId: batch.id, randomIdentity });
            return {
              row: { manufacturerId: batch.manufacturerId, productId: batch.productId, batchId: batch.id, cartonIndex, code, randomIdentity, credential, cuisVersion: cuis.version, cuisKeyVersion: cuis.keyVersion, cuisAuthTag: cuis.authTag, cuisCredential: cuis.payload, expectedUnits: batch.unitsPerCarton! },
              cuis,
            };
          })
    : [];
  const cartonRows = cartonIssuance.length
    ? await tx.insert(schema.cartons).values(cartonIssuance.map((entry) => entry.row)).returning({ id: schema.cartons.id, cartonIndex: schema.cartons.cartonIndex })
    : [];
  const cartonCredentialByIndex = new Map(cartonIssuance.map((entry) => [entry.row.cartonIndex, entry.cuis]));
  await registerCuisCredentials(
    tx,
    cartonRows.map((carton) => ({ type: "carton", subjectId: carton.id, credential: cartonCredentialByIndex.get(carton.cartonIndex)!, createdBy: batch.createdBy })),
  );
  const cartonByIndex = new Map(cartonRows.map((c) => [c.cartonIndex, c.id]));

  const manifest: { labelIndex: number; random: Buffer; digest: Buffer }[] = [];
  for (let start = 1; start <= quantity; start += ISSUANCE_CHUNK) {
    const end = Math.min(quantity, start + ISSUANCE_CHUNK - 1);
    let pending = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const units = new Map<number, { id: string; random: Buffer }>();
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt > 3) throw new Error("Identity reservation failed repeatedly; check entropy source");
      const rows = pending.map((labelIndex) => ({
        randomIdentity: randomBytes(16),
        manufacturerId: batch.manufacturerId,
        productId: batch.productId,
        batchId: batch.id,
        printJobId: job.id,
        cartonId: batch.unitsPerCarton && batch.cartonCount && labelIndex <= batch.unitsPerCarton * batch.cartonCount ? cartonByIndex.get(Math.ceil(labelIndex / batch.unitsPerCarton)) : undefined,
        labelIndex,
      }));
      const inserted = await tx
        .insert(schema.units)
        .values(rows)
        .onConflictDoNothing({ target: schema.units.randomIdentity })
        .returning({ id: schema.units.id, labelIndex: schema.units.labelIndex, random: schema.units.randomIdentity });
      for (const u of inserted) units.set(u.labelIndex, { id: u.id, random: u.random });
      pending = pending.filter((i) => !units.has(i));
    }

    const issuedUnitCredentials = [...units.values()].map((u) => {
        const legacy = signClaims({ issuerShortId: issuer.shortId, productShortId: product.shortId, batchShortId: batch.shortId, unitRandom: u.random });
        const cuis = issueCuisCredential({ type: "unit", manufacturerId: batch.manufacturerId, productId: batch.productId, batchId: batch.id, randomIdentity: u.random });
        return { unitId: u.id, cuis, row: {
          unitId: u.id,
          formatVersion: CREDENTIAL_FORMAT_VERSION,
          ...legacy,
          cuisVersion: cuis.version,
          cuisKeyVersion: cuis.keyVersion,
          cuisAuthTag: cuis.authTag,
          cuisPayload: cuis.payload,
        } };
      });
    await tx.insert(schema.credentials).values(issuedUnitCredentials.map((entry) => entry.row));
    await registerCuisCredentials(
      tx,
      issuedUnitCredentials.map((entry) => ({ type: "unit", subjectId: entry.unitId, credential: entry.cuis, createdBy: batch.createdBy })),
    );

    let codePending = [...units.entries()];
    const digests = new Map<number, Buffer>();
    for (let attempt = 0; codePending.length > 0; attempt++) {
      if (attempt > 3) throw new Error("Numeric reference allocation failed repeatedly");
      const rows = codePending.map(([labelIndex, u]) => {
        const code = generateCode();
        return {
          labelIndex,
          value: {
            unitId: u.id,
            namespace: CODE_NAMESPACE,
            lookupDigest: kms.mac("code-lookup", `${CODE_NAMESPACE}:${code}`),
            codeCiphertext: kms.encrypt("manual-code", code, u.id),
          },
        };
      });
      const inserted = await tx
        .insert(schema.manualCodes)
        .values(rows.map((r) => r.value))
        .onConflictDoNothing({ target: [schema.manualCodes.namespace, schema.manualCodes.lookupDigest] })
        .returning({ unitId: schema.manualCodes.unitId });
      const ok = new Set(inserted.map((r) => r.unitId));
      for (const r of rows) if (ok.has(r.value.unitId)) digests.set(r.labelIndex, r.value.lookupDigest);
      codePending = codePending.filter(([labelIndex]) => !digests.has(labelIndex));
    }
    for (const [labelIndex, u] of units) manifest.push({ labelIndex, random: u.random, digest: digests.get(labelIndex)! });
  }

  const h = createHash("sha256");
  for (const m of manifest.sort((a, b) => a.labelIndex - b.labelIndex)) {
    h.update(`${m.labelIndex}:${m.random.toString("hex")}:${m.digest.toString("hex")}\n`);
  }
  const manifestHash = h.digest();
  await tx.update(schema.printJobs).set({ manifestHash }).where(eq(schema.printJobs.id, job.id));
  return { ...job, manifestHash };
}

// ---------------------------------------------------------------- printing

export async function startPrintJob(actor: Actor, jobId: string) {
  return getDb().transaction(async (tx) => {
    const job = await loadJob(tx, actor, jobId, true);
    const batch = await loadBatch(tx, actor, job.batchId);
    await authorize(actor, "print_job:execute", batchScope(batch), { type: "print_job", id: job.id });
    const now = new Date();
    const leasedByOther = job.leaseHolder && job.leaseHolder !== actor.userId && job.leaseExpiresAt && job.leaseExpiresAt > now;
    if (job.status === "completed") throw conflict("This print job is already completed.");
    if (leasedByOther) throw conflict("Another operator holds the lease for this print job.");
    await tx
      .update(schema.printJobs)
      .set({ status: "in_progress", leaseHolder: actor.userId, leaseExpiresAt: new Date(now.getTime() + LEASE_HOURS * 3600_000) })
      .where(eq(schema.printJobs.id, job.id));
    await appendAudit(tx, {
      manufacturerId: job.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "print_job.lease",
      resourceType: "print_job",
      resourceId: job.id,
      decision: "allow",
    });
  });
}

function assertLease(actor: Actor, job: typeof schema.printJobs.$inferSelect) {
  if (job.status !== "in_progress") throw conflict("Start the print job before reporting production.");
  if (job.leaseHolder !== actor.userId || !job.leaseExpiresAt || job.leaseExpiresAt <= new Date()) {
    throw forbidden("Your lease on this print job is missing or expired. Start the job again.");
  }
}

export type Label = { unitId: string; labelIndex: number; payload: string; code: string; state: string; cartonCode: string | null };

/** Decrypts print data for the lease holder only. Every retrieval is audited. */
export async function getPrintLabels(actor: Actor, jobId: string, opts: { offset?: number; limit?: number } = {}) {
  return getDb().transaction(async (tx) => {
    const job = await loadJob(tx, actor, jobId);
    const batch = await loadBatch(tx, actor, job.batchId);
    await authorize(actor, "print_job:execute", batchScope(batch), { type: "print_job", id: job.id });
    assertLease(actor, job);
    const [[issuer], [product]] = await Promise.all([
      tx.select({ shortId: schema.manufacturers.shortId }).from(schema.manufacturers).where(eq(schema.manufacturers.id, batch.manufacturerId)),
      tx.select({ shortId: schema.products.shortId }).from(schema.products).where(eq(schema.products.id, batch.productId)),
    ]);
    const rows = await tx
      .select({
        unitId: schema.units.id,
        labelIndex: schema.units.labelIndex,
        random: schema.units.randomIdentity,
        state: schema.units.state,
        keyVersion: schema.credentials.keyVersion,
        formatVersion: schema.credentials.formatVersion,
        signature: schema.credentials.signature,
        cuisPayload: schema.credentials.cuisPayload,
        codeCiphertext: schema.manualCodes.codeCiphertext,
        cartonCode: schema.cartons.code,
      })
      .from(schema.units)
      .innerJoin(schema.credentials, eq(schema.credentials.unitId, schema.units.id))
      .innerJoin(schema.manualCodes, eq(schema.manualCodes.unitId, schema.units.id))
      .leftJoin(schema.cartons, eq(schema.cartons.id, schema.units.cartonId))
      .where(eq(schema.units.printJobId, job.id))
      .orderBy(asc(schema.units.labelIndex))
      .offset(opts.offset ?? 0)
      .limit(opts.limit ?? job.quantity);
    await appendAudit(tx, {
      manufacturerId: job.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "print_job.labels_retrieved",
      resourceType: "print_job",
      resourceId: job.id,
      decision: "allow",
      detail: { count: rows.length, offset: opts.offset ?? 0 },
    });
    return rows.map<Label>((r) => ({
      unitId: r.unitId,
      labelIndex: r.labelIndex,
      state: r.state,
      code: kms.decrypt("manual-code", r.codeCiphertext, r.unitId),
      cartonCode: r.cartonCode,
      payload: r.cuisPayload ?? buildPayload(
        {
          formatVersion: r.formatVersion,
          keyVersion: r.keyVersion,
          issuerShortId: issuer.shortId,
          productShortId: product.shortId,
          batchShortId: batch.shortId,
          unitRandom: r.random,
        },
        r.signature,
      ),
    }));
  });
}

export type ProductionEventInput = {
  eventId: string;
  unitId: string;
  type: "printed" | "rejected";
  reason?: string;
  occurredAt?: Date;
};

/** Idempotent production outcomes: replaying an event id is a no-op; a second outcome for a unit is refused. */
export async function reportProductionEvents(actor: Actor, jobId: string, events: ProductionEventInput[]) {
  if (events.length === 0) return { recorded: 0, duplicates: 0 };
  if (events.length > 2000) throw invalid("Report at most 2000 events per request.");
  return getDb().transaction(async (tx) => {
    const job = await loadJob(tx, actor, jobId, true);
    const batch = await loadBatch(tx, actor, job.batchId);
    const scope = batchScope(batch);
    if (events.some((e) => e.type === "printed")) await authorize(actor, "unit:report_printed", scope, { type: "print_job", id: job.id });
    if (events.some((e) => e.type === "rejected")) await authorize(actor, "unit:report_rejected", scope, { type: "print_job", id: job.id });
    assertLease(actor, job);
    for (const e of events) if (e.type === "rejected" && !e.reason?.trim()) throw invalid("A reason is required for rejected labels.");
    return recordEvents(tx, actor, job, events);
  });
}

async function recordEvents(
  tx: Tx,
  actor: Actor,
  job: typeof schema.printJobs.$inferSelect,
  events: { eventId: string; unitId: string; type: "printed" | "rejected" | "unused"; reason?: string; occurredAt?: Date }[],
) {
  const unitIds = [...new Set(events.map((e) => e.unitId))];
  const owned = await tx
    .select({ id: schema.units.id, state: schema.units.state, labelIndex: schema.units.labelIndex })
    .from(schema.units)
    .where(and(eq(schema.units.printJobId, job.id), inArray(schema.units.id, unitIds)))
    .for("update");
  if (owned.length !== unitIds.length) throw invalid("One or more units do not belong to this print job.");
  const unitById = new Map(owned.map((u) => [u.id, u]));

  // Replays of an already-recorded event id are acknowledged without effect.
  const prior = await tx
    .select()
    .from(schema.productionEvents)
    .where(inArray(schema.productionEvents.id, events.map((e) => e.eventId)));
  const priorById = new Map(prior.map((r) => [r.id, r]));
  const skipped = events.filter((e) => priorById.has(e.eventId));
  for (const e of skipped) {
    const p = priorById.get(e.eventId)!;
    if (p.unitId !== e.unitId || p.type !== e.type) throw conflict("Event id was reused for a different outcome.");
  }
  const fresh = events.filter((e) => !priorById.has(e.eventId));
  const seen = new Set<string>();
  for (const e of fresh) {
    if (seen.has(e.unitId)) throw invalid("Each label may appear only once per report.");
    seen.add(e.unitId);
    const unit = unitById.get(e.unitId)!;
    if (unit.state !== "RESERVED") {
      throw conflict(`Label #${unit.labelIndex} already has a recorded outcome; outcomes cannot be changed.`);
    }
  }

  const inserted = fresh.length
    ? await tx
        .insert(schema.productionEvents)
        .values(
          fresh.map((e) => ({
            id: e.eventId,
            manufacturerId: job.manufacturerId,
            printJobId: job.id,
            unitId: e.unitId,
            type: e.type,
            reason: e.reason?.trim() || null,
            actorId: actor.userId,
            occurredAt: e.occurredAt ?? new Date(),
          })),
        )
        .returning({ id: schema.productionEvents.id, unitId: schema.productionEvents.unitId, type: schema.productionEvents.type })
    : [];

  const now = new Date();
  const byType = (t: string) => inserted.filter((r) => r.type === t).map((r) => r.unitId);
  const transitions: [string[], "PRINTED_PENDING" | "REJECTED" | "VOIDED"][] = [
    [byType("printed"), "PRINTED_PENDING"],
    [byType("rejected"), "REJECTED"],
    [byType("unused"), "VOIDED"],
  ];
  for (const [ids, state] of transitions) {
    if (!ids.length) continue;
    const updated = await tx
      .update(schema.units)
      .set({ state, stateChangedAt: now, ...(state === "PRINTED_PENDING" ? { printedAt: now } : {}) })
      .where(and(inArray(schema.units.id, ids), eq(schema.units.state, "RESERVED")))
      .returning({ id: schema.units.id });
    if (updated.length !== ids.length) throw conflict("A label changed state concurrently; retry the report.");
  }

  if (inserted.length) {
    await appendAudit(tx, {
      manufacturerId: job.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "production.events",
      resourceType: "print_job",
      resourceId: job.id,
      decision: "allow",
      detail: {
        printed: byType("printed").length,
        rejected: byType("rejected").length,
        unused: byType("unused").length,
        duplicatesIgnored: skipped.length,
      },
    });
  }
  return { recorded: inserted.length, duplicates: skipped.length };
}

/**
 * Line simulator: plays the inline camera. Each remaining label's printed content is decoded and
 * cryptographically verified exactly as a consumer scan would; `smudged` labels fail the read.
 * `holdBack` labels at the end of the roll are left unprinted. Event ids derive from `runId`, so a
 * retried run is idempotent.
 */
export async function runLineSimulation(actor: Actor, jobId: string, runId: string, opts: { smudged: number; holdBack: number }) {
  const labels = (await getPrintLabels(actor, jobId)).filter((l) => l.state === "RESERVED");
  const toPrint = labels.slice(0, Math.max(0, labels.length - Math.max(0, opts.holdBack)));
  const smudged = new Set<number>();
  const target = Math.min(Math.max(0, opts.smudged), toPrint.length);
  while (smudged.size < target) smudged.add(randomInt(0, toPrint.length));

  const events: ProductionEventInput[] = toPrint.map((label, i) => {
    const readable = !smudged.has(i);
    const credentialOk = readable && (looksLikeCuisCredential(label.payload) ? decodeAndVerifyCuis(label.payload, "unit").ok : decodeAndVerify(label.payload).ok);
    const codeOk = readable && checkCode(label.code).ok;
    const eventId = uuidFrom(runId, label.unitId);
    if (!readable) return { eventId, unitId: label.unitId, type: "rejected", reason: "Camera: unreadable print (smudged QR)" };
    if (!credentialOk || !codeOk) return { eventId, unitId: label.unitId, type: "rejected", reason: "Camera: printed credential failed verification" };
    return { eventId, unitId: label.unitId, type: "printed" };
  });
  const result = await reportProductionEvents(actor, jobId, events);
  return { ...result, printed: events.filter((e) => e.type === "printed").length, rejected: events.filter((e) => e.type === "rejected").length };
}

/** Operator marks one label as damaged after printing (e.g. torn during packing). */
export async function rejectLabel(actor: Actor, jobId: string, unitId: string, reason: string) {
  return getDb().transaction(async (tx) => {
    const job = await loadJob(tx, actor, jobId, true);
    const batch = await loadBatch(tx, actor, job.batchId);
    await authorize(actor, "unit:report_rejected", batchScope(batch), { type: "print_job", id: job.id });
    assertLease(actor, job);
    if (!reason.trim()) throw invalid("A reason is required for rejected labels.");
    const [unit] = await tx
      .select()
      .from(schema.units)
      .where(and(eq(schema.units.id, unitId), eq(schema.units.printJobId, job.id)))
      .for("update");
    if (!unit) throw notFound("Label not found");
    if (unit.state === "RESERVED") {
      return recordEvents(tx, actor, job, [{ eventId: uuidFrom("reject", unitId), unitId, type: "rejected", reason }]);
    }
    if (unit.state !== "PRINTED_PENDING") throw conflict("Only reserved or printed labels can be rejected.");
    // Printed but then damaged: append a correcting event; the identity is rejected permanently.
    const inserted = await tx
      .insert(schema.productionEvents)
      .values({
        id: uuidFrom("damaged", unitId),
        manufacturerId: job.manufacturerId,
        printJobId: job.id,
        unitId,
        type: "rejected",
        reason: reason.trim(),
        actorId: actor.userId,
        occurredAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: schema.productionEvents.id });
    if (!inserted.length) return { recorded: 0, duplicates: 1 };
    await tx
      .update(schema.units)
      .set({ state: "REJECTED", stateChangedAt: new Date() })
      .where(and(eq(schema.units.id, unitId), eq(schema.units.state, "PRINTED_PENDING")));
    await appendAudit(tx, {
      manufacturerId: job.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "production.label_damaged",
      resourceType: "unit",
      resourceId: unitId,
      decision: "allow",
      detail: { reason: reason.trim() },
    });
    return { recorded: 1, duplicates: 0 };
  });
}

export async function finishPrintJob(actor: Actor, jobId: string) {
  return getDb().transaction(async (tx) => {
    const job = await loadJob(tx, actor, jobId, true);
    const batch = await loadBatch(tx, actor, job.batchId);
    await authorize(actor, "print_job:execute", batchScope(batch), { type: "print_job", id: job.id });
    assertLease(actor, job);
    const remaining = await tx
      .select({ id: schema.units.id })
      .from(schema.units)
      .where(and(eq(schema.units.printJobId, job.id), eq(schema.units.state, "RESERVED")));
    if (remaining.length) {
      await recordEvents(
        tx,
        actor,
        job,
        remaining.map((u) => ({ eventId: uuidFrom("unused", u.id), unitId: u.id, type: "unused" as const, reason: "Returned unused at end of run" })),
      );
    }
    await tx
      .update(schema.printJobs)
      .set({ status: "completed", completedAt: new Date(), leaseExpiresAt: new Date() })
      .where(eq(schema.printJobs.id, job.id));
    await appendAudit(tx, {
      manufacturerId: job.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "print_job.complete",
      resourceType: "print_job",
      resourceId: job.id,
      decision: "allow",
      detail: { voidedUnused: remaining.length },
    });
    return { voided: remaining.length };
  });
}

// ---------------------------------------------------------------- reconciliation & release

export async function unitStateCounts(tx: Tx, batchId: string) {
  const rows = await tx
    .select({ state: schema.units.state, n: count() })
    .from(schema.units)
    .where(eq(schema.units.batchId, batchId))
    .groupBy(schema.units.state);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.state] = Number(r.n);
  return counts;
}

export async function reconcileBatch(actor: Actor, batchId: string, physicalCount: number, note: string) {
  return getDb().transaction(async (tx) => {
    const batch = await loadBatch(tx, actor, batchId, true);
    await authorize(actor, "batch:reconcile", batchScope(batch), { type: "batch", id: batch.id });
    if (batch.status !== "allocated") throw conflict("Only an allocated batch can be reconciled.");
    const [job] = await tx.select().from(schema.printJobs).where(eq(schema.printJobs.batchId, batch.id));
    if (!job || job.status !== "completed") throw conflict("The print job must be completed before reconciliation.");

    const c = await unitStateCounts(tx, batch.id);
    const issued = Object.values(c).reduce((a, b) => a + b, 0);
    const printed = c.PRINTED_PENDING ?? 0;
    const rejected = c.REJECTED ?? 0;
    const voided = c.VOIDED ?? 0;
    if ((c.RESERVED ?? 0) > 0 || issued !== printed + rejected + voided || issued !== job.quantity) {
      throw conflict("Identity counts do not balance. Every issued label must be printed, rejected or voided.");
    }
    if (!Number.isInteger(physicalCount) || physicalCount !== printed) {
      // Recorded outside this transaction so the exception survives the rollback.
      await recordDenial({
        manufacturerId: batch.manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "batch.reconcile.exception",
        resourceType: "batch",
        resourceId: batch.id,
        detail: { physicalCount, printed },
      });
      throw conflict(
        `Physical count (${physicalCount}) does not match ${printed} good printed labels. Investigate the difference before reconciling; no units were activated.`,
      );
    }
    await tx.insert(schema.reconciliations).values({
      manufacturerId: batch.manufacturerId,
      batchId: batch.id,
      issued,
      printed,
      rejected,
      voided,
      physicalCount,
      performedBy: actor.userId,
      note: note.trim() || null,
    });
    await tx
      .update(schema.units)
      .set({ state: "QA_PENDING", stateChangedAt: new Date() })
      .where(and(eq(schema.units.batchId, batch.id), eq(schema.units.state, "PRINTED_PENDING")));
    const reconciledAt = new Date();
    await tx.update(schema.cartons).set({ status: "printed", printedAt: reconciledAt, reconciledAt }).where(eq(schema.cartons.batchId, batch.id));
    await tx.update(schema.batches).set({ status: "reconciled", lastModifiedBy: actor.userId, updatedAt: reconciledAt }).where(eq(schema.batches.id, batch.id));
    await appendAudit(tx, {
      manufacturerId: batch.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "batch.reconcile",
      resourceType: "batch",
      resourceId: batch.id,
      decision: "allow",
      detail: { issued, printed, rejected, voided, physicalCount },
    });
    return { issued, printed, rejected, voided };
  });
}

export async function releaseBatch(actor: Actor, batchId: string, samplesInspected: boolean, note: string) {
  return getDb().transaction(async (tx) => {
    const batch = await loadBatch(tx, actor, batchId, true);
    const scope = batchScope(batch);
    await authorize(actor, "batch:release", scope, { type: "batch", id: batch.id });
    const [job] = await tx.select().from(schema.printJobs).where(eq(schema.printJobs.batchId, batch.id));
    const [request] = job
      ? await tx.select().from(schema.approvalRequests).where(eq(schema.approvalRequests.id, job.approvalRequestId))
      : [];
    const printers = job
      ? await tx.selectDistinct({ actorId: schema.productionEvents.actorId }).from(schema.productionEvents).where(eq(schema.productionEvents.printJobId, job.id))
      : [];
    await requireIndependent(
      actor,
      "batch:release",
      scope,
      [
        { userId: batch.createdBy, why: "created this batch" },
        { userId: request?.requesterId, why: "requested its identities" },
        ...printers.map((p) => ({ userId: p.actorId, why: "reported its production" })),
      ],
      { type: "batch", id: batch.id },
    );
    if (batch.status !== "reconciled") throw conflict("Only a reconciled batch can be released.");
    if (!samplesInspected) throw invalid("Confirm that physical samples were inspected.");
    if (!note.trim()) throw invalid("A QA release note is required.");
    if (batch.expiryDate <= lagosToday()) throw conflict("An expired batch cannot be released.");

    const now = new Date();
    const activated = await tx
      .update(schema.units)
      .set({ state: "ACTIVE", activatedAt: now, stateChangedAt: now })
      .where(and(eq(schema.units.batchId, batch.id), eq(schema.units.state, "QA_PENDING")))
      .returning({ id: schema.units.id });
    await tx
      .update(schema.batches)
      .set({ status: "released", releasedBy: actor.userId, releasedAt: now, releaseNote: note.trim(), lastModifiedBy: actor.userId, updatedAt: now })
      .where(eq(schema.batches.id, batch.id));
    await tx.update(schema.cartons).set({ status: "released" }).where(eq(schema.cartons.batchId, batch.id));
    await appendAudit(tx, {
      manufacturerId: batch.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: "batch.release",
      resourceType: "batch",
      resourceId: batch.id,
      decision: "allow",
      detail: { activated: activated.length, note: note.trim() },
    });
    return { activated: activated.length };
  });
}
