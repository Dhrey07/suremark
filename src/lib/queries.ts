import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { can, memberPermissions, type Actor } from "./authz";
import { buildPayload } from "./credential";
import { notFound } from "./errors";
import { kms } from "./kms";

const s = schema;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** SQL filter restricting batches to the actor's tenant and resource grants. */
function batchScopeFilter(actor: Actor): SQL | undefined {
  const m = actor.membership;
  if (!m) return sql`false`;
  const tenant = eq(s.batches.manufacturerId, m.manufacturerId);
  if (m.grants.some((g) => g.type === "organization" && g.id === m.manufacturerId)) return tenant;
  const factories = m.grants.filter((g) => g.type === "factory").map((g) => g.id);
  const lines = m.grants.filter((g) => g.type === "line").map((g) => g.id);
  const parts: SQL[] = [];
  if (factories.length) parts.push(inArray(s.batches.factoryId, factories));
  if (lines.length) parts.push(inArray(s.batches.lineId, lines));
  return parts.length ? and(tenant, or(...parts)) : sql`false`;
}

export async function listBatches(actor: Actor, opts: { status?: string; limit?: number } = {}) {
  if (!can(actor, "batch:view")) return [];
  return getDb()
    .select({
      id: s.batches.id,
      lot: s.batches.lot,
      status: s.batches.status,
      plannedQuantity: s.batches.plannedQuantity,
      expiryDate: s.batches.expiryDate,
      manufactureDate: s.batches.manufactureDate,
      createdAt: s.batches.createdAt,
      productName: s.products.name,
      productStrength: s.products.strength,
      productAlias: s.products.alias,
      lineName: s.productionLines.name,
      factoryName: s.factories.name,
    })
    .from(s.batches)
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.productionLines, eq(s.productionLines.id, s.batches.lineId))
    .innerJoin(s.factories, eq(s.factories.id, s.batches.factoryId))
    .where(and(batchScopeFilter(actor), opts.status ? eq(s.batches.status, opts.status as "draft") : undefined))
    .orderBy(desc(s.batches.createdAt))
    .limit(opts.limit ?? 200);
}

export async function getBatchDetail(actor: Actor, batchId: string) {
  const m = actor.membership;
  if (!m || !UUID_RE.test(batchId)) throw notFound();
  const db = getDb();
  const [row] = await db
    .select({ batch: s.batches, product: s.products, line: s.productionLines, factory: s.factories, manufacturer: s.manufacturers })
    .from(s.batches)
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.productionLines, eq(s.productionLines.id, s.batches.lineId))
    .innerJoin(s.factories, eq(s.factories.id, s.batches.factoryId))
    .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.batches.manufacturerId))
    .where(and(eq(s.batches.id, batchId), eq(s.batches.manufacturerId, m.manufacturerId)));
  if (!row || !can(actor, "batch:view", row.batch)) throw notFound();

  const [job] = await db.select().from(s.printJobs).where(eq(s.printJobs.batchId, batchId));
  const [counts, cartons, approvals, reconciliation, recalls, activity, users, exports] = await Promise.all([
    db.select({ state: s.units.state, n: count() }).from(s.units).where(eq(s.units.batchId, batchId)).groupBy(s.units.state),
    db.select().from(s.cartons).where(eq(s.cartons.batchId, batchId)).orderBy(s.cartons.cartonIndex),
    db
      .select()
      .from(s.approvalRequests)
      .where(and(eq(s.approvalRequests.resourceId, batchId), eq(s.approvalRequests.manufacturerId, m.manufacturerId)))
      .orderBy(desc(s.approvalRequests.createdAt)),
    db.select().from(s.reconciliations).where(eq(s.reconciliations.batchId, batchId)),
    db.select().from(s.recalls).where(eq(s.recalls.batchId, batchId)).orderBy(desc(s.recalls.createdAt)),
    db
      .select()
      .from(s.auditEvents)
      .where(
        and(
          eq(s.auditEvents.manufacturerId, m.manufacturerId),
          or(eq(s.auditEvents.resourceId, batchId), job ? eq(s.auditEvents.resourceId, job.id) : undefined),
        ),
      )
      .orderBy(desc(s.auditEvents.seq))
      .limit(50),
    db.select({ id: s.users.id, name: s.users.name, title: s.users.title }).from(s.users),
    db.select().from(s.exportJobs).where(eq(s.exportJobs.batchId, batchId)).orderBy(desc(s.exportJobs.createdAt)).limit(20),
  ]);
  const printerIds = job
    ? (await db.selectDistinct({ id: s.productionEvents.actorId }).from(s.productionEvents).where(eq(s.productionEvents.printJobId, job.id))).map(
        (r) => r.id,
      )
    : [];
  return {
    ...row,
    job: job ?? null,
    counts: Object.fromEntries(counts.map((c) => [c.state, Number(c.n)])) as Record<string, number>,
    cartons,
    approvals,
    reconciliation: reconciliation[0] ?? null,
    recalls,
    activity,
    exports,
    printerIds,
    userName: Object.fromEntries(users.map((u) => [u.id, u.name])) as Record<string, string>,
    userTitle: Object.fromEntries(users.map((u) => [u.id, u.title])) as Record<string, string | null>,
  };
}

