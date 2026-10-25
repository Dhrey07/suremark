import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { loadActor } from "@/lib/actor";
import type { Actor } from "@/lib/authz";

export async function resetDb() {
  const db = getDb();
  const tables = Object.values(schema)
    .filter((t) => typeof t === "object" && t && Symbol.for("drizzle:Name") in (t as object))
    .map((t) => `"${(t as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]}"`);
  await db.execute(sql.raw(`truncate ${tables.join(", ")} restart identity cascade`));
}

type Role = { key: string; grants: ("org" | "factory" | "line")[] };

export async function makeTenant(alias: string) {
  const db = getDb();
  const [m] = await db
    .insert(schema.manufacturers)
    .values({ legalName: `${alias} Ltd`, alias, rcNumber: `RC-${alias}`, sector: "Pharmaceuticals", hqState: "LA", kybStatus: "approved" })
    .returning();
  const [factory] = await db.insert(schema.factories).values({ manufacturerId: m.id, name: `${alias} Factory`, address: "Ikeja", state: "LA" }).returning();
  const [line] = await db.insert(schema.productionLines).values({ manufacturerId: m.id, factoryId: factory.id, name: "Line 1" }).returning();
  const [line2] = await db.insert(schema.productionLines).values({ manufacturerId: m.id, factoryId: factory.id, name: "Line 2" }).returning();
  const [product] = await db
    .insert(schema.products)
    .values({ manufacturerId: m.id, alias: "PCM", name: "Paracetamol", dosageForm: "Tablet", strength: "500 mg", packSize: "10x10", status: "approved", nafdacRegNo: "DEMO-A4-0001" })
    .returning();

  async function user(name: string, roles: Role[], lineId = line.id): Promise<Actor> {
    const [u] = await db
      .insert(schema.users)
      .values({ email: `${name}.${alias}@test.local`.toLowerCase(), name, passwordHash: "x", domain: "manufacturer" })
      .returning();
    const [mem] = await db.insert(schema.organizationMemberships).values({ userId: u.id, manufacturerId: m.id }).returning();
    for (const r of roles) {
      await db.insert(schema.membershipRoles).values({ membershipId: mem.id, roleKey: r.key }).onConflictDoNothing();
      for (const g of r.grants) {
        const resourceId = g === "org" ? m.id : g === "factory" ? factory.id : lineId;
        await db
          .insert(schema.resourceGrants)
          .values({ membershipId: mem.id, resourceType: g === "org" ? "organization" : g, resourceId })
          .onConflictDoNothing();
      }
    }
    return (await loadActor(db, u.id, m.id))!;
  }

  const actors = {
    owner: await user("owner", [{ key: "owner", grants: ["org"] }]),
    factoryManager: await user("fm", [{ key: "factory_manager", grants: ["factory"] }]),
    productionManager: await user("pm", [{ key: "production_manager", grants: ["factory"] }]),
    operator: await user("op", [{ key: "line_operator", grants: ["line"] }]),
    operatorLine2: await user("op2", [{ key: "line_operator", grants: ["line"] }], line2.id),
    qa: await user("qa", [{ key: "qa_officer", grants: ["factory"] }]),
    compliance: await user("co", [{ key: "compliance_officer", grants: ["org"] }]),
    auditor: await user("au", [{ key: "auditor", grants: ["org"] }]),
  };
  return { manufacturer: m, factory, line, line2, product, actors, user };
}

export async function platformAdmin(): Promise<Actor> {
  const db = getDb();
  const [u] = await db.insert(schema.users).values({ email: "admin@platform.test", name: "Admin", passwordHash: "x", domain: "platform" }).returning();
  await db.insert(schema.platformRoles).values({ userId: u.id, roleKey: "platform_admin" });
  return (await loadActor(db, u.id, null))!;
}
