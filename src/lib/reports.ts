import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { checkCode } from "./codes";
import { invalid } from "./errors";
import { isState } from "./geo";
import { kms } from "./kms";
import { hit } from "./ratelimit";
import { resolveCode, upsertRiskCase, type Channel } from "./verify";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function reference() {
  let s = "R";
  for (let i = 0; i < 7; i++) s += ALPHABET[randomInt(0, ALPHABET.length)];
  return s;
}

export type ReportInput = { code?: string; description: string; region?: string | null; channel: Channel; clientKey: string };

/** Consumer counterfeit report. Collects no contact details; the reference lets the consumer follow up. */
export async function submitReport(input: ReportInput): Promise<{ ok: true; reference: string } | { ok: false; reason: "rate_limited" }> {
  const description = input.description.trim();
  if (description.length < 5) throw invalid("Please describe what looked wrong (at least 5 characters).");
  if (description.length > 1000) throw invalid("Please keep the description under 1000 characters.");
  const subject = kms.mac("ip", `report:${input.clientKey}`).toString("base64url");
  if (!(await hit(`rp:${subject}`, 5))) return { ok: false, reason: "rate_limited" };

  let unitId: string | null = null;
  if (input.code?.trim()) {
    const check = checkCode(input.code);
    if (check.ok) unitId = await resolveCode(check.code);
  }
  const region = isState(input.region) ? input.region : null;
  const ref = reference();
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.consumerReports).values({ reference: ref, unitId, channel: input.channel, description, region });
    if (unitId) {
      const [unit] = await tx.select().from(schema.units).where(eq(schema.units.id, unitId));
      await upsertRiskCase(tx, {
        manufacturerId: unit.manufacturerId,
        unitId,
        batchId: unit.batchId,
        kind: "consumer_report",
        severity: "medium",
        summary: "A consumer reported a suspected counterfeit for this code.",
        evidence: { reference: ref, description: description.slice(0, 280), region, channel: input.channel },
      });
    }
  });
  return { ok: true, reference: ref };
}
