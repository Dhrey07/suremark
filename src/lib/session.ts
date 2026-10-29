import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { loadActor } from "./actor";
import { appendAudit } from "./audit";
import type { Actor } from "./authz";
import { sha256, verifyPassword } from "./password";
import { hit } from "./ratelimit";

const COOKIE = "upa_session";
const SESSION_HOURS = 12;

export async function signIn(
  email: string,
  password: string,
  expectedDomain?: "platform" | "manufacturer",
): Promise<{ ok: true; home: string } | { ok: false }> {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const bucket = sha256(`login:${normalizedEmail}`).toString("base64url");
  if (!(await hit(bucket, 10))) return { ok: false };
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail));
  const passwordValid = user ? await verifyPassword(password, user.passwordHash) : false;
  const valid = user && !user.disabledAt && passwordValid && (!expectedDomain || user.domain === expectedDomain);
  if (!user || !valid) {
    await db.transaction((tx) =>
      appendAudit(tx, { actorType: "user", actorId: user?.id ?? null, action: "auth.sign_in", decision: "deny" }),
    );
    return { ok: false };
  }
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.insert(schema.sessions).values({
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000),
    });
    await appendAudit(tx, { actorType: "user", actorId: user.id, action: "auth.sign_in", decision: "allow" });
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true, home: user.domain === "platform" ? "/platform/dashboard" : user.domain === "regulator" ? "/regulator" : "/manufacturer/dashboard" };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await getDb().update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  jar.delete(COOKIE);
}

/** Current actor for this request (deduplicated per render). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())));
  if (!session) return null;
  return loadActor(db, session.userId, session.activeManufacturerId);
});

export async function requireActor(loginPath = "/login"): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(loginPath);
  return actor;
}
