import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import { invalid } from "./errors";
import { hashPassword, sha256 } from "./password";

export async function createPasswordReset(email: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  if (!user || user.disabledAt) return null;
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.insert(schema.passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) });
    await appendAudit(tx, { actorType: "user", actorId: user.id, action: "auth.password_reset_request", decision: "allow" });
  });
  return token;
}

export async function resetPassword(token: string, password: string) {
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw invalid("Use at least 12 characters with uppercase, lowercase and a number.");
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.passwordResetTokens).where(and(eq(schema.passwordResetTokens.tokenHash, sha256(token)), isNull(schema.passwordResetTokens.usedAt), gt(schema.passwordResetTokens.expiresAt, new Date()))).for("update");
    if (!row) throw invalid("This password-reset link is invalid or has expired.");
    const now = new Date();
    await tx.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, row.userId));
    await tx.update(schema.passwordResetTokens).set({ usedAt: now }).where(eq(schema.passwordResetTokens.id, row.id));
    await tx.update(schema.sessions).set({ revokedAt: now }).where(eq(schema.sessions.userId, row.userId));
    await appendAudit(tx, { actorType: "user", actorId: row.userId, action: "auth.password_reset", decision: "allow" });
  });
}
