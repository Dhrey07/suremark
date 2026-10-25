import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import { checkCode, CODE_NAMESPACE } from "./codes";
import { decodeAndVerify } from "./credential";
import { distanceKm, isState, stateName } from "./geo";
import { kms } from "./kms";
import { hit, peek } from "./ratelimit";
import { lagosToday } from "./dates";

export type Channel = "qr" | "web" | "ussd";

export type VerifyContext = {
  channel: Channel;
  /** ISO 3166-2:NG subdivision (e.g. "LA"), coarse location only. */
  region: string | null;
  /** Stable per-device identifier (cookie id, or phone number for USSD). Hashed before storage. */
  deviceKey: string | null;
  /** Rate-limit subject (client IP or phone number). Hashed before use. */
  clientKey: string;
};

export type VerifyStatus =
  | "issued_no_known_alerts"
  | "suspicious"
  | "not_released"
  | "expired"
  | "recalled"
  | "unable_to_verify"
  | "invalid_code"
  | "rate_limited"
  | "unavailable";

export type VerifyResult = {
  status: VerifyStatus;
  assurance: "identity_only";
  headline: string;
  message: string;
  product?: { name: string; strength: string; dosageForm: string; packSize: string; nafdacRegNo: string | null; alias: string };
  manufacturer?: { name: string; alias: string };
  batch?: { lot: string; manufactureDate: string; expiryDate: string };
  recall?: { reason: string; advice: string; effectiveAt: string; source: string };
  history?: { previousChecks: number; firstCheckedAt: string | null; firstRegion: string | null };
  codeHint?: string;
  checkedAt: string;
};

const LIMITS = {
  qr: { total: 60, failures: 20 },
  web: { total: 30, failures: 10 },
  ussd: { total: 20, failures: 8 },
} as const;

const IMPOSSIBLE_SPEED_KMH = 250;
const MIN_TRAVEL_KM = 150;
const MANY_DEVICES = 5;
const HIGH_VOLUME = 15;

const MESSAGES: Record<VerifyStatus, { headline: string; message: string }> = {
  issued_no_known_alerts: {
    headline: "Identity issued — no known alerts",
    message:
      "This code was issued to the manufacturer below and released after quality checks. A code can be copied, so also check the packaging, seal and seller.",
  },
  suspicious: {
    headline: "Possible copied code — use caution",
    message:
      "This is a real issued code, but its check history does not look like a single genuine pack. It may have been copied onto other packs. Do not use the product if anything looks wrong, and report it.",
  },
  not_released: {
    headline: "Code not confirmed as released",
    message:
      "This code exists but was never released for sale. Do not use this product. The manufacturer's quality team has been alerted. Please report where you bought it.",
  },
  expired: {
    headline: "Warning: this product has expired",
    message: "The batch for this code is past its expiry date. Do not use it.",
  },
  recalled: {
    headline: "Warning: this product has been recalled",
    message: "This batch has been recalled. Follow the advice below.",
  },
  unable_to_verify: {
    headline: "Unable to verify this code",
    message:
      "We could not confirm this code. It may be mistyped or not issued by this service. If you are sure it is typed correctly, do not use the product and report it.",
  },
  invalid_code: {
    headline: "Check the code and try again",
    message: "That code has a typing error. Codes are 16 digits — please re-enter it exactly as printed.",
  },
  rate_limited: {
    headline: "Too many attempts",
    message: "Please wait a few minutes and try again.",
  },
  unavailable: {
    headline: "Verification temporarily unavailable",
    message: "We cannot check codes right now. This is not a confirmation either way — please try again shortly.",
  },
};

function result(status: VerifyStatus, extra: Partial<VerifyResult> = {}): VerifyResult {
  return { status, assurance: "identity_only", ...MESSAGES[status], checkedAt: new Date().toISOString(), ...extra };
}


async function overLimit(ctx: VerifyContext): Promise<boolean> {
  const subject = kms.mac("ip", `${ctx.channel}:${ctx.clientKey}`).toString("base64url");
  if ((await peek(`vf:${subject}`)) >= LIMITS[ctx.channel].failures) return true;
  return !(await hit(`vt:${subject}`, LIMITS[ctx.channel].total));
}

async function recordFailure(ctx: VerifyContext) {
  const subject = kms.mac("ip", `${ctx.channel}:${ctx.clientKey}`).toString("base64url");
  await hit(`vf:${subject}`, Number.MAX_SAFE_INTEGER);
}

function deviceHash(ctx: VerifyContext): Buffer | null {
  if (!ctx.deviceKey) return null;
  return kms.mac(ctx.channel === "ussd" ? "phone" : "device", ctx.deviceKey);
}

async function logUnmatched(ctx: VerifyContext, signal: string) {
  await getDb()
    .insert(schema.verificationEvents)
    .values({ channel: ctx.channel, outcome: "unable_to_verify", region: isState(ctx.region) ? ctx.region : null, deviceHash: deviceHash(ctx), signals: [signal] });
}

