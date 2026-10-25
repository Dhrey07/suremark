import "server-only";
import { and, asc, eq, exists, gt, inArray, lte, ne, notExists, sql, type SQL } from "drizzle-orm";
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

  // One unchecked pack from each of up to three batches.
  const genuine: Sample[] = [];
  for (const b of batches.slice(0, 3)) {
    const [picked] = await pick(and(sellable, eq(s.units.batchId, b.id)), 1, true);
    if (picked) genuine.push(picked);
  }

  // A code already flagged by the risk engine as copied (checked in distant states within minutes).
  const flagged = exists(
    getDb()
      .select({ x: sql`1` })
      .from(s.riskCases)
      .where(and(eq(s.riskCases.unitId, s.units.id), eq(s.riskCases.kind, "possible_clone"), ne(s.riskCases.status, "closed"))),
  );
  const [clones, recalled, expired, unreleased] = await Promise.all([
    pick(and(eq(s.units.state, "ACTIVE"), flagged), 1, false),
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
  return { genuine, clone: clones[0] ?? null, recalled: recalled[0] ?? null, expired: expired[0] ?? null, unreleased: unreleased[0] ?? null, fakeCode, forged };
}
