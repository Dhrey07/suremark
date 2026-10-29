import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type DbOrTx } from "@/db";
import { decodeAndVerifyCuis, encodeCuisClaims, type IssuedCuisCredential } from "./cuis";
import { kms, type CuisCredentialType } from "./kms";

export type CredentialSubject = {
  type: CuisCredentialType;
  subjectId: string;
  credential: IssuedCuisCredential;
  createdBy?: string | null;
};

export function credentialFingerprint(payload: string): Buffer {
  return createHash("sha256").update(Buffer.from(payload, "base64url")).digest();
}

function keyIdentifier(type: CuisCredentialType, version: number) {
  return `cuis-v1-${type}-v${version}`;
}

async function ensureSigningKey(db: DbOrTx, type: CuisCredentialType, version: number) {
  const identifier = keyIdentifier(type, version);
  const metadata = kms.cuisKeyMetadata().find((key) => key.version === version);
  if (!metadata) throw new Error(`CUIS signing key v${version} is not available`);
  const status = metadata.status === "verify_only" ? "retired" : metadata.status;
  await db
    .insert(schema.signingKeys)
    .values({
      keyIdentifier: identifier,
      algorithm: "hmac_sha256",
      purpose: type,
      keyVersion: version,
      protectedKeyReference: `kms://${metadata.provider}/cuis-v1/${type}/v${version}`,
      status,
      activatedAt: status === "active" ? new Date() : null,
      retiredAt: status === "retired" ? new Date() : null,
      revokedAt: status === "revoked" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: schema.signingKeys.keyIdentifier,
      set: {
        status,
        retiredAt: status === "retired" ? new Date() : null,
        revokedAt: status === "revoked" ? new Date() : null,
        updatedAt: new Date(),
      },
    });
  const [key] = await db.select().from(schema.signingKeys).where(eq(schema.signingKeys.keyIdentifier, identifier));
  if (!key) throw new Error(`CUIS signing-key metadata ${identifier} was not registered`);
  return key;
}

/**
 * Registers issued credentials and their strongly typed subjects in the same caller transaction.
 * The database triggers independently verify subject type and manufacturer/product/batch scope.
 */
export async function registerCuisCredentials(db: DbOrTx, records: CredentialSubject[]) {
  if (!records.length) return [];
  const grouped = new Map<string, typeof records>();
  for (const record of records) {
    const decoded = decodeAndVerifyCuis(record.credential.payload, record.type);
    if (!decoded.ok) throw new Error(`Refusing to register invalid CUIS credential: ${decoded.reason}`);
    const key = `${record.type}:${record.credential.keyVersion}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  const ids: { credentialId: string; subjectId: string; type: CuisCredentialType }[] = [];
  for (const group of grouped.values()) {
    const first = group[0]!;
    const signingKey = await ensureSigningKey(db, first.type, first.credential.keyVersion);
    const values = group.map((record) => ({
      credentialVersion: record.credential.version,
      credentialType: record.type,
      manufacturerId: record.credential.manufacturerId,
      productId: record.credential.productId,
      batchId: record.type === "batch" ? null : record.credential.batchId!,
      randomIdentity: record.credential.randomIdentity,
      canonicalPayload: encodeCuisClaims(record.credential),
      authenticationAlgorithm: "hmac_sha256" as const,
      authenticationProof: record.credential.authTag,
      signingKeyId: signingKey.id,
      credentialFingerprint: credentialFingerprint(record.credential.payload),
      createdBy: record.createdBy ?? null,
    }));
    await db.insert(schema.cryptographicCredentials).values(values).onConflictDoNothing({ target: schema.cryptographicCredentials.credentialFingerprint });
    const fingerprints = values.map((value) => value.credentialFingerprint);
    const registered = await db
      .select({ id: schema.cryptographicCredentials.id, fingerprint: schema.cryptographicCredentials.credentialFingerprint })
      .from(schema.cryptographicCredentials)
      .where(inArray(schema.cryptographicCredentials.credentialFingerprint, fingerprints));
    const byFingerprint = new Map(registered.map((row) => [row.fingerprint.toString("hex"), row.id]));
    for (let index = 0; index < group.length; index++) {
      const record = group[index]!;
      const credentialId = byFingerprint.get(fingerprints[index]!.toString("hex"));
      if (!credentialId) throw new Error("Credential registry insert did not return the issued identity");
      ids.push({ credentialId, subjectId: record.subjectId, type: record.type });
    }
  }

  const batches = ids.filter((row) => row.type === "batch").map((row) => ({ credentialId: row.credentialId, batchId: row.subjectId }));
  const cartons = ids.filter((row) => row.type === "carton").map((row) => ({ credentialId: row.credentialId, cartonId: row.subjectId }));
  const units = ids.filter((row) => row.type === "unit").map((row) => ({ credentialId: row.credentialId, unitId: row.subjectId }));
  if (batches.length) await db.insert(schema.batchCredentialSubjects).values(batches).onConflictDoNothing();
  if (cartons.length) await db.insert(schema.cartonCredentialSubjects).values(cartons).onConflictDoNothing();
  if (units.length) await db.insert(schema.unitCredentialSubjects).values(units).onConflictDoNothing();
  return ids;
}

export async function resolveRegisteredUnitCredential(db: DbOrTx, payload: string) {
  const fingerprint = credentialFingerprint(payload);
  const [row] = await db
    .select({
      credential: schema.cryptographicCredentials,
      unitId: schema.unitCredentialSubjects.unitId,
    })
    .from(schema.cryptographicCredentials)
    .innerJoin(schema.unitCredentialSubjects, eq(schema.unitCredentialSubjects.credentialId, schema.cryptographicCredentials.id))
    .where(
      and(
        eq(schema.cryptographicCredentials.credentialFingerprint, fingerprint),
        eq(schema.cryptographicCredentials.credentialType, "unit"),
      ),
    );
  return row ?? null;
}

export async function authenticateCuisBeforeRegistryLookup<T>(
  payload: string,
  resolve: (claims: Extract<ReturnType<typeof decodeAndVerifyCuis>, { ok: true }>["claims"], fingerprint: Buffer) => Promise<T | null>,
) {
  const decoded = decodeAndVerifyCuis(payload, "unit");
  if (!decoded.ok) return { ok: false as const, stage: "cryptographic" as const, reason: decoded.reason };
  const fingerprint = credentialFingerprint(payload);
  const record = await resolve(decoded.claims, fingerprint);
  if (!record) return { ok: false as const, stage: "registry" as const, reason: "not_registered" as const, claims: decoded.claims, fingerprint };
  return { ok: true as const, claims: decoded.claims, fingerprint, record };
}