/** Verify a full QR credential (signature first, then registry state). */
export async function verifyQr(payload: string, ctx: VerifyContext): Promise<VerifyResult> {
  return guard(async () => {
    if (await overLimit(ctx)) return result("rate_limited");
    const decoded = decodeAndVerify(payload);
    if (!decoded.ok) {
      await recordFailure(ctx);
      await logUnmatched(ctx, `qr_${decoded.reason}`);
      return result("unable_to_verify");
    }
    const c = decoded.claims;
    const [row] = await getDb()
      .select({ unitId: schema.units.id })
      .from(schema.units)
      .innerJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.units.manufacturerId))
      .innerJoin(schema.products, eq(schema.products.id, schema.units.productId))
      .innerJoin(schema.batches, eq(schema.batches.id, schema.units.batchId))
      .where(
        and(
          eq(schema.units.randomIdentity, c.unitRandom),
          eq(schema.manufacturers.shortId, c.issuerShortId),
          eq(schema.products.shortId, c.productShortId),
          eq(schema.batches.shortId, c.batchShortId),
        ),
      );
    if (!row) {
      // A valid signature over an unknown identity indicates key misuse; surface it loudly.
      await recordFailure(ctx);
      await logUnmatched(ctx, "qr_signed_but_unregistered");
      return result("unable_to_verify");
    }
    return evaluate(row.unitId, ctx, true);
  });
}

/** Verify a 16-digit numeric reference. Same backend evaluation as QR. */
export async function verifyCode(input: string, ctx: VerifyContext): Promise<VerifyResult> {
  return guard(async () => {
    const check = checkCode(input);
    if (!check.ok) return result("invalid_code");
    if (await overLimit(ctx)) return result("rate_limited");
    const unitId = await resolveCode(check.code);
    if (!unitId) {
      await recordFailure(ctx);
      await logUnmatched(ctx, "code_not_found");
      return result("unable_to_verify");
    }
    return evaluate(unitId, ctx, false);
  });
}

export async function resolveCode(code: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ unitId: schema.manualCodes.unitId })
    .from(schema.manualCodes)
    .where(and(eq(schema.manualCodes.namespace, CODE_NAMESPACE), eq(schema.manualCodes.lookupDigest, kms.mac("code-lookup", `${CODE_NAMESPACE}:${code}`))));
  return row?.unitId ?? null;
}

async function guard(fn: () => Promise<VerifyResult>): Promise<VerifyResult> {
  try {
    return await fn();
  } catch (err) {
    console.error("verification failed", err);
    return result("unavailable");
  }
}

