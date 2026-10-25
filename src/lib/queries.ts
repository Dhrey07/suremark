import "server-only";
import { and, count, desc, eq, gte, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { can, memberPermissions, type Actor } from "./authz";
import { notFound } from "./errors";

const s = schema;

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
  if (!m || !/^[0-9a-f-]{36}$/.test(batchId)) throw notFound();
  const db = getDb();
  const [row] = await db
    .select({ batch: s.batches, product: s.products, line: s.productionLines, factory: s.factories })
    .from(s.batches)
    .innerJoin(s.products, eq(s.products.id, s.batches.productId))
    .innerJoin(s.productionLines, eq(s.productionLines.id, s.batches.lineId))
    .innerJoin(s.factories, eq(s.factories.id, s.batches.factoryId))
    .where(and(eq(s.batches.id, batchId), eq(s.batches.manufacturerId, m.manufacturerId)));
  if (!row || !can(actor, "batch:view", row.batch)) throw notFound();

  const [job] = await db.select().from(s.printJobs).where(eq(s.printJobs.batchId, batchId));
  const [counts, approvals, reconciliation, recalls, activity, users] = await Promise.all([
    db.select({ state: s.units.state, n: count() }).from(s.units).where(eq(s.units.batchId, batchId)).groupBy(s.units.state),
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
    db.select({ id: s.users.id, name: s.users.name }).from(s.users),
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
    approvals,
    reconciliation: reconciliation[0] ?? null,
    recalls,
    activity,
    printerIds,
    userName: Object.fromEntries(users.map((u) => [u.id, u.name])) as Record<string, string>,
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
  if (!m || !/^[0-9a-f-]{36}$/.test(jobId)) throw notFound();
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
  if (!m) return { products: [], lines: [] };
  const db = getDb();
  const [products, lines] = await Promise.all([
    db.select().from(s.products).where(eq(s.products.manufacturerId, m.manufacturerId)).orderBy(s.products.alias),
    db
      .select({ id: s.productionLines.id, name: s.productionLines.name, factoryId: s.factories.id, factoryName: s.factories.name, state: s.factories.state })
      .from(s.productionLines)
      .innerJoin(s.factories, eq(s.factories.id, s.productionLines.factoryId))
      .where(and(eq(s.productionLines.manufacturerId, m.manufacturerId), eq(s.productionLines.active, true)))
      .orderBy(s.factories.name, s.productionLines.name),
  ]);
  return { products, lines };
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
