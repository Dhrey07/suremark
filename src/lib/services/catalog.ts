import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "../audit";
import { authorize, authorizePlatform, type Actor } from "../authz";
import { isUniqueViolation } from "../db-errors";
import { conflict, forbidden, invalid, notFound } from "../errors";

export type ProductInput = {
  alias: string;
  name: string;
  dosageForm: string;
  strength: string;
  packSize: string;
  gtin?: string;
  nafdacRegNo?: string;
};

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
  const alias = input.alias.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(alias)) throw invalid("Product alias must be 2-8 letters or digits.");
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

  return getDb().transaction(async (tx) => {
    await authorize(actor, "catalog:manage", { manufacturerId });
    try {
      const [product] = await tx
        .insert(schema.products)
        .values({
          manufacturerId,
          alias,
          name: input.name.trim(),
          dosageForm: input.dosageForm.trim(),
          strength: input.strength.trim(),
          packSize: input.packSize.trim(),
          gtin,
          nafdacRegNo: input.nafdacRegNo?.trim() || null,
          createdBy: actor.userId,
        })
        .returning();
      await appendAudit(tx, {
        manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "product.create",
        resourceType: "product",
        resourceId: product.id,
        decision: "allow",
        detail: { alias, name: product.name },
      });
      return product;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`Product alias ${alias} is already used.`);
      throw err;
    }
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
  });
}