export async function pendingApprovals(actor: Actor) {
  const m = actor.membership;
  if (!m) return [];
  const perms = memberPermissions(m);
  const rows = await getDb()
    .select({ request: s.approvalRequests, batch: s.batches, product: s.products, requester: s.users.name })
    .from(s.approvalRequests)
    .innerJoin(s.batches, eq(s.batches.id, s.approvalRequests.resourceId))
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.users, eq(s.users.id, s.approvalRequests.requesterId))
    .where(and(eq(s.approvalRequests.manufacturerId, m.manufacturerId), eq(s.approvalRequests.status, "pending")))
    .orderBy(desc(s.approvalRequests.createdAt));
  return rows.filter((r) =>
    r.request.action === "identity_allocation"
      ? perms.has("identity:allocate:approve") && can(actor, "identity:allocate:approve", r.batch)
      : perms.has("recall:approve") && can(actor, "recall:approve", r.batch),
  );
}

export async function operatorJobs(actor: Actor) {
  const m = actor.membership;
  if (!m || !can(actor, "print_job:execute")) return [];
  const rows = await getDb()
    .select({ job: s.printJobs, batch: s.batches, product: s.products, line: s.productionLines })
    .from(s.printJobs)
    .innerJoin(s.batches, eq(s.batches.id, s.printJobs.batchId))
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.productionLines, eq(s.productionLines.id, s.printJobs.lineId))
    .where(eq(s.printJobs.manufacturerId, m.manufacturerId))
    .orderBy(desc(s.printJobs.createdAt));
  return rows.filter((r) => can(actor, "print_job:execute", r.batch));
}

export async function getPrintJob(actor: Actor, jobId: string) {
  const m = actor.membership;
  if (!m || !UUID_RE.test(jobId)) throw notFound();
  const db = getDb();
  const [row] = await db
    .select({ job: s.printJobs, batch: s.batches, product: s.products, line: s.productionLines, manufacturer: s.manufacturers })
    .from(s.printJobs)
    .innerJoin(s.batches, eq(s.batches.id, s.printJobs.batchId))
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.productionLines, eq(s.productionLines.id, s.printJobs.lineId))
    .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.printJobs.manufacturerId))
    .where(and(eq(s.printJobs.id, jobId), eq(s.printJobs.manufacturerId, m.manufacturerId)));
  if (!row || !can(actor, "batch:view", row.batch)) throw notFound();
  const [units, events, leaseHolder] = await Promise.all([
    db
      .select({ labelIndex: s.units.labelIndex, state: s.units.state })
      .from(s.units)
      .where(eq(s.units.printJobId, jobId))
      .orderBy(s.units.labelIndex),
    db
      .select({ type: s.productionEvents.type, reason: s.productionEvents.reason, n: count() })
      .from(s.productionEvents)
      .where(eq(s.productionEvents.printJobId, jobId))
      .groupBy(s.productionEvents.type, s.productionEvents.reason),
    row.job.leaseHolder ? db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, row.job.leaseHolder)) : Promise.resolve([]),
  ]);
  const counts: Record<string, number> = {};
  for (const u of units) counts[u.state] = (counts[u.state] ?? 0) + 1;
  return {
    ...row,
    units,
    counts,
    events: events.map((e) => ({ ...e, n: Number(e.n) })),
    leaseHolderName: leaseHolder[0]?.name ?? null,
  };
}

