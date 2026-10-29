import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import { appendAudit } from "../audit";
import { authorize, authorizePlatform, type Actor } from "../authz";
import { isUniqueViolation } from "../db-errors";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { validateNafdacRegistration } from "../regulatory";

export type ProductInput = {
  alias?: string;
  name: string;
  dosageForm: string;
  strength: string;
  packSize: string;
  brand?: string;
  familyName?: string;
  variant?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  packagingType?: string;
  netQuantity?: number;
  measurementUnit?: string;
  manufacturingRequirements?: string;
  shelfLifeDays?: number;
  unitsPerCarton?: number;
  cartonsPerPallet?: number;
  gtin?: string;
  nafdacRegNo?: string;
};

function familyCode(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length < 2) throw invalid("Product family must contain at least two letters.");
  const consonants = letters.slice(1).split("").filter((letter) => !"AEIOU".includes(letter));
  return `${letters[0]}${consonants.at(-1) ?? letters.at(-1)}`;
}

async function allocateProductCode(tx: Tx, manufacturerId: string, familyId: string, prefix: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`product-code:${familyId}`}))`);
  const rows = await tx.select({ alias: schema.products.alias }).from(schema.products).where(eq(schema.products.manufacturerId, manufacturerId));
  const used = new Set(rows.map((row) => row.alias));
  for (let sequence = 1; sequence <= 99; sequence++) {
    const candidate = `${prefix}${String(sequence).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw conflict(`Product family ${prefix} has exhausted its two-digit identifier range.`);
}

export function isValidGtin(gtin: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin)) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export async function createProduct(actor: Actor, input: ProductInput) {
  if (!actor.membership) throw forbidden();
  const manufacturerId = actor.membership.manufacturerId;
  const brand = (input.brand?.trim() || "Unbranded").slice(0, 120);
  const familyName = (input.familyName?.trim() || input.name.trim()).slice(0, 120);
  const variant = (input.variant?.trim() || input.name.trim()).slice(0, 160);
  const category = (input.category?.trim() || "General").slice(0, 100);
  const description = input.description?.trim() || "";
  const packagingType = (input.packagingType?.trim() || input.dosageForm.trim()).slice(0, 80);
  const netQuantity = input.netQuantity ?? 1;
  const measurementUnit = (input.measurementUnit?.trim() || "unit").slice(0, 24);
  const shelfLifeDays = input.shelfLifeDays ?? 730;
  const unitsPerCarton = input.unitsPerCarton ?? 1;
  const cartonsPerPallet = input.cartonsPerPallet || null;
  if (!Number.isInteger(netQuantity) || netQuantity < 1) throw invalid("Net quantity must be a positive whole number.");
  if (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 1 || shelfLifeDays > 7300) throw invalid("Shelf life must be between 1 and 7,300 days.");
  if (!Number.isInteger(unitsPerCarton) || unitsPerCarton < 1 || unitsPerCarton > 10000) throw invalid("Units per carton must be between 1 and 10,000.");
  if (cartonsPerPallet !== null && (!Number.isInteger(cartonsPerPallet) || cartonsPerPallet < 1 || cartonsPerPallet > 10000)) throw invalid("Cartons per pallet must be between 1 and 10,000.");
  for (const [field, value] of [
    ["Product name", input.name],
    ["Dosage form", input.dosageForm],
    ["Strength", input.strength],
    ["Pack size", input.packSize],
  ] as const) {
    if (!value.trim()) throw invalid(`${field} is required.`);
  }
  const gtin = input.gtin?.trim() || null;
  if (gtin && !isValidGtin(gtin)) throw invalid("GTIN is not valid (length or check digit).");
  const regulatory = validateNafdacRegistration({ registrationNumber: input.nafdacRegNo, productFamily: familyName, productName: input.name });

  return getDb().transaction(async (tx) => {
    await authorize(actor, "catalog:manage", { manufacturerId });
    const [manufacturer] = await tx.select({ status: schema.manufacturers.operationalStatus }).from(schema.manufacturers).where(eq(schema.manufacturers.id, manufacturerId));
    if (!manufacturer || manufacturer.status !== "active") throw forbidden("Manufacturer operations are suspended.");
    try {
      let [family] = await tx
        .select()
        .from(schema.productFamilies)
        .where(and(eq(schema.productFamilies.manufacturerId, manufacturerId), sql`lower(${schema.productFamilies.name}) = lower(${familyName})`))
        .limit(1);
      if (!family) {
        const base = familyCode(familyName);
        const existingCodes = new Set((await tx.select({ code: schema.productFamilies.code }).from(schema.productFamilies).where(eq(schema.productFamilies.manufacturerId, manufacturerId))).map((row) => row.code));
        let code = base;
        for (let i = 0; existingCodes.has(code); i++) code = `${base[0]}${(i + 1).toString(36).toUpperCase()}`.slice(0, 4);
        [family] = await tx.insert(schema.productFamilies).values({ manufacturerId, name: familyName, brand, code, description, createdBy: actor.userId }).returning();
      }
      const alias = await allocateProductCode(tx, manufacturerId, family.id, family.code);
      const [product] = await tx
        .insert(schema.products)
        .values({
          manufacturerId,
          familyId: family.id,
          alias,
          name: input.name.trim(),
          brand,
          variant,
          category,
          description,
          imageUrl: input.imageUrl?.trim() || null,
          dosageForm: input.dosageForm.trim(),
          strength: input.strength.trim(),
          packSize: input.packSize.trim(),
          packagingType,
          netQuantity,
          measurementUnit,
          manufacturingRequirements: input.manufacturingRequirements?.trim() || null,
          shelfLifeDays,
          gtin,
          nafdacRegNo: regulatory.normalized,
          regulatoryStatus: regulatory.status,
          regulatorySource: regulatory.source,
          regulatoryVerifiedAt: regulatory.verifiedAt,
          regulatoryNote: regulatory.note,
          regulatorySimulated: regulatory.simulated,
          createdBy: actor.userId,
        })
        .returning();
      const [packaging] = await tx.insert(schema.packagingVersions).values({ manufacturerId, productId: product.id, version: 1, unitType: packagingType, unitsPerCarton, cartonsPerPallet, createdBy: actor.userId }).returning();
      await appendAudit(tx, {
        manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "product.create",
        resourceType: "product",
        resourceId: product.id,
        decision: "allow",
        detail: { alias, name: product.name, family: family.name, packagingVersion: 1, unitsPerCarton, regulatoryStatus: regulatory.status, simulated: regulatory.simulated },
      });
      return { product, family, packaging };
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("This product, GTIN, or registration number is already registered.");
      throw err;
    }
  });
}

