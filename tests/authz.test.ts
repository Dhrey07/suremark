import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { loadActor } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { createProduct, reviewManufacturer } from "@/lib/services/catalog";
import { createBatch, requestAllocation, startPrintJob } from "@/lib/services/production";
import { initiateRecall } from "@/lib/services/recalls";
import { makeTenant, platformAdmin, resetDb } from "./fixtures";
import { allocatedBatch, draftBatch, releasedBatch } from "./flow";

let a: Awaited<ReturnType<typeof makeTenant>>;
let b: Awaited<ReturnType<typeof makeTenant>>;

beforeEach(async () => {
  await resetDb();
  a = await makeTenant("OKL");
  b = await makeTenant("SFB");
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof DomainError ? e.code : String(e)));

describe("tenant isolation", () => {
  it("hides other tenants' resources as not found", async () => {
    const batch = await draftBatch(a);
    expect(await code(requestAllocation(b.actors.productionManager, batch.id, 5, ""))).toBe("not_found");
    const { printJobId } = await allocatedBatch(a, 5);
    expect(await code(startPrintJob(b.actors.operator, printJobId))).toBe("not_found");
  });

  it("refuses to create batches on another tenant's line or product", async () => {
    const input = { productId: a.product.id, lineId: a.line.id, lot: "X-1", manufactureDate: "2026-10-01", expiryDate: "2028-01-01", plannedQuantity: 5 };
    expect(await code(createBatch(b.actors.productionManager, input))).toBe("not_found");
    expect(await code(createBatch(b.actors.productionManager, { ...input, lineId: b.line.id }))).toBe("not_found");
  });
});

describe("resource scope and permissions", () => {
  it("keeps operators on their own line", async () => {
    const { printJobId } = await allocatedBatch(a, 5);
    expect(await code(startPrintJob(a.actors.operatorLine2, printJobId))).toBe("forbidden");
    expect(await code(startPrintJob(a.actors.operator, printJobId))).toBe("ok");
  });

  it("denies actions outside a role template", async () => {
    const batch = await draftBatch(a);
    expect(await code(requestAllocation(a.actors.operator, batch.id, 5, ""))).toBe("forbidden");
    expect(await code(requestAllocation(a.actors.auditor, batch.id, 5, ""))).toBe("forbidden");
    expect(await code(requestAllocation(a.actors.qa, batch.id, 5, ""))).toBe("forbidden");
    const input = { alias: "NEW", name: "New", dosageForm: "Tablet", strength: "1 mg", packSize: "10" };
    expect(await code(createProduct(a.actors.productionManager, input))).toBe("forbidden");
    expect(await code(createProduct(a.actors.owner, input))).toBe("ok");
  });

  it("scopes factory roles to their factory", async () => {
    const db = getDb();
    const [f2] = await db.insert(schema.factories).values({ manufacturerId: a.manufacturer.id, name: "Second", address: "Agbara", state: "OG" }).returning();
    const [l3] = await db.insert(schema.productionLines).values({ manufacturerId: a.manufacturer.id, factoryId: f2.id, name: "A1" }).returning();
    const input = { productId: a.product.id, lineId: l3.id, lot: "F2-1", manufactureDate: "2026-10-01", expiryDate: "2028-01-01", plannedQuantity: 5 };
    expect(await code(createBatch(a.actors.productionManager, input))).toBe("forbidden");
  });

  it("only compliance can initiate a recall", async () => {
    const { batch } = await releasedBatch(a, { quantity: 5 });
    expect(await code(initiateRecall(a.actors.productionManager, batch.id, "Contamination found", "Return to pharmacy"))).toBe("forbidden");
    expect(await code(initiateRecall(a.actors.compliance, batch.id, "Contamination found", "Return to pharmacy"))).toBe("ok");
  });
});

describe("revocation and onboarding", () => {
  it("removes access as soon as a membership is disabled", async () => {
    const db = getDb();
    const pm = a.actors.productionManager;
    await db.update(schema.organizationMemberships).set({ active: false }).where(eq(schema.organizationMemberships.id, pm.membership!.id));
    const fresh = await loadActor(db, pm.userId, a.manufacturer.id);
    expect(fresh!.membership).toBeNull();
  });

  it("grants no operational access until KYB is approved", async () => {
    const db = getDb();
    const [m] = await db
      .insert(schema.manufacturers)
      .values({ legalName: "Pending Ltd", alias: "PND", rcNumber: "RC-1", sector: "Cosmetics", hqState: "KN" })
      .returning();
    const [u] = await db.insert(schema.users).values({ email: "p@pnd.test", name: "P", passwordHash: "x", domain: "manufacturer" }).returning();
    const [mem] = await db.insert(schema.organizationMemberships).values({ userId: u.id, manufacturerId: m.id }).returning();
    await db.insert(schema.membershipRoles).values({ membershipId: mem.id, roleKey: "owner" });
    expect((await loadActor(db, u.id, m.id))!.membership).toBeNull();
    const admin = await platformAdmin();
    expect(await code(reviewManufacturer(a.actors.owner, m.id, true))).toBe("forbidden");
    await reviewManufacturer(admin, m.id, true);
    expect((await loadActor(db, u.id, m.id))!.membership?.roles).toEqual(["owner"]);
  });
});
