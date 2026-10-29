import "./load-env";

import { eq } from "drizzle-orm";
import { appendAudit } from "../src/lib/audit";
import { closeDb, getDb, schema } from "../src/db";
import { hashPassword } from "../src/lib/password";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const name = required("BOOTSTRAP_ADMIN_NAME");
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (existing) {
      const [role] = await tx.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, existing.id)).limit(1);
      if (existing.domain !== "platform" || role?.roleKey !== "platform_admin") throw new Error("The bootstrap email already belongs to a non-admin account");
      return { created: false, user: existing };
    }

    const [user] = await tx
      .insert(schema.users)
      .values({ email, name, title: "Platform Administrator", passwordHash: await hashPassword(password), domain: "platform" })
      .returning();
    await tx.insert(schema.platformRoles).values({ userId: user.id, roleKey: "platform_admin" });
    await appendAudit(tx, {
      actorType: "system",
      actorId: user.id,
      action: "platform.admin_bootstrap",
      resourceType: "user",
      resourceId: user.id,
      decision: "allow",
      detail: { email },
    });
    return { created: true, user };
  });

  console.log(result.created ? `platform administrator created: ${result.user.email}` : `platform administrator already exists: ${result.user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
