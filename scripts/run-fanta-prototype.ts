import "./load-env";

import { and, count, eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "../src/db";
import { loadActor } from "../src/lib/actor";
import { buildPayload } from "../src/lib/credential";
import { kms } from "../src/lib/kms";
import { hashPassword } from "../src/lib/password";
import { createProduct, reviewProduct } from "../src/lib/services/catalog";
import { backfillCuisV1 } from "../src/lib/services/cuis-migration";
import { buildPrintReadyPdf } from "../src/lib/pdf-labels";
import { buildBatchCsv, completeBatchExport, prepareBatchExport } from "../src/lib/services/exports";
import { createBatchSet, decideAllocation, finishPrintJob, getPrintLabels, reconcileBatch, releaseBatch, requestAllocation, runLineSimulation, startPrintJob } from "../src/lib/services/production";
import { verifyCode, verifyQr } from "../src/lib/verify";

const db = getDb();
const MANUFACTURER_ALIAS = "VRF";
const MARKER = "FANTA-PROTOTYPE-SCENARIO-V1";

async function actorFor(email: string, manufacturerId?: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) throw new Error(`Missing prototype user ${email}`);
  const actor = await loadActor(db, user.id, manufacturerId ?? null);
  if (!actor) throw new Error(`Could not load actor ${email}`);
  return actor;
}

async function ensureTeam(manufacturerId: string) {
  let [factory] = await db.select().from(schema.factories).where(and(eq(schema.factories.manufacturerId, manufacturerId), eq(schema.factories.name, "Lagos Bottling Plant")));
  if (!factory) [factory] = await db.insert(schema.factories).values({ manufacturerId, name: "Lagos Bottling Plant", address: "Prototype Industrial Estate, Ikeja", state: "LA" }).returning();
  let [line] = await db.select().from(schema.productionLines).where(and(eq(schema.productionLines.manufacturerId, manufacturerId), eq(schema.productionLines.name, "PET Bottling Line 1")));
  if (!line) [line] = await db.insert(schema.productionLines).values({ manufacturerId, factoryId: factory.id, name: "PET Bottling Line 1" }).returning();

  const accounts = [
    ["production.manager@veriff.local", "Fanta Production Manager", "Production Manager", "production_manager", "PrototypeProduction2026!", "factory", factory.id],
    ["factory.manager@veriff.local", "Fanta Factory Manager", "Factory Manager", "factory_manager", "PrototypeFactory2026!", "factory", factory.id],
    ["line.operator@veriff.local", "Fanta Line Operator", "Line Operator", "line_operator", "PrototypeOperator2026!", "line", line.id],
    ["qa.officer@veriff.local", "Fanta QA Officer", "Quality Assurance Officer", "qa_officer", "PrototypeQuality2026!", "factory", factory.id],
  ] as const;
  for (const [email, name, title, role, password, resourceType, resourceId] of accounts) {
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user) [user] = await db.insert(schema.users).values({ email, name, title, domain: "manufacturer", passwordHash: await hashPassword(password) }).returning();
    let [membership] = await db.select().from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.userId, user.id), eq(schema.organizationMemberships.manufacturerId, manufacturerId)));
    if (!membership) [membership] = await db.insert(schema.organizationMemberships).values({ userId: user.id, manufacturerId }).returning();
    await db.insert(schema.membershipRoles).values({ membershipId: membership.id, roleKey: role }).onConflictDoNothing();
    await db.insert(schema.resourceGrants).values({ membershipId: membership.id, resourceType, resourceId }).onConflictDoNothing();
  }
  return { factory, line };
}