export async function tenantCatalog(actor: Actor) {
  const m = actor.membership;
  if (!m) return { products: [], lines: [], packaging: [] };
  const db = getDb();
  const [products, lines, packaging] = await Promise.all([
    db.select().from(s.products).where(eq(s.products.manufacturerId, m.manufacturerId)).orderBy(s.products.alias),
    db
      .select({ id: s.productionLines.id, name: s.productionLines.name, factoryId: s.factories.id, factoryName: s.factories.name, state: s.factories.state })
      .from(s.productionLines)
      .innerJoin(s.factories, eq(s.factories.id, s.productionLines.factoryId))
      .where(and(eq(s.productionLines.manufacturerId, m.manufacturerId), eq(s.productionLines.active, true)))
      .orderBy(s.factories.name, s.productionLines.name),
    db
      .select()
      .from(s.packagingVersions)
      .where(and(eq(s.packagingVersions.manufacturerId, m.manufacturerId), eq(s.packagingVersions.active, true)))
      .orderBy(s.packagingVersions.productId, s.packagingVersions.version),
  ]);
  return { products, lines, packaging };
}

export async function getProductDetail(actor: Actor, productId: string) {
  const m = actor.membership;
  if (!m || !UUID_RE.test(productId)) throw notFound();
  const db = getDb();
  const [row] = await db
    .select({
      product: s.products,
      family: s.productFamilies,
      manufacturer: s.manufacturers,
      creatorName: s.users.name,
      creatorTitle: s.users.title,
    })
    .from(s.products)
    .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.products.manufacturerId))
    .leftJoin(s.productFamilies, eq(s.productFamilies.id, s.products.familyId))
    .leftJoin(s.users, eq(s.users.id, s.products.createdBy))
    .where(and(eq(s.products.id, productId), eq(s.products.manufacturerId, m.manufacturerId)));
  if (!row) throw notFound();
  const [packaging, batches, counts] = await Promise.all([
    db.select().from(s.packagingVersions).where(eq(s.packagingVersions.productId, productId)).orderBy(desc(s.packagingVersions.version)),
    db
      .select({ batch: s.batches, factoryName: s.factories.name, lineName: s.productionLines.name, creatorName: s.users.name })
      .from(s.batches)
      .innerJoin(s.factories, eq(s.factories.id, s.batches.factoryId))
      .innerJoin(s.productionLines, eq(s.productionLines.id, s.batches.lineId))
      .leftJoin(s.users, eq(s.users.id, s.batches.createdBy))
      .where(eq(s.batches.productId, productId))
      .orderBy(desc(s.batches.createdAt)),
    db.select({ batchId: s.units.batchId, n: count() }).from(s.units).where(eq(s.units.productId, productId)).groupBy(s.units.batchId),
  ]);
  return { ...row, packaging, batches, unitCounts: Object.fromEntries(counts.map((c) => [c.batchId, Number(c.n)])) as Record<string, number> };
}

export async function getBatchUnits(actor: Actor, batchId: string, opts: { cartonId?: string; loose?: boolean; page?: number; pageSize?: number } = {}) {
  const detail = await getBatchDetail(actor, batchId);
  if (opts.cartonId && !UUID_RE.test(opts.cartonId)) throw notFound();
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? 24));
  const page = Math.max(1, opts.page ?? 1);
  const where = and(eq(s.units.batchId, batchId), opts.cartonId ? eq(s.units.cartonId, opts.cartonId) : opts.loose ? isNull(s.units.cartonId) : undefined);
  const db = getDb();
  const [totalRow, rows] = await Promise.all([
    db.select({ n: count() }).from(s.units).where(where),
    db
      .select({
        unit: s.units,
        cartonCode: s.cartons.code,
        formatVersion: s.credentials.formatVersion,
        keyVersion: s.credentials.keyVersion,
        signature: s.credentials.signature,
        cuisVersion: s.credentials.cuisVersion,
        cuisKeyVersion: s.credentials.cuisKeyVersion,
        cuisPayload: s.credentials.cuisPayload,
        codeCiphertext: s.manualCodes.codeCiphertext,
        issuerShortId: s.manufacturers.shortId,
        productShortId: s.products.shortId,
      })
      .from(s.units)
      .innerJoin(s.credentials, eq(s.credentials.unitId, s.units.id))
      .innerJoin(s.manualCodes, eq(s.manualCodes.unitId, s.units.id))
      .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.units.manufacturerId))
      .innerJoin(s.products, eq(s.products.id, s.units.productId))
      .leftJoin(s.cartons, eq(s.cartons.id, s.units.cartonId))
      .where(where)
      .orderBy(asc(s.units.labelIndex))
      .offset((page - 1) * pageSize)
      .limit(pageSize),
  ]);
  const showCodes = can(actor, "print_job:export", detail.batch);
  return {
    rows: rows.map((r) => ({
      ...r.unit,
      cartonCode: r.cartonCode,
      code: showCodes ? kms.decrypt("manual-code", r.codeCiphertext, r.unit.id) : null,
      payload: showCodes
        ? r.cuisPayload ?? buildPayload({ formatVersion: r.formatVersion, keyVersion: r.keyVersion, issuerShortId: r.issuerShortId, productShortId: r.productShortId, batchShortId: detail.batch.shortId, unitRandom: r.unit.randomIdentity }, r.signature)
        : null,
      credentialVersion: r.cuisPayload ? `CUIS ${r.cuisVersion} · key ${r.cuisKeyVersion}` : `Legacy ${r.formatVersion}.${r.keyVersion}`,
    })),
    total: Number(totalRow[0]?.n ?? 0),
    page,
    pageSize,
  };
}

