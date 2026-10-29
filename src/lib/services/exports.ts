import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { authorize, type Actor } from "@/lib/authz";
import { buildPayload } from "@/lib/credential";
import { invalid, notFound } from "@/lib/errors";
import { kms } from "@/lib/kms";

export type BatchExportType = "csv" | "unit_labels_pdf" | "carton_labels_pdf" | "batch_summary_pdf";

export async function prepareBatchExport(actor: Actor, batchId: string, type: BatchExportType, scope: { unitIds?: string[]; cartonIds?: string[] } = {}) {
  if (!actor.membership || !/^[0-9a-f-]{36}$/.test(batchId)) throw notFound();
  if ((scope.unitIds?.length ?? 0) > 1000 || (scope.cartonIds?.length ?? 0) > 200) throw invalid("Selection is too large. Export the entire batch instead.");
  return getDb().transaction(async (tx) => {
    const [record] = await tx
      .select({ batch: schema.batches, product: schema.products, manufacturer: schema.manufacturers, factory: schema.factories, line: schema.productionLines })
      .from(schema.batches)
      .innerJoin(schema.products, eq(schema.products.id, schema.batches.productId))
      .innerJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.batches.manufacturerId))
      .innerJoin(schema.factories, eq(schema.factories.id, schema.batches.factoryId))
      .innerJoin(schema.productionLines, eq(schema.productionLines.id, schema.batches.lineId))
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.manufacturerId, actor.membership!.manufacturerId)));
    if (!record) throw notFound("Batch not found");
    await authorize(actor, "print_job:export", record.batch, { type: "batch", id: batchId });
    const [job] = await tx.insert(schema.exportJobs).values({
      manufacturerId: record.batch.manufacturerId,
      batchId,
      requestedBy: actor.userId,
      type,
      scope,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    }).returning();
    const units = await tx
      .select({
        unit: schema.units,
        cartonCode: schema.cartons.code,
        cartonId: schema.cartons.id,
        formatVersion: schema.credentials.formatVersion,
        keyVersion: schema.credentials.keyVersion,
        signature: schema.credentials.signature,
        cuisVersion: schema.credentials.cuisVersion,
        cuisKeyVersion: schema.credentials.cuisKeyVersion,
        cuisPayload: schema.credentials.cuisPayload,
        codeCiphertext: schema.manualCodes.codeCiphertext,
      })
      .from(schema.units)
      .innerJoin(schema.credentials, eq(schema.credentials.unitId, schema.units.id))
      .innerJoin(schema.manualCodes, eq(schema.manualCodes.unitId, schema.units.id))
      .leftJoin(schema.cartons, eq(schema.cartons.id, schema.units.cartonId))
      .where(and(
        eq(schema.units.batchId, batchId),
        scope.unitIds?.length ? inArray(schema.units.id, scope.unitIds) : undefined,
        scope.cartonIds?.length ? inArray(schema.units.cartonId, scope.cartonIds) : undefined,
      ))
      .orderBy(asc(schema.units.labelIndex));
    const cartons = await tx.select().from(schema.cartons).where(and(eq(schema.cartons.batchId, batchId), scope.cartonIds?.length ? inArray(schema.cartons.id, scope.cartonIds) : undefined)).orderBy(asc(schema.cartons.cartonIndex));
    await appendAudit(tx, { manufacturerId: record.batch.manufacturerId, actorType: "user", actorId: actor.userId, action: "batch.export.request", resourceType: "batch", resourceId: batchId, decision: "allow", detail: { exportJobId: job.id, type, scope, recordCount: units.length } });
    return {
      ...record,
      cartons,
      exportJobId: job.id,
      units: units.map((row) => ({
        ...row.unit,
        cartonCode: row.cartonCode,
        cartonId: row.cartonId,
        code: kms.decrypt("manual-code", row.codeCiphertext, row.unit.id),
        payload: row.cuisPayload ?? buildPayload({ formatVersion: row.formatVersion, keyVersion: row.keyVersion, issuerShortId: record.manufacturer.shortId, productShortId: record.product.shortId, batchShortId: record.batch.shortId, unitRandom: row.unit.randomIdentity }, row.signature),
        credentialVersion: row.cuisPayload ? `CUIS ${row.cuisVersion} · key ${row.cuisKeyVersion}` : `Legacy ${row.formatVersion}.${row.keyVersion}`,
      })),
    };
  });
}

export async function completeBatchExport(actor: Actor, jobId: string, content: Buffer, recordCount: number) {
  const hash = createHash("sha256").update(content).digest("hex");
  await getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(schema.exportJobs).where(and(eq(schema.exportJobs.id, jobId), eq(schema.exportJobs.requestedBy, actor.userId), eq(schema.exportJobs.manufacturerId, actor.membership!.manufacturerId)));
    if (!job) throw notFound("Export job not found");
    const now = new Date();
    await tx.update(schema.exportJobs).set({ status: "completed", recordCount, contentHash: hash, completedAt: now }).where(eq(schema.exportJobs.id, jobId));
    await appendAudit(tx, { manufacturerId: job.manufacturerId, actorType: "user", actorId: actor.userId, action: "batch.export.completed", resourceType: "batch", resourceId: job.batchId, decision: "allow", detail: { exportJobId: job.id, type: job.type, recordCount, contentHash: hash } });
  });
  return hash;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildBatchCsv(data: Awaited<ReturnType<typeof prepareBatchExport>>, baseUrl: string) {
  const header = ["batch_reference", "carton_reference", "unit_reference", "label_index", "numeric_verification_code", "verification_url", "lifecycle_status", "issued_at", "printed_at", "activated_at"];
  const rows = data.units.map((unit) => [data.batch.lot, unit.cartonCode ?? "LOOSE", unit.id, unit.labelIndex, unit.code, `${baseUrl}/v/${unit.payload}`, unit.state, unit.issuedAt.toISOString(), unit.printedAt?.toISOString() ?? "", unit.activatedAt?.toISOString() ?? ""]);
  return Buffer.from([header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n", "utf8");
}