export async function updateProduct(actor: Actor, productId: string, input: Pick<ProductInput, "name" | "variant" | "category" | "description" | "imageUrl" | "manufacturingRequirements" | "shelfLifeDays" | "packagingType" | "unitsPerCarton" | "cartonsPerPallet">) {
  if (!actor.membership) throw forbidden();
  const manufacturerId = actor.membership.manufacturerId;
  if (!input.name.trim() || !input.variant?.trim() || !input.category?.trim()) throw invalid("Name, variant and category are required.");
  if (!Number.isInteger(input.shelfLifeDays) || input.shelfLifeDays! < 1 || input.shelfLifeDays! > 7300) throw invalid("Shelf life must be between 1 and 7,300 days.");
  if (!Number.isInteger(input.unitsPerCarton) || input.unitsPerCarton! < 1 || input.unitsPerCarton! > 10000) throw invalid("Units per carton must be between 1 and 10,000.");
  return getDb().transaction(async (tx) => {
    await authorize(actor, "catalog:manage", { manufacturerId }, { type: "product", id: productId });
    const [product] = await tx.select().from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.manufacturerId, manufacturerId))).for("update");
    if (!product) throw notFound("Product not found");
    const [currentPack] = await tx.select().from(schema.packagingVersions).where(and(eq(schema.packagingVersions.productId, productId), eq(schema.packagingVersions.active, true))).for("update");
    await tx.update(schema.products).set({
      name: input.name.trim(), variant: input.variant!.trim(), category: input.category!.trim(), description: input.description?.trim() || "", imageUrl: input.imageUrl?.trim() || null,
      manufacturingRequirements: input.manufacturingRequirements?.trim() || null, shelfLifeDays: input.shelfLifeDays!, packagingType: input.packagingType?.trim() || product.packagingType,
    }).where(eq(schema.products.id, productId));
    const packagingChanged = !currentPack || currentPack.unitsPerCarton !== input.unitsPerCarton || currentPack.cartonsPerPallet !== (input.cartonsPerPallet || null) || currentPack.unitType !== (input.packagingType?.trim() || product.packagingType);
    let packagingVersion = currentPack?.version ?? 0;
    if (packagingChanged) {
      if (currentPack) await tx.update(schema.packagingVersions).set({ active: false }).where(eq(schema.packagingVersions.id, currentPack.id));
      packagingVersion += 1;
      await tx.insert(schema.packagingVersions).values({ manufacturerId, productId, version: packagingVersion, unitType: input.packagingType?.trim() || product.packagingType, unitsPerCarton: input.unitsPerCarton!, cartonsPerPallet: input.cartonsPerPallet || null, createdBy: actor.userId });
    }
    await appendAudit(tx, { manufacturerId, actorType: "user", actorId: actor.userId, action: "product.update", resourceType: "product", resourceId: productId, decision: "allow", detail: { packagingChanged, packagingVersion } });
    return { packagingChanged, packagingVersion };
  });
}