async function main() {
  await backfillCuisV1();
  const [manufacturer] = await db.select().from(schema.manufacturers).where(eq(schema.manufacturers.alias, MANUFACTURER_ALIAS));
  if (!manufacturer) throw new Error("VRF manufacturer was not found. Complete manufacturer onboarding first.");
  if (manufacturer.kybStatus !== "approved" || manufacturer.operationalStatus !== "active") throw new Error("VRF manufacturer must be approved and active.");
  const { factory, line } = await ensureTeam(manufacturer.id);
  // Remove the exact pre-integration placeholder record only when it has never been used in production.
  const [legacyPlaceholder] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.manufacturerId, manufacturer.id), eq(schema.products.alias, "FT"), eq(schema.products.name, "Fanta"), eq(schema.products.packSize, "10x50"), eq(schema.products.status, "pending")));
  if (legacyPlaceholder) {
    const [usage] = await db.select({ n: count() }).from(schema.batches).where(eq(schema.batches.productId, legacyPlaceholder.id));
    if (Number(usage.n) === 0) {
      await db.delete(schema.packagingVersions).where(eq(schema.packagingVersions.productId, legacyPlaceholder.id));
      await db.delete(schema.products).where(eq(schema.products.id, legacyPlaceholder.id));
    }
  }
  const owner = await actorFor("manufacturer.owner@veriff.local", manufacturer.id);
  const platform = await actorFor("platform.admin@veriff.local");
  const production = await actorFor("production.manager@veriff.local", manufacturer.id);
  const factoryManager = await actorFor("factory.manager@veriff.local", manufacturer.id);
  const operator = await actorFor("line.operator@veriff.local", manufacturer.id);
  const qa = await actorFor("qa.officer@veriff.local", manufacturer.id);

  let [product] = await db.select().from(schema.products).where(and(eq(schema.products.manufacturerId, manufacturer.id), eq(schema.products.nafdacRegNo, "SIM-NAFDAC-FANTA-001")));
  if (!product) {
    const created = await createProduct(owner, {
      name: "Fanta Orange 50cl",
      brand: "Fanta",
      familyName: "Fanta",
      variant: "Orange",
      category: "Carbonated soft drink",
      description: "Orange-flavoured carbonated soft drink in a 50 cl PET bottle. Prototype record for lifecycle demonstration.",
      imageUrl: "/fanta-orange-bottle.svg",
      dosageForm: "Beverage",
      strength: "Orange flavour",
      packSize: "50 cl PET bottle",
      packagingType: "bottle",
      netQuantity: 500,
      measurementUnit: "ml",
      manufacturingRequirements: "Carbonated PET bottling; hygienic line clearance; fill-volume and closure checks.",
      shelfLifeDays: 365,
      unitsPerCarton: 24,
      cartonsPerPallet: 50,
      nafdacRegNo: "SIM-NAFDAC-FANTA-001",
    });
    product = created.product;
    await reviewProduct(platform, product.id, true);
    [product] = await db.select().from(schema.products).where(eq(schema.products.id, product.id));
  } else if (product.status === "pending") {
    await reviewProduct(platform, product.id, true);
  }
  const [packaging] = await db.select().from(schema.packagingVersions).where(and(eq(schema.packagingVersions.productId, product.id), eq(schema.packagingVersions.active, true)));
  if (!packaging) throw new Error("Fanta packaging version missing");

  let batches = await db.select().from(schema.batches).where(and(eq(schema.batches.manufacturerId, manufacturer.id), eq(schema.batches.productionNotes, MARKER)));
  let groupId = batches[0]?.batchGroupId;
  if (!batches.length) {
    const created = await createBatchSet(production, {
      productId: product.id,
      packagingVersionId: packaging.id,
      lineId: line.id,
      lotPrefix: "FANTA-261025-RUN",
      manufactureDate: "2026-10-25",
      expiryDate: "2027-10-25",
      batchCount: 2,
      cartonCount: 10,
      productionNotes: MARKER,
    });
    batches = created.batches;
    groupId = created.groupId;
  }

  const examples: { batchId: string; lot: string; jobId: string; payload: string; code: string }[] = [];
  for (const original of batches) {
    let [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, original.id));
    let [job] = await db.select().from(schema.printJobs).where(eq(schema.printJobs.batchId, batch.id));
    if (batch.status === "draft") {
      const request = await requestAllocation(production, batch.id, batch.plannedQuantity, "Exact planned carton quantity for the Fanta prototype run.");
      const decision = await decideAllocation(factoryManager, request.id, true, "Plan and packaging quantities checked.");
      [job] = await db.select().from(schema.printJobs).where(eq(schema.printJobs.id, decision.approved ? decision.printJobId : ""));
      [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, batch.id));
    }
    if (!job) throw new Error(`Print job missing for ${batch.lot}`);
    let example: { payload: string; code: string };
    if (job.status !== "completed") {
      await startPrintJob(operator, job.id);
      const [label] = await getPrintLabels(operator, job.id, { limit: 1 });
      example = { payload: label.payload, code: label.code };
      await runLineSimulation(operator, job.id, `00000000-0000-4000-8000-${String(batch.shortId).padStart(12, "0")}`, { smudged: 0, holdBack: 0 });
      await finishPrintJob(operator, job.id);
    } else {
      const [unit] = await db.select({ unit: schema.units, credential: schema.credentials, codeCiphertext: schema.manualCodes.codeCiphertext }).from(schema.units).innerJoin(schema.credentials, eq(schema.credentials.unitId, schema.units.id)).innerJoin(schema.manualCodes, eq(schema.manualCodes.unitId, schema.units.id)).where(eq(schema.units.batchId, batch.id)).limit(1);
      example = {
        payload: unit.credential.cuisPayload ?? buildPayload({ formatVersion: unit.credential.formatVersion, keyVersion: unit.credential.keyVersion, issuerShortId: manufacturer.shortId, productShortId: product.shortId, batchShortId: batch.shortId, unitRandom: unit.unit.randomIdentity }, unit.credential.signature),
        code: kms.decrypt("manual-code", unit.codeCiphertext, unit.unit.id),
      };
    }
    [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, batch.id));
    if (batch.status === "allocated") await reconcileBatch(production, batch.id, batch.plannedQuantity, "Line counter and carton tally agree: 10 × 24 units.");
    [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, batch.id));
    if (batch.status === "reconciled") await releaseBatch(qa, batch.id, true, "Packaging, printed identity, fill volume and retained samples conform.");
    examples.push({ batchId: batch.id, lot: batch.lot, jobId: job.id, ...example });
  }

  const [unitTotal] = await db.select({ n: count() }).from(schema.units).where(eq(schema.units.manufacturerId, manufacturer.id));
  const [scenarioUnits] = await db.select({ n: count() }).from(schema.units).where(eq(schema.units.productId, product.id));
  const [scenarioCartons] = await db.select({ n: count() }).from(schema.cartons).where(eq(schema.cartons.productId, product.id));
  const verification = await verifyCode(examples[0].code, { channel: "web", region: "LA", deviceKey: "fanta-prototype-e2e", clientKey: "fanta-prototype-e2e" });
  const qrVerification = await verifyQr(examples[0].payload, { channel: "qr", region: "LA", deviceKey: "fanta-prototype-e2e-qr", clientKey: "fanta-prototype-e2e-qr" });
  const scenarioUnitRows = await db.select({ id: schema.units.id, random: schema.units.randomIdentity, cartonId: schema.units.cartonId, batchId: schema.units.batchId, digest: schema.manualCodes.lookupDigest }).from(schema.units).innerJoin(schema.manualCodes, eq(schema.manualCodes.unitId, schema.units.id)).where(eq(schema.units.productId, product.id));
  if (scenarioUnitRows.length !== 480) throw new Error(`Expected 480 Fanta units, found ${scenarioUnitRows.length}`);
  if (new Set(scenarioUnitRows.map((unit) => unit.random.toString("hex"))).size !== 480) throw new Error("Unit random identities are not unique");
  if (new Set(scenarioUnitRows.map((unit) => unit.digest.toString("hex"))).size !== 480) throw new Error("Numeric verification references are not unique");
  if (verification.status !== "issued_no_known_alerts" || qrVerification.status !== "issued_no_known_alerts") throw new Error("QR and numeric verification did not both resolve the released unit");
  const cartonRows = await db.select().from(schema.cartons).where(eq(schema.cartons.productId, product.id));
  if (cartonRows.length !== 20) throw new Error(`Expected 20 carton identities, found ${cartonRows.length}`);
  for (const carton of cartonRows) {
    const assigned = scenarioUnitRows.filter((unit) => unit.cartonId === carton.id);
    if (assigned.length !== 24) throw new Error(`Carton ${carton.code} has ${assigned.length} units, expected 24`);
  }
  const [firstBatch] = await db.select().from(schema.batches).where(eq(schema.batches.id, examples[0].batchId));
  if (firstBatch.createdBy !== production.userId || firstBatch.createdByName !== production.name) throw new Error("Batch creator snapshot does not match authenticated production manager");
  const csvData = await prepareBatchExport(production, firstBatch.id, "csv");
  const csv = buildBatchCsv(csvData, "http://localhost:3000");
  if (csv.toString("utf8").split("\r\n").filter(Boolean).length !== 241) throw new Error("CSV export does not contain exactly 240 unit records");
  await completeBatchExport(production, csvData.exportJobId, csv, csvData.units.length);
  const pdfData = await prepareBatchExport(production, firstBatch.id, "unit_labels_pdf");
  const pdf = buildPrintReadyPdf(pdfData, "units", "http://localhost:3000");
  if (!pdf.subarray(0, 8).toString("binary").startsWith("%PDF-1.4")) throw new Error("Print-ready export is not a valid PDF document");
  await completeBatchExport(production, pdfData.exportJobId, pdf, pdfData.units.length);
  console.log(JSON.stringify({
    manufacturer: { id: manufacturer.id, name: manufacturer.legalName, prefix: manufacturer.alias },
    factory: { id: factory.id, name: factory.name }, line: { id: line.id, name: line.name },
    product: { id: product.id, code: product.alias, name: product.name, status: product.status, regulatoryStatus: product.regulatoryStatus, regulatorySimulated: product.regulatorySimulated, packagingVersion: packaging.version, unitsPerCarton: packaging.unitsPerCarton },
    groupId, batches: batches.map((b) => ({ id: b.id, lot: b.lot, cartons: b.cartonCount, units: b.plannedQuantity })),
    totals: { scenarioCartons: Number(scenarioCartons.n), scenarioUnits: Number(scenarioUnits.n), manufacturerUnits: Number(unitTotal.n) },
    examples, verification: { numericStatus: verification.status, qrStatus: qrVerification.status, sameProduct: verification.product?.alias === qrVerification.product?.alias, headline: verification.headline },
    automatedChecks: { uniqueUnits: 480, cartonsWith24Units: 20, csvRows: 240, pdfBytes: pdf.length, creator: firstBatch.createdByName, persistedStatus: firstBatch.status, cuisBatchCredential: Boolean(firstBatch.cuisCredential) },
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => closeDb());