export async function getUnitDetail(actor: Actor, unitId: string) {
  const m = actor.membership;
  if (!m || !UUID_RE.test(unitId)) throw notFound();
  const db = getDb();
  const [row] = await db
    .select({
      unit: s.units,
      batch: s.batches,
      product: s.products,
      manufacturer: s.manufacturers,
      carton: s.cartons,
      formatVersion: s.credentials.formatVersion,
      keyVersion: s.credentials.keyVersion,
      signature: s.credentials.signature,
      cuisVersion: s.credentials.cuisVersion,
      cuisKeyVersion: s.credentials.cuisKeyVersion,
      cuisPayload: s.credentials.cuisPayload,
      codeCiphertext: s.manualCodes.codeCiphertext,
    })
    .from(s.units)
    .innerJoin(s.batches, eq(s.batches.id, s.units.batchId))
    .innerJoin(s.products, eq(s.products.id, s.units.productId))
    .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.units.manufacturerId))
    .innerJoin(s.credentials, eq(s.credentials.unitId, s.units.id))
    .innerJoin(s.manualCodes, eq(s.manualCodes.unitId, s.units.id))
    .leftJoin(s.cartons, eq(s.cartons.id, s.units.cartonId))
    .where(and(eq(s.units.id, unitId), eq(s.units.manufacturerId, m.manufacturerId)));
  if (!row || !can(actor, "batch:view", row.batch)) throw notFound();
  const verificationHistory = await db
    .select({ channel: s.verificationEvents.channel, outcome: s.verificationEvents.outcome, region: s.verificationEvents.region, createdAt: s.verificationEvents.createdAt })
    .from(s.verificationEvents)
    .where(eq(s.verificationEvents.unitId, unitId))
    .orderBy(desc(s.verificationEvents.createdAt))
    .limit(50);
  const showCodes = can(actor, "print_job:export", row.batch);
  return {
    ...row,
    code: showCodes ? kms.decrypt("manual-code", row.codeCiphertext, row.unit.id) : null,
    payload: showCodes
      ? row.cuisPayload ?? buildPayload({ formatVersion: row.formatVersion, keyVersion: row.keyVersion, issuerShortId: row.manufacturer.shortId, productShortId: row.product.shortId, batchShortId: row.batch.shortId, unitRandom: row.unit.randomIdentity }, row.signature)
      : null,
    credentialVersion: row.cuisPayload ? `CUIS ${row.cuisVersion} · key ${row.cuisKeyVersion}` : `Legacy ${row.formatVersion}.${row.keyVersion}`,
    verificationHistory,
  };
}

export async function getBatchGroup(actor: Actor, groupId: string) {
  const m = actor.membership;
  if (!m || !UUID_RE.test(groupId)) throw notFound();
  const rows = await getDb()
    .select({ batch: s.batches, product: s.products, line: s.productionLines, factory: s.factories })
    .from(s.batches)
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.productionLines, eq(s.productionLines.id, s.batches.lineId))
    .innerJoin(s.factories, eq(s.factories.id, s.batches.factoryId))
    .where(and(eq(s.batches.batchGroupId, groupId), eq(s.batches.manufacturerId, m.manufacturerId)))
    .orderBy(s.batches.lot);
  const visible = rows.filter((r) => can(actor, "batch:view", r.batch));
  if (!visible.length) throw notFound();
  const batchIds = visible.map((r) => r.batch.id);
  const [unitCounts, cartonCounts] = await Promise.all([
    getDb().select({ batchId: s.units.batchId, n: count() }).from(s.units).where(inArray(s.units.batchId, batchIds)).groupBy(s.units.batchId),
    getDb().select({ batchId: s.cartons.batchId, n: count() }).from(s.cartons).where(inArray(s.cartons.batchId, batchIds)).groupBy(s.cartons.batchId),
  ]);
  return {
    groupId,
    rows,
    unitCounts: Object.fromEntries(unitCounts.map((r) => [r.batchId, Number(r.n)])) as Record<string, number>,
    cartonCounts: Object.fromEntries(cartonCounts.map((r) => [r.batchId, Number(r.n)])) as Record<string, number>,
  };
}

