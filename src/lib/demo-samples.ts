import "server-only";
import { and, asc, eq, gt, inArray, lte, notExists, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { appendAudit } from "./audit";
import type { Actor } from "./authz";
import { generateCode } from "./codes";
import { buildPayload } from "./credential";
import { lagosToday } from "./dates";
import { kms } from "./kms";

export type Sample = {
  unitId: string;
  code: string;
  payload: string;
  product: string;
  manufacturerAlias: string;
  productAlias: string;
  lot: string;
  expiry: string;
};

/** Demo only: decrypts a handful of real issued codes so a presenter can show each verification outcome. */
async function pick(where: SQL | undefined, limit: number, fresh: boolean): Promise<Sample[]> {
  const rows = await getDb()
    .select({
      unitId: s.units.id,
      random: s.units.randomIdentity,
      keyVersion: s.credentials.keyVersion,
      formatVersion: s.credentials.formatVersion,
      signature: s.credentials.signature,
      codeCiphertext: s.manualCodes.codeCiphertext,
      issuer: s.manufacturers.shortId,
      manufacturerAlias: s.manufacturers.alias,
      productShort: s.products.shortId,
      productAlias: s.products.alias,
      product: sql<string>`${s.products.name} || ' ' || ${s.products.strength}`,
      batchShort: s.batches.shortId,
      lot: s.batches.lot,
      expiry: s.batches.expiryDate,
    })
    .from(s.units)
    .innerJoin(s.credentials, eq(s.credentials.unitId, s.units.id))
    .innerJoin(s.manualCodes, eq(s.manualCodes.unitId, s.units.id))
    .innerJoin(s.batches, eq(s.batches.id, s.units.batchId))
    .innerJoin(s.products, eq(s.products.id, s.units.productId))
    .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.units.manufacturerId))
    .where(
      and(
        where,
        fresh ? notExists(getDb().select({ x: sql`1` }).from(s.verificationEvents).where(eq(s.verificationEvents.unitId, s.units.id))) : undefined,
      ),
    )
    .orderBy(asc(s.batches.shortId), asc(s.units.labelIndex))
    .limit(limit);
  return rows.map((r) => ({
    unitId: r.unitId,
    code: kms.decrypt("manual-code", r.codeCiphertext, r.unitId),
    payload: buildPayload(
      {
        formatVersion: r.formatVersion,
        keyVersion: r.keyVersion,
        issuerShortId: r.issuer,
        productShortId: r.productShort,
        batchShortId: r.batchShort,
        unitRandom: r.random,
      },
      r.signature,
    ),
    product: r.product,
    manufacturerAlias: r.manufacturerAlias,
    productAlias: r.productAlias,
    lot: r.lot,
    expiry: r.expiry,
  }));
}

export async function demoSamples(actor: Actor) {
  const today = lagosToday();
  const sellable = and(eq(s.units.state, "ACTIVE"), gt(s.batches.expiryDate, today));
  const batches = await getDb()
    .select({ id: s.batches.id })
    .from(s.batches)
    .where(and(eq(s.batches.status, "released"), gt(s.batches.expiryDate, today)))
    .orderBy(asc(s.batches.shortId));

  // One unchecked pack from each of up to three batches, plus a separate one for the copied-code demo.
  const genuine: Sample[] = [];
  let clone: Sample | null = null;
  for (const b of batches) {
    if (genuine.length === 3 && clone) break;
    const picked = await pick(and(sellable, eq(s.units.batchId, b.id)), clone ? 1 : 2, true);
    if (picked[0] && genuine.length < 3) genuine.push(picked.shift()!);
    if (!clone && picked[0]) clone = picked[0];
  }

  const [recalled, expired, unreleased] = await Promise.all([
    pick(eq(s.units.state, "RECALLED"), 1, false),
    pick(and(eq(s.units.state, "ACTIVE"), lte(s.batches.expiryDate, today)), 1, false),
    pick(inArray(s.units.state, ["VOIDED", "REJECTED"]), 1, false),
  ]);

  // A well-formed but never-issued code, and a QR whose signature has been tampered with.
  const fakeCode = generateCode();
  let forged: string | null = null;
  if (genuine[0]) {
    const raw = Buffer.from(genuine[0].payload, "base64url");
    raw[40] ^= 0x5a;
    forged = raw.toString("base64url");
  }

  await getDb().transaction((tx) =>
    appendAudit(tx, { actorType: "user", actorId: actor.userId, action: "demo.sample_codes_viewed", decision: "allow" }),
  );
  return { genuine, clone, recalled: recalled[0] ?? null, expired: expired[0] ?? null, unreleased: unreleased[0] ?? null, fakeCode, forged };
}
