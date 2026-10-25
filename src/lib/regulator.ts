import "server-only";
import { and, count, desc, eq, gte, ne, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { authorizePlatform, type Actor } from "./authz";

/** National, cross-manufacturer read model. Read-only by construction. */
export async function regulatorOverview(actor: Actor) {
  await authorizePlatform(actor, "regulator:read");
  const db = getDb();
  const since = new Date(Date.now() - 30 * 86400_000);
  const [mfrs, prods, units, outcomes, regions, daily, cases, recalls, manufacturers, failures] = await Promise.all([
    db.select({ n: count() }).from(s.manufacturers).where(eq(s.manufacturers.kybStatus, "approved")),
    db.select({ n: count() }).from(s.products).where(eq(s.products.status, "approved")),
    db.select({ n: count() }).from(s.units).where(eq(s.units.state, "ACTIVE")),
    db
      .select({ outcome: s.verificationEvents.outcome, n: count() })
      .from(s.verificationEvents)
      .where(gte(s.verificationEvents.createdAt, since))
      .groupBy(s.verificationEvents.outcome),
    db
      .select({ region: s.verificationEvents.region, n: count() })
      .from(s.verificationEvents)
      .where(gte(s.verificationEvents.createdAt, since))
      .groupBy(s.verificationEvents.region)
      .orderBy(desc(count())),
    db.execute<{ day: string; n: number }>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(count(v.id), 0)::int as n
      from generate_series((now() at time zone 'Africa/Lagos')::date - 29, (now() at time zone 'Africa/Lagos')::date, interval '1 day') as d(day)
      left join verification_events v on (v.created_at at time zone 'Africa/Lagos')::date = d.day::date
      group by d.day order by d.day`),
    db
      .select({ c: s.riskCases, manufacturer: s.manufacturers.legalName, lot: s.batches.lot, product: s.products.name })
      .from(s.riskCases)
      .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.riskCases.manufacturerId))
      .leftJoin(s.batches, eq(s.batches.id, s.riskCases.batchId))
      .leftJoin(s.products, eq(s.products.id, s.batches.productId))
      .where(ne(s.riskCases.status, "closed"))
      .orderBy(desc(s.riskCases.updatedAt))
      .limit(20),
    db
      .select({ r: s.recalls, manufacturer: s.manufacturers.legalName, lot: s.batches.lot, product: s.products.name, strength: s.products.strength })
      .from(s.recalls)
      .innerJoin(s.manufacturers, eq(s.manufacturers.id, s.recalls.manufacturerId))
      .innerJoin(s.batches, eq(s.batches.id, s.recalls.batchId))
      .innerJoin(s.products, eq(s.products.id, s.batches.productId))
      .where(eq(s.recalls.status, "active"))
      .orderBy(desc(s.recalls.effectiveAt)),
    db.execute<{ id: string; legal_name: string; alias: string; sector: string; kyb_status: string; active: number; checks: number; open_cases: number }>(sql`
      select m.id, m.legal_name, m.alias, m.sector, m.kyb_status,
        (select count(*) from units u where u.manufacturer_id = m.id and u.state = 'ACTIVE')::int as active,
        (select count(*) from verification_events v where v.manufacturer_id = m.id and v.created_at >= ${since.toISOString()})::int as checks,
        (select count(*) from risk_cases r where r.manufacturer_id = m.id and r.status <> 'closed')::int as open_cases
      from manufacturers m order by m.legal_name`),
    db
      .select({ n: count() })
      .from(s.verificationEvents)
      .where(and(gte(s.verificationEvents.createdAt, since), sql`${s.verificationEvents.signals} ?| array['qr_bad_signature','qr_signed_but_unregistered']`)),
  ]);
  const byOutcome = Object.fromEntries(outcomes.map((o) => [o.outcome, Number(o.n)])) as Record<string, number>;
  return {
    manufacturers: Number(mfrs[0].n),
    products: Number(prods[0].n),
    activeUnits: Number(units[0].n),
    byOutcome,
    totalChecks: Object.values(byOutcome).reduce((a, b) => a + b, 0),
    forgedQr: Number(failures[0].n),
    regions: regions.map((r) => ({ region: r.region, n: Number(r.n) })),
    daily: daily.rows.map((r) => ({ day: r.day, n: Number(r.n) })),
    cases,
    recalls,
    manufacturerRows: manufacturers.rows,
  };
}
