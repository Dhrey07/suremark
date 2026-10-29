import { eq } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import { appendAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";
import { conflict, invalid } from "@/lib/errors";
import { isState } from "@/lib/geo";
import { hashPassword, sha256 } from "@/lib/password";
import { hit } from "@/lib/ratelimit";

export type ManufacturerApplicationInput = {
  legalName: string;
  rcNumber: string;
  sector: string;
  hqState: string;
  ownerName: string;
  ownerTitle: string;
  ownerEmail: string;
  password: string;
};

function prefixBase(legalName: string) {
  const words = legalName.toUpperCase().match(/[A-Z]+/g) ?? [];
  const meaningful = words.filter((word) => !["LIMITED", "LTD", "PLC", "INC", "COMPANY", "CO"].includes(word));
  const initials = meaningful.map((word) => word[0]).join("");
  const compact = meaningful.join("");
  return (initials.length >= 2 ? initials : compact.slice(0, 3)).slice(0, 4).padEnd(2, "X");
}

async function nextManufacturerPrefix(tx: Tx, legalName: string) {
  const taken = new Set((await tx.select({ alias: schema.manufacturers.alias }).from(schema.manufacturers)).map((row) => row.alias));
  const base = prefixBase(legalName);
  for (let sequence = 0; sequence < 1296; sequence++) {
    const suffix = sequence === 0 ? "" : sequence.toString(36).toUpperCase();
    const candidate = `${base.slice(0, 6 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw conflict("Unable to allocate a manufacturer prefix. Contact platform support.");
}

function required(value: string, label: string, max: number) {
  const normalized = value.trim();
  if (normalized.length < 2) throw invalid(`${label} is required.`);
  if (normalized.length > max) throw invalid(`${label} is too long.`);
  return normalized;
}

export async function submitManufacturerApplication(input: ManufacturerApplicationInput) {
  const legalName = required(input.legalName, "Legal company name", 180);
  const rcNumber = required(input.rcNumber, "Registration number", 80);
  const sector = required(input.sector, "Sector", 100);
  const hqState = input.hqState.trim().toUpperCase();
  if (!isState(hqState)) throw invalid("Select a valid headquarters state.");
  const ownerName = required(input.ownerName, "Representative name", 140);
  const ownerTitle = required(input.ownerTitle, "Representative title", 120);
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 254) throw invalid("Enter a valid work email address.");
  if (input.password.length < 12) throw invalid("Password must contain at least 12 characters.");

  const bucket = sha256(`manufacturer-application:${ownerEmail}`).toString("base64url");
  if (!(await hit(bucket, 5))) throw invalid("Too many application attempts. Try again later.");
  const passwordHash = await hashPassword(input.password);

  try {
    return await getDb().transaction(async (tx) => {
      const alias = await nextManufacturerPrefix(tx, legalName);
      const [existingEmail] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, ownerEmail)).limit(1);
      if (existingEmail) throw conflict("An account already exists for this email address.");
      const [manufacturer] = await tx
        .insert(schema.manufacturers)
        .values({ legalName, alias, rcNumber, sector, hqState })
        .returning();
      const [owner] = await tx
        .insert(schema.users)
        .values({ email: ownerEmail, name: ownerName, title: ownerTitle, passwordHash, domain: "manufacturer" })
        .returning();
      const [membership] = await tx
        .insert(schema.organizationMemberships)
        .values({ userId: owner.id, manufacturerId: manufacturer.id })
        .returning();
      await tx.insert(schema.membershipRoles).values({ membershipId: membership.id, roleKey: "owner" });
      await tx.insert(schema.resourceGrants).values({ membershipId: membership.id, resourceType: "organization", resourceId: manufacturer.id });

      await appendAudit(tx, {
        manufacturerId: manufacturer.id,
        actorType: "user",
        actorId: owner.id,
        action: "manufacturer.application_submit",
        resourceType: "manufacturer",
        resourceId: manufacturer.id,
        decision: "allow",
        detail: { legalName, alias, rcNumber, sector, hqState },
      });

      const reviewers = await tx
        .select({ userId: schema.platformRoles.userId })
        .from(schema.platformRoles)
        .where(eq(schema.platformRoles.roleKey, "platform_admin"));
      if (reviewers.length) {
        await tx.insert(schema.notifications).values(
          reviewers.map(({ userId }) => ({
            userId,
            manufacturerId: manufacturer.id,
            kind: "manufacturer_application",
            title: "New manufacturer application",
            body: `${legalName} submitted an onboarding application.`,
            href: "/platform/manufacturers",
          })),
        );
      }
      return manufacturer;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("An account or manufacturer with these details already exists.");
    throw error;
  }
}