export async function reviewProduct(actor: Actor, productId: string, approve: boolean) {
  return getDb().transaction(async (tx) => {
    await authorizePlatform(actor, "products:review");
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, productId)).for("update");
    if (!product) throw notFound("Product not found");
    if (product.status !== "pending") throw conflict("This product has already been reviewed.");
    await tx
      .update(schema.products)
      .set({ status: approve ? "approved" : "rejected", reviewedBy: actor.userId, reviewedAt: new Date() })
      .where(eq(schema.products.id, product.id));
    await appendAudit(tx, {
      manufacturerId: product.manufacturerId,
      actorType: "user",
      actorId: actor.userId,
      action: approve ? "product.approve" : "product.reject",
      resourceType: "product",
      resourceId: product.id,
      decision: "allow",
    });
    const recipients = await tx
      .select({ userId: schema.organizationMemberships.userId })
      .from(schema.organizationMemberships)
      .where(and(eq(schema.organizationMemberships.manufacturerId, product.manufacturerId), eq(schema.organizationMemberships.active, true)));
    if (recipients.length) await tx.insert(schema.notifications).values(recipients.map(({ userId }) => ({
      userId,
      manufacturerId: product.manufacturerId,
      kind: approve ? "product_approved" : "product_rejected",
      title: approve ? "Product approved" : "Product rejected",
      body: `${product.name} was ${approve ? "approved for identity issuance" : "rejected by platform review"}.`,
      href: "/app/products",
    })));
  });
}

export async function reviewManufacturer(actor: Actor, manufacturerId: string, approve: boolean) {
  return getDb().transaction(async (tx) => {
    await authorizePlatform(actor, "manufacturers:review");
    const [m] = await tx
      .select()
      .from(schema.manufacturers)
      .where(and(eq(schema.manufacturers.id, manufacturerId)))
      .for("update");
    if (!m) throw notFound("Manufacturer not found");
    if (m.kybStatus !== "pending") throw conflict("This application has already been reviewed.");
    await tx
      .update(schema.manufacturers)
      .set({ kybStatus: approve ? "approved" : "rejected", kybReviewedBy: actor.userId, kybReviewedAt: new Date() })
      .where(eq(schema.manufacturers.id, m.id));
    await appendAudit(tx, {
      manufacturerId: m.id,
      actorType: "user",
      actorId: actor.userId,
      action: approve ? "manufacturer.kyb_approve" : "manufacturer.kyb_reject",
      resourceType: "manufacturer",
      resourceId: m.id,
      decision: "allow",
    });
    await tx.insert(schema.manufacturerReviewEvents).values({
      manufacturerId: m.id,
      actorId: actor.userId,
      action: approve ? "approved" : "rejected",
    });
    const recipients = await tx
      .select({ userId: schema.organizationMemberships.userId })
      .from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.manufacturerId, m.id));
    if (recipients.length) await tx.insert(schema.notifications).values(recipients.map(({ userId }) => ({
      userId,
      manufacturerId: m.id,
      kind: approve ? "manufacturer_approved" : "manufacturer_rejected",
      title: approve ? "Organization approved" : "Organization application rejected",
      body: approve ? `${m.legalName} can now access manufacturer operations.` : `${m.legalName} did not pass the current review.`,
      href: approve ? "/app" : null,
    })));
  });
}

export async function setManufacturerOperationalStatus(actor: Actor, manufacturerId: string, suspended: boolean, reason: string) {
  const note = reason.trim();
  if (note.length < 10) throw invalid("Provide a reason of at least 10 characters.");
  return getDb().transaction(async (tx) => {
    await authorizePlatform(actor, "manufacturers:govern");
    const [m] = await tx.select().from(schema.manufacturers).where(eq(schema.manufacturers.id, manufacturerId)).for("update");
    if (!m) throw notFound("Manufacturer not found");
    if (m.kybStatus !== "approved") throw conflict("Only approved manufacturers can be suspended or reactivated.");
    const target = suspended ? "suspended" : "active";
    if (m.operationalStatus === target) throw conflict(`Manufacturer is already ${target}.`);
    const now = new Date();
    await tx.update(schema.manufacturers).set({ operationalStatus: target, statusReason: note, statusChangedBy: actor.userId, statusChangedAt: now }).where(eq(schema.manufacturers.id, m.id));
    await tx.insert(schema.manufacturerReviewEvents).values({ manufacturerId: m.id, actorId: actor.userId, action: suspended ? "suspended" : "reactivated", note });
    if (suspended) {
      const memberUsers = await tx.select({ userId: schema.organizationMemberships.userId }).from(schema.organizationMemberships).where(eq(schema.organizationMemberships.manufacturerId, m.id));
      if (memberUsers.length) await tx.update(schema.sessions).set({ revokedAt: now }).where(inArray(schema.sessions.userId, memberUsers.map((row) => row.userId)));
    }
    const recipients = await tx.select({ userId: schema.organizationMemberships.userId }).from(schema.organizationMemberships).where(and(eq(schema.organizationMemberships.manufacturerId, m.id), eq(schema.organizationMemberships.active, true)));
    if (recipients.length) await tx.insert(schema.notifications).values(recipients.map(({ userId }) => ({
      userId, manufacturerId: m.id, kind: suspended ? "manufacturer_suspended" : "manufacturer_reactivated",
      title: suspended ? "Organization access suspended" : "Organization access restored",
      body: note, href: suspended ? null : "/app",
    })));
    await appendAudit(tx, { manufacturerId: m.id, actorType: "user", actorId: actor.userId, action: suspended ? "manufacturer.suspend" : "manufacturer.reactivate", resourceType: "manufacturer", resourceId: m.id, decision: "allow", detail: { reason: note } });
  });
}