async function evaluate(unitId: string, ctx: VerifyContext, includeCodeHint: boolean): Promise<VerifyResult> {
  return getDb().transaction(async (tx) => {
    const [d] = await tx
      .select({
        unit: schema.units,
        product: schema.products,
        batch: schema.batches,
        manufacturer: schema.manufacturers,
        codeCiphertext: schema.manualCodes.codeCiphertext,
      })
      .from(schema.units)
      .innerJoin(schema.products, eq(schema.products.id, schema.units.productId))
      .innerJoin(schema.batches, eq(schema.batches.id, schema.units.batchId))
      .innerJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.units.manufacturerId))
      .innerJoin(schema.manualCodes, eq(schema.manualCodes.unitId, schema.units.id))
      .where(eq(schema.units.id, unitId))
      // Serialize concurrent checks of the same unit so risk signals see each other.
      .for("update", { of: schema.units });

    const region = isState(ctx.region) ? ctx.region : null;
    const device = deviceHash(ctx);
    const details = {
      product: {
        name: d.product.name,
        strength: d.product.strength,
        dosageForm: d.product.dosageForm,
        packSize: d.product.packSize,
        nafdacRegNo: d.product.nafdacRegNo,
        alias: d.product.alias,
      },
      manufacturer: { name: d.manufacturer.legalName, alias: d.manufacturer.alias },
      batch: { lot: d.batch.lot, manufactureDate: d.batch.manufactureDate, expiryDate: d.batch.expiryDate },
      ...(includeCodeHint ? { codeHint: kms.decrypt("manual-code", d.codeCiphertext, d.unit.id).slice(-4) } : {}),
    };

    const prior = await tx
      .select({ createdAt: schema.verificationEvents.createdAt, region: schema.verificationEvents.region, deviceHash: schema.verificationEvents.deviceHash })
      .from(schema.verificationEvents)
      .where(eq(schema.verificationEvents.unitId, unitId))
      .orderBy(desc(schema.verificationEvents.createdAt))
      .limit(200);
    const first = prior[prior.length - 1];
    const history = {
      previousChecks: prior.length,
      firstCheckedAt: first ? first.createdAt.toISOString() : null,
      firstRegion: first?.region ? stateName(first.region) : null,
    };

    let status: VerifyStatus;
    const signals: string[] = [];
    let recall: VerifyResult["recall"];

    if (d.unit.state === "RECALLED") {
      status = "recalled";
      const [r] = await tx
        .select()
        .from(schema.recalls)
        .where(and(eq(schema.recalls.batchId, d.batch.id), eq(schema.recalls.status, "active")));
      if (r) {
        recall = {
          reason: r.reason,
          advice: r.consumerAdvice,
          effectiveAt: r.effectiveAt!.toISOString(),
          source: `Recall issued by ${d.manufacturer.legalName} and approved under dual control`,
        };
      }
    } else if (d.unit.state !== "ACTIVE") {
      status = "not_released";
      signals.push(`state_${d.unit.state.toLowerCase()}`);
      const destroyed = d.unit.state === "VOIDED" || d.unit.state === "REJECTED";
      await upsertRiskCase(tx, {
        manufacturerId: d.manufacturer.id,
        unitId,
        batchId: d.batch.id,
        kind: "unreleased_code_scanned",
        severity: destroyed ? "high" : "medium",
        summary: destroyed
          ? `A ${d.unit.state.toLowerCase()} label (never sold) was checked by a consumer — possible label leakage from the factory.`
          : `A code still in ${d.unit.state} was checked by a consumer before release.`,
        evidence: { state: d.unit.state, channel: ctx.channel, region },
      });
    } else if (d.batch.expiryDate < lagosToday()) {
      status = "expired";
    } else {
      status = "issued_no_known_alerts";
    }

    if (status === "issued_no_known_alerts" || status === "expired") {
      const now = Date.now();
      for (const p of prior) {
        if (!region || !p.region || p.region === region) continue;
        const km = distanceKm(p.region, region);
        const hours = Math.max((now - p.createdAt.getTime()) / 3600_000, 1 / 60);
        if (km >= MIN_TRAVEL_KM && km / hours > IMPOSSIBLE_SPEED_KMH) {
          signals.push(`impossible_travel:${p.region}->${region}`);
          break;
        }
      }
      const devices = new Set(prior.filter((p) => p.deviceHash).map((p) => p.deviceHash!.toString("hex")));
      if (device) devices.add(device.toString("hex"));
      if (devices.size >= MANY_DEVICES) signals.push(`many_devices:${devices.size}`);
      if (prior.length >= HIGH_VOLUME) signals.push(`high_volume:${prior.length + 1}`);
      const [openCase] = await tx
        .select({ id: schema.riskCases.id })
        .from(schema.riskCases)
        .where(and(eq(schema.riskCases.unitId, unitId), eq(schema.riskCases.kind, "possible_clone"), ne(schema.riskCases.status, "closed")));
      if (openCase && signals.length === 0) signals.push("open_clone_case");

      if (signals.length > 0) {
        if (status === "issued_no_known_alerts") status = "suspicious";
        await upsertRiskCase(tx, {
          manufacturerId: d.manufacturer.id,
          unitId,
          batchId: d.batch.id,
          kind: "possible_clone",
          severity: signals.some((s) => s.startsWith("impossible_travel")) ? "high" : "medium",
          summary: "Check pattern suggests this code may have been copied onto multiple packs.",
          evidence: { signals, region, previousChecks: prior.length },
        });
      }
    }

    await tx.insert(schema.verificationEvents).values({
      unitId,
      manufacturerId: d.manufacturer.id,
      channel: ctx.channel,
      outcome: status as "issued_no_known_alerts" | "suspicious" | "not_released" | "expired" | "recalled",
      region,
      deviceHash: device,
      signals,
    });

    const showDetails = status !== "not_released";
    return result(status, { ...(showDetails ? details : {}), recall, history });
  });
}

async function upsertRiskCase(
  tx: Tx,
  c: {
    manufacturerId: string;
    unitId: string;
    batchId: string;
    kind: "possible_clone" | "unreleased_code_scanned" | "consumer_report";
    severity: "low" | "medium" | "high";
    summary: string;
    evidence: Record<string, unknown>;
  },
) {
  await tx
    .insert(schema.riskCases)
    .values(c)
    .onConflictDoUpdate({
      target: [schema.riskCases.unitId, schema.riskCases.kind],
      targetWhere: sql`status <> 'closed' and unit_id is not null`,
      set: {
        occurrences: sql`${schema.riskCases.occurrences} + 1`,
        evidence: c.evidence,
        severity: sql`case when ${schema.riskCases.severity} = 'high' or excluded.severity = 'high' then 'high'::risk_severity else excluded.severity end`,
        updatedAt: new Date(),
      },
    });
}

export { upsertRiskCase };

/** Region from Vercel's edge geo headers (Nigeria only); null elsewhere. */
export function regionFromHeaders(h: Headers): string | null {
  if (h.get("x-vercel-ip-country") !== "NG") return null;
  const r = h.get("x-vercel-ip-country-region");
  return isState(r) ? r : null;
}

export function clientIp(h: Headers): string {
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

