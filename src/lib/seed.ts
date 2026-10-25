import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadActor } from "./actor";
import type { Actor } from "./authz";
import { hashPassword } from "./password";
import { submitReport } from "./reports";
import {
  createBatch,
  decideAllocation,
  finishPrintJob,
  getPrintLabels,
  reconcileBatch,
  releaseBatch,
  requestAllocation,
  runLineSimulation,
  startPrintJob,
  type Label,
} from "./services/production";
import { decideRecall, initiateRecall } from "./services/recalls";
import { verifyCode, verifyQr } from "./verify";

/**
 * Demo dataset. All companies, people, products and registration numbers are fictional.
 * History is produced through the real services (issuance, printing, reconciliation, release,
 * recall), so every record in the demo obeys the same rules as live use.
 */

const TABLES = [
  "audit_events",
  "rate_limit_buckets",
  "consumer_reports",
  "risk_cases",
  "verification_events",
  "recalls",
  "reconciliations",
  "production_events",
  "manual_codes",
  "credentials",
  "units",
  "print_jobs",
  "approval_requests",
  "batches",
  "products",
  "production_lines",
  "factories",
  "resource_grants",
  "membership_roles",
  "organization_memberships",
  "platform_roles",
  "sessions",
  "manufacturers",
  "users",
];

export async function isEmpty() {
  return (await getDb().$count(schema.users)) === 0;
}

