import { and, eq, isNull } from "drizzle-orm";
import { schema, type DbOrTx } from "@/db";
import type { Actor, Grant, Membership } from "./authz";

/** Builds the actor from current database state on every request, so revocations apply immediately. */
export async function loadActor(db: DbOrTx, userId: string, activeManufacturerId: string | null): Promise<Actor | null> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.disabledAt)));
  if (!user) return null;

  const platformRoles = (
    await db.select({ roleKey: schema.platformRoles.roleKey }).from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId))
  ).map((r) => r.roleKey);

  let membership: Membership | null = null;
  if (user.domain === "manufacturer") {
    const rows = await db
      .select({
        id: schema.organizationMemberships.id,
        manufacturerId: schema.organizationMemberships.manufacturerId,
        manufacturerName: schema.manufacturers.legalName,
        manufacturerAlias: schema.manufacturers.alias,
        kybStatus: schema.manufacturers.kybStatus,
      })
      .from(schema.organizationMemberships)
      .innerJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.organizationMemberships.manufacturerId))
      .where(and(eq(schema.organizationMemberships.userId, userId), eq(schema.organizationMemberships.active, true)));
    const active = rows.find((r) => r.manufacturerId === activeManufacturerId) ?? rows[0];
    // A tenant that has not passed onboarding review grants no operational access.
    if (active && active.kybStatus === "approved") {
      const [roles, grants] = await Promise.all([
        db.select({ roleKey: schema.membershipRoles.roleKey }).from(schema.membershipRoles).where(eq(schema.membershipRoles.membershipId, active.id)),
        db
          .select({ type: schema.resourceGrants.resourceType, id: schema.resourceGrants.resourceId })
          .from(schema.resourceGrants)
          .where(eq(schema.resourceGrants.membershipId, active.id)),
      ]);
      membership = {
        id: active.id,
        manufacturerId: active.manufacturerId,
        manufacturerName: active.manufacturerName,
        manufacturerAlias: active.manufacturerAlias,
        roles: roles.map((r) => r.roleKey),
        grants: grants as Grant[],
      };
    }
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    domain: user.domain,
    platformRoles,
    membership,
  };
}