export async function riskCases(actor: Actor, opts: { includeClosed?: boolean } = {}) {
  const m = actor.membership;
  if (!m) return [];
  return getDb()
    .select({ c: s.riskCases, lot: s.batches.lot, product: s.products.name })
    .from(s.riskCases)
    .leftJoin(s.batches, eq(s.batches.id, s.riskCases.batchId))
    .leftJoin(s.products, eq(s.products.id, s.batches.productId))
    .where(and(eq(s.riskCases.manufacturerId, m.manufacturerId), opts.includeClosed ? undefined : ne(s.riskCases.status, "closed")))
    .orderBy(desc(s.riskCases.updatedAt));
}

export async function tenantRecalls(actor: Actor) {
  const m = actor.membership;
  if (!m) return [];
  return getDb()
    .select({ r: s.recalls, lot: s.batches.lot, product: s.products.name, strength: s.products.strength })
    .from(s.recalls)
    .innerJoin(s.batches, eq(s.batches.id, s.recalls.batchId))
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .where(eq(s.recalls.manufacturerId, m.manufacturerId))
    .orderBy(desc(s.recalls.createdAt));
}

export async function tenantOverview(actor: Actor) {
  const m = actor.membership!;
  const db = getDb();
  const since = new Date(Date.now() - 30 * 86400_000);
  const [units, checks, openRisk] = await Promise.all([
    db.select({ state: s.units.state, n: count() }).from(s.units).where(eq(s.units.manufacturerId, m.manufacturerId)).groupBy(s.units.state),
    db
      .select({ outcome: s.verificationEvents.outcome, n: count() })
      .from(s.verificationEvents)
      .where(and(eq(s.verificationEvents.manufacturerId, m.manufacturerId), gte(s.verificationEvents.createdAt, since)))
      .groupBy(s.verificationEvents.outcome),
    db
      .select({ n: count() })
      .from(s.riskCases)
      .where(and(eq(s.riskCases.manufacturerId, m.manufacturerId), ne(s.riskCases.status, "closed"))),
  ]);
  return {
    units: Object.fromEntries(units.map((u) => [u.state, Number(u.n)])) as Record<string, number>,
    checks: Object.fromEntries(checks.map((c) => [c.outcome, Number(c.n)])) as Record<string, number>,
    openRisk: Number(openRisk[0]?.n ?? 0),
  };
}

export async function teamMembers(actor: Actor) {
  const m = actor.membership!;
  const db = getDb();
  const members = await db
    .select({ membershipId: s.organizationMemberships.id, active: s.organizationMemberships.active, name: s.users.name, email: s.users.email, title: s.users.title })
    .from(s.organizationMemberships)
    .innerJoin(s.users, eq(s.users.id, s.organizationMemberships.userId))
    .where(eq(s.organizationMemberships.manufacturerId, m.manufacturerId))
    .orderBy(s.users.createdAt);
  const ids = members.map((x) => x.membershipId);
  if (!ids.length) return [];
  const [roles, grants, factories, lines] = await Promise.all([
    db.select().from(s.membershipRoles).where(inArray(s.membershipRoles.membershipId, ids)),
    db.select().from(s.resourceGrants).where(inArray(s.resourceGrants.membershipId, ids)),
    db.select({ id: s.factories.id, name: s.factories.name }).from(s.factories).where(eq(s.factories.manufacturerId, m.manufacturerId)),
    db.select({ id: s.productionLines.id, name: s.productionLines.name }).from(s.productionLines).where(eq(s.productionLines.manufacturerId, m.manufacturerId)),
  ]);
  const names = new Map([...factories, ...lines].map((x) => [x.id, x.name]));
  return members.map((mem) => ({
    ...mem,
    roles: roles.filter((r) => r.membershipId === mem.membershipId).map((r) => r.roleKey),
    grants: grants
      .filter((g) => g.membershipId === mem.membershipId)
      .map((g) => (g.resourceType === "organization" ? "Whole organization" : names.get(g.resourceId) ?? g.resourceType)),
  }));
}

export async function auditTrail(actor: Actor, limit = 200) {
  const m = actor.membership!;
  const db = getDb();
  return db
    .select({ e: s.auditEvents, actorName: s.users.name })
    .from(s.auditEvents)
    .leftJoin(s.users, eq(s.users.id, s.auditEvents.actorId))
    .where(eq(s.auditEvents.manufacturerId, m.manufacturerId))
    .orderBy(desc(s.auditEvents.seq))
    .limit(limit);
}