export async function resetDatabase() {
  await getDb().execute(sql.raw(`truncate ${TABLES.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}

type Grant = "org" | { factory: string } | { line: string };

export async function seedDemo(password: string, log: (m: string) => void = () => {}) {
  const db = getDb();
  const passwordHash = await hashPassword(password);

  async function user(email: string, name: string, title: string, domain: "platform" | "regulator" | "manufacturer") {
    const [u] = await db.insert(schema.users).values({ email, name, title, passwordHash, domain }).returning();
    return u;
  }

  async function member(manufacturerId: string, u: { id: string }, roles: string[], grants: Grant[]) {
    const [m] = await db.insert(schema.organizationMemberships).values({ userId: u.id, manufacturerId }).returning();
    for (const roleKey of roles) await db.insert(schema.membershipRoles).values({ membershipId: m.id, roleKey });
    for (const g of grants) {
      const [resourceType, resourceId] =
        g === "org" ? ["organization", manufacturerId] : "factory" in g ? ["factory", g.factory] : ["line", g.line];
      await db.insert(schema.resourceGrants).values({ membershipId: m.id, resourceType, resourceId });
    }
    return (await loadActor(db, u.id, manufacturerId)) as Actor;
  }

  // ---------- platform & regulator
  const admin = await user("reviewer@platform.demo", "Kemi Adebayo", "Onboarding Reviewer", "platform");
  await db.insert(schema.platformRoles).values({ userId: admin.id, roleKey: "platform_admin" });
  const analyst = await user("analyst@regulator.demo", "Regulatory Analyst", "Post-Marketing Surveillance (demo)", "regulator");
  await db.insert(schema.platformRoles).values({ userId: analyst.id, roleKey: "regulator_analyst" });

  // ---------- Okanlife Pharmaceuticals (fictional)
  const [okl] = await db
    .insert(schema.manufacturers)
    .values({
      legalName: "Okanlife Pharmaceuticals Ltd",
      alias: "OKL",
      rcNumber: "RC-DEMO-418273",
      sector: "Pharmaceuticals",
      hqState: "LA",
      kybStatus: "approved",
      kybReviewedBy: admin.id,
      kybReviewedAt: new Date("2026-08-04T10:00:00Z"),
    })
    .returning();
  const [ikeja, agbara] = await db
    .insert(schema.factories)
    .values([
      { manufacturerId: okl.id, name: "Ikeja Plant", address: "Plot 14, Industrial Avenue, Ikeja, Lagos", state: "LA" },
      { manufacturerId: okl.id, name: "Agbara Plant", address: "Block C, Agbara Industrial Estate, Ogun", state: "OG" },
    ])
    .returning();
  const [l1, l2, a1, a2] = await db
    .insert(schema.productionLines)
    .values([
      { manufacturerId: okl.id, factoryId: ikeja.id, name: "Ikeja L1 · Blister" },
      { manufacturerId: okl.id, factoryId: ikeja.id, name: "Ikeja L2 · Bottling" },
      { manufacturerId: okl.id, factoryId: agbara.id, name: "Agbara A1 · Capsules" },
      { manufacturerId: okl.id, factoryId: agbara.id, name: "Agbara A2 · Sachets" },
    ])
    .returning();
  const productRows = [
    { alias: "ALU", name: "Artemether/Lumefantrine Tablets", dosageForm: "Tablet", strength: "20 mg/120 mg", packSize: "1 × 24 tablets", nafdacRegNo: "DEMO-A4-1187" },
    { alias: "PCM", name: "Paracetamol Tablets", dosageForm: "Tablet", strength: "500 mg", packSize: "10 × 10 blister", nafdacRegNo: "DEMO-A4-0412" },
    { alias: "AMX", name: "Amoxicillin Capsules", dosageForm: "Capsule", strength: "500 mg", packSize: "10 × 10 blister", nafdacRegNo: "DEMO-A4-0939" },
    { alias: "ORS", name: "Oral Rehydration Salts", dosageForm: "Powder for solution", strength: "20.5 g", packSize: "Single sachet", nafdacRegNo: "DEMO-A4-0210" },
    { alias: "VTC", name: "Vitamin C Syrup", dosageForm: "Syrup", strength: "100 mg/5 mL", packSize: "100 mL bottle", nafdacRegNo: "DEMO-A4-0777" },
  ];
  const products = await db
    .insert(schema.products)
    .values(productRows.map((p) => ({ ...p, manufacturerId: okl.id, status: "approved" as const, reviewedBy: admin.id, reviewedAt: new Date("2026-08-05T09:00:00Z") })))
    .returning();
  await db.insert(schema.products).values({
    manufacturerId: okl.id,
    alias: "IBU",
    name: "Ibuprofen Tablets",
    dosageForm: "Tablet",
    strength: "400 mg",
    packSize: "10 × 10 blister",
    nafdacRegNo: "DEMO-A4-1302",
  });
  const prod = Object.fromEntries(products.map((p) => [p.alias, p]));

  const ikejaAndAgbara: Grant[] = [{ factory: ikeja.id }, { factory: agbara.id }];
  const owner = await member(okl.id, await user("adaeze.okafor@okanlife.demo", "Adaeze Okafor", "Managing Director", "manufacturer"), ["owner"], ["org"]);
  await member(okl.id, await user("tunde.bakare@okanlife.demo", "Tunde Bakare", "IT & Systems Administrator", "manufacturer"), ["admin"], ["org"]);
  const fm = await member(okl.id, await user("ibrahim.musa@okanlife.demo", "Ibrahim Musa", "Plant Manager", "manufacturer"), ["factory_manager"], ikejaAndAgbara);
  const pm = await member(okl.id, await user("chioma.eze@okanlife.demo", "Chioma Eze", "Production Manager", "manufacturer"), ["production_manager"], ikejaAndAgbara);
  const opIkeja = await member(okl.id, await user("samuel.adeyemi@okanlife.demo", "Samuel Adeyemi", "Line Operator, Ikeja L1", "manufacturer"), ["line_operator"], [
    { line: l1.id },
  ]);
  const opAgbara = await member(okl.id, await user("grace.etim@okanlife.demo", "Grace Etim", "Line Operator, Agbara", "manufacturer"), ["line_operator"], [
    { line: a1.id },
    { line: a2.id },
    { line: l2.id },
  ]);
  const qa = await member(okl.id, await user("fatima.bello@okanlife.demo", "Fatima Bello", "QA Officer", "manufacturer"), ["qa_officer"], ikejaAndAgbara);
  const compliance = await member(okl.id, await user("ngozi.obi@okanlife.demo", "Ngozi Obi", "Head of Regulatory Compliance", "manufacturer"), ["compliance_officer"], [
    "org",
  ]);
  await member(okl.id, await user("kunle.ajayi@okanlife.demo", "Kunle Ajayi", "Internal Auditor", "manufacturer"), ["auditor"], ["org"]);
  log("Okanlife organisation, sites, products and team created");

  // ---------- Savannah Foods & Beverages (fictional)
  const [sfb] = await db
    .insert(schema.manufacturers)
    .values({
      legalName: "Savannah Foods & Beverages Ltd",
      alias: "SFB",
      rcNumber: "RC-DEMO-902114",
      sector: "Food & Beverages",
      hqState: "KN",
      kybStatus: "approved",
      kybReviewedBy: admin.id,
      kybReviewedAt: new Date("2026-08-11T10:00:00Z"),
    })
    .returning();
  const [kano] = await db.insert(schema.factories).values({ manufacturerId: sfb.id, name: "Kano Plant", address: "Sharada Industrial Area, Kano", state: "KN" }).returning();
  const [k1] = await db.insert(schema.productionLines).values({ manufacturerId: sfb.id, factoryId: kano.id, name: "Kano K1 · Bottling" }).returning();
  const sfbProducts = await db
    .insert(schema.products)
    .values([
      { manufacturerId: sfb.id, alias: "TWB", name: "Savannah Table Water", dosageForm: "Packaged water", strength: "75 cL", packSize: "Single bottle", nafdacRegNo: "DEMO-01-5531", status: "approved", reviewedBy: admin.id },
      { manufacturerId: sfb.id, alias: "MLT", name: "Savannah Malt Drink", dosageForm: "Malt beverage", strength: "33 cL", packSize: "Single can", nafdacRegNo: "DEMO-01-5574", status: "approved", reviewedBy: admin.id },
    ])
    .returning();
  await member(sfb.id, await user("musa.danjuma@savannahfoods.demo", "Musa Danjuma", "Chief Executive", "manufacturer"), ["owner"], ["org"]);
  const sfbFm = await member(sfb.id, await user("yakubu.sani@savannahfoods.demo", "Yakubu Sani", "Plant Manager", "manufacturer"), ["factory_manager"], [{ factory: kano.id }]);
  const sfbPm = await member(sfb.id, await user("aisha.garba@savannahfoods.demo", "Aisha Garba", "Production Manager", "manufacturer"), ["production_manager"], [
    { factory: kano.id },
  ]);
  const sfbOp = await member(sfb.id, await user("peter.okon@savannahfoods.demo", "Peter Okon", "Line Operator", "manufacturer"), ["line_operator"], [{ line: k1.id }]);
  const sfbQa = await member(sfb.id, await user("zainab.lawal@savannahfoods.demo", "Zainab Lawal", "QA Officer", "manufacturer"), ["qa_officer"], [{ factory: kano.id }]);

  // ---------- pending applicant
  const [rcl] = await db
    .insert(schema.manufacturers)
    .values({ legalName: "Riverine Cosmetics Ltd", alias: "RCL", rcNumber: "RC-DEMO-551902", sector: "Cosmetics", hqState: "RI" })
    .returning();
  const rclOwner = await user("ebiere.tamuno@riverine.demo", "Ebiere Tamuno", "Director", "manufacturer");
  const [rclMem] = await db.insert(schema.organizationMemberships).values({ userId: rclOwner.id, manufacturerId: rcl.id }).returning();
  await db.insert(schema.membershipRoles).values({ membershipId: rclMem.id, roleKey: "owner" });
  await db.insert(schema.resourceGrants).values({ membershipId: rclMem.id, resourceType: "organization", resourceId: rcl.id });

  // ---------- production history
  async function produce(o: {
    actors: { pm: Actor; fm: Actor; op: Actor; qa: Actor };
    productId: string;
    lineId: string;
    lot: string;
    mfg: string;
    exp: string;
    quantity: number;
    smudged: number;
    holdBack: number;
    releasedOn: string;
  }) {
    const batch = await createBatch(o.actors.pm, {
      productId: o.productId,
      lineId: o.lineId,
      lot: o.lot,
      manufactureDate: o.mfg,
      expiryDate: o.exp,
      plannedQuantity: o.quantity,
    });
    const req = await requestAllocation(o.actors.pm, batch.id, o.quantity + o.holdBack, "Scheduled production run");
    const res = await decideAllocation(o.actors.fm, req.id, true, "Within plan");
    if (!res.approved) throw new Error("allocation not approved");
    await startPrintJob(o.actors.op, res.printJobId);
    const labels = await getPrintLabels(o.actors.op, res.printJobId);
    const sim = await runLineSimulation(o.actors.op, res.printJobId, randomUUID(), { smudged: o.smudged, holdBack: o.holdBack });
    await finishPrintJob(o.actors.op, res.printJobId);
    await reconcileBatch(o.actors.pm, batch.id, sim.printed, "Counts confirmed against line counter");
    await releaseBatch(o.actors.qa, batch.id, true, "Retained samples inspected; label print quality and data conform");
    const at = new Date(`${o.releasedOn}T15:00:00+01:00`);
    const createdAt = new Date(`${o.mfg}T08:00:00+01:00`);
    await db.update(schema.batches).set({ createdAt, releasedAt: at }).where(eq(schema.batches.id, batch.id));
    await db.execute(
      sql`update units set issued_at = ${createdAt.toISOString()}, printed_at = case when printed_at is null then null else ${createdAt.toISOString()}::timestamptz end,
          activated_at = case when activated_at is null then null else ${at.toISOString()}::timestamptz end, state_changed_at = ${at.toISOString()}
          where batch_id = ${batch.id}`,
    );
    log(`Batch ${o.lot}: ${sim.printed} released, ${sim.rejected} rejected, ${o.holdBack} voided`);
    return { batch, labels };
  }

  const oklActors = (op: Actor) => ({ pm, fm, op, qa });
  const alu = await produce({ actors: oklActors(opIkeja), productId: prod.ALU.id, lineId: l1.id, lot: "ALU-2609-0187", mfg: "2026-09-14", exp: "2028-08-31", quantity: 1200, smudged: 9, holdBack: 6, releasedOn: "2026-09-18" });
  const pcm = await produce({ actors: oklActors(opIkeja), productId: prod.PCM.id, lineId: l1.id, lot: "PCM-2609-0412", mfg: "2026-09-22", exp: "2029-08-31", quantity: 1500, smudged: 11, holdBack: 4, releasedOn: "2026-09-25" });
  const amx = await produce({ actors: oklActors(opAgbara), productId: prod.AMX.id, lineId: a1.id, lot: "AMX-2608-0093", mfg: "2026-08-18", exp: "2028-07-31", quantity: 800, smudged: 5, holdBack: 3, releasedOn: "2026-08-22" });
  const ors = await produce({ actors: oklActors(opAgbara), productId: prod.ORS.id, lineId: a2.id, lot: "ORS-2510-0021", mfg: "2025-10-06", exp: "2027-10-01", quantity: 300, smudged: 2, holdBack: 0, releasedOn: "2025-10-09" });
  const twb = await produce({ actors: { pm: sfbPm, fm: sfbFm, op: sfbOp, qa: sfbQa }, productId: sfbProducts[0].id, lineId: k1.id, lot: "TWB-2610-0310", mfg: "2026-10-02", exp: "2027-10-01", quantity: 2000, smudged: 14, holdBack: 10, releasedOn: "2026-10-04" });

  // The ORS batch was released a year ago and has since passed its expiry date.
  await db.update(schema.batches).set({ expiryDate: "2026-10-01" }).where(eq(schema.batches.id, ors.batch.id));

  // ---------- historical consumer checks (last 30 days), spread by population
  const weights: [string, number][] = [
    ["LA", 24], ["KN", 10], ["FC", 8], ["OY", 7], ["RI", 7], ["KD", 6], ["OG", 5], ["AN", 4], ["EN", 3], ["DE", 3],
    ["ED", 3], ["IM", 3], ["KW", 2], ["PL", 2], ["BA", 2], ["KT", 2], ["OS", 2], ["ON", 2], ["AK", 2], ["BE", 1],
  ];
  const totalW = weights.reduce((a, [, w]) => a + w, 0);
  const pickRegion = () => {
    let r = randomInt(0, totalW);
    for (const [code, w] of weights) if ((r -= w) < 0) return code;
    return "LA";
  };
  const now = Date.now();
  const unitStates = await db
    .select({ id: schema.units.id, batchId: schema.units.batchId, state: schema.units.state, manufacturerId: schema.units.manufacturerId })
    .from(schema.units)
    .where(inArray(schema.units.batchId, [alu.batch.id, pcm.batch.id, amx.batch.id, ors.batch.id, twb.batch.id]));
  const active = unitStates.filter((u) => u.state === "ACTIVE");
  const events: (typeof schema.verificationEvents.$inferInsert)[] = [];
  const releasedAt: Record<string, number> = {
    [alu.batch.id]: Date.parse("2026-09-19"),
    [pcm.batch.id]: Date.parse("2026-09-26"),
    [amx.batch.id]: Date.parse("2026-08-23"),
    [ors.batch.id]: Date.parse("2025-10-10"),
    [twb.batch.id]: Date.parse("2026-10-05"),
  };
  const sample = active.filter(() => randomInt(0, 100) < 32);
  for (const u of sample) {
    const from = Math.max(releasedAt[u.batchId], now - 30 * 86400_000);
    const at = new Date(from + randomInt(0, Math.max(1, now - from - 3600_000)));
    const region = pickRegion();
    const deviceHash = Buffer.from(randomUUID().replace(/-/g, ""), "hex");
    const outcome = u.batchId === ors.batch.id && at.getTime() > Date.parse("2026-10-01") ? ("expired" as const) : ("issued_no_known_alerts" as const);
    const channel = (["qr", "qr", "qr", "web", "ussd"] as const)[randomInt(0, 5)];
    events.push({ unitId: u.id, manufacturerId: u.manufacturerId, channel, outcome, region, deviceHash, createdAt: at });
    if (randomInt(0, 100) < 15) {
      events.push({ unitId: u.id, manufacturerId: u.manufacturerId, channel: "qr", outcome, region, deviceHash, createdAt: new Date(at.getTime() + randomInt(60_000, 3 * 86400_000)) });
    }
  }
  for (let i = 0; i < Math.round(sample.length * 0.06); i++) {
    const channel = (["web", "web", "ussd", "qr"] as const)[randomInt(0, 4)];
    events.push({
      channel,
      outcome: "unable_to_verify",
      region: pickRegion(),
      signals: [channel === "qr" ? "qr_bad_signature" : "code_not_found"],
      createdAt: new Date(now - randomInt(3600_000, 30 * 86400_000)),
    });
  }
  for (let i = 0; i < events.length; i += 1000) await db.insert(schema.verificationEvents).values(events.slice(i, i + 1000));
  log(`${events.length} historical consumer checks recorded`);

  // ---------- live signals through the real engine
  const activeLabels = (labels: Label[]) => {
    const set = new Set(active.map((u) => u.id));
    return labels.filter((l) => set.has(l.unitId));
  };
  const clone = activeLabels(pcm.labels)[7];
  await verifyCode(clone.code, { channel: "web", region: "LA", deviceKey: "seed-buyer-lagos", clientKey: "seed-1" });
  await verifyQr(clone.payload, { channel: "qr", region: "KN", deviceKey: "seed-buyer-kano", clientKey: "seed-2" });

  const voidedAlu = alu.labels.find((l) => unitStates.find((u) => u.id === l.unitId)?.state === "VOIDED");
  if (voidedAlu) await verifyQr(voidedAlu.payload, { channel: "qr", region: "OY", deviceKey: "seed-buyer-ibadan", clientKey: "seed-3" });

  await submitReport({
    code: activeLabels(alu.labels)[21].code,
    description: "Blister foil looks different from the usual pack and the tablets are a lighter colour.",
    region: "KD",
    channel: "web",
    clientKey: "seed-4",
  });

  // ---------- recall through dual control
  const recall = await initiateRecall(
    compliance,
    amx.batch.id,
    "Out-of-specification dissolution result in ongoing stability testing (demo scenario).",
    "Stop using this batch. Return unused capsules to the pharmacy where you bought them for a replacement.",
  );
  await decideRecall(owner, recall.id, true, "Confirmed with QA; proceed with recall");
  // Consumers who still hold the recalled batch get the warning.
  for (const [i, region] of (["LA", "FC", "RI"] as const).entries()) {
    const label = activeLabels(amx.labels)[40 + i];
    if (label) await verifyCode(label.code, { channel: "web", region, deviceKey: `seed-recall-${i}`, clientKey: `seed-recall-${i}` });
  }
  log("Recall of AMX-2608-0093 approved; live clone, leaked-label and consumer-report signals created");

  return { users: (await db.select({ email: schema.users.email }).from(schema.users)).map((u) => u.email), rcl: rcl.id };
}
