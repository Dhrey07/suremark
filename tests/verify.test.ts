import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/db";
import { formatCode, generateCode } from "@/lib/codes";
import { submitReport } from "@/lib/reports";
import { decideRecall, initiateRecall } from "@/lib/services/recalls";
import { handleUssd, signUssdRequest, ussdResultText, verifyUssdSignature } from "@/lib/ussd";
import { verifyCode, verifyQr, type VerifyContext } from "@/lib/verify";
import { makeTenant, resetDb } from "./fixtures";
import { allocatedBatch, releasedBatch } from "./flow";

let t: Awaited<ReturnType<typeof makeTenant>>;
let n = 0;
const ctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  channel: "web",
  region: "LA",
  deviceKey: `device-${++n}`,
  clientKey: `client-${n}`,
  ...over,
});

beforeEach(async () => {
  await resetDb();
  t = await makeTenant("OKL");
});

describe("verification parity", () => {
  it("returns the same unit and status over QR, web code and USSD", async () => {
    const { labels } = await releasedBatch(t, { quantity: 5 });
    const label = labels[0];
    const qr = await verifyQr(label.payload, ctx({ channel: "qr" }));
    const web = await verifyCode(formatCode(label.code), ctx());
    const ussd = await handleUssd({ sessionId: "s1", serviceCode: "*347*800#", phoneNumber: "+2348000000001", text: `1*${label.code}` });
    expect(qr.status).toBe("issued_no_known_alerts");
    expect(web.status).toBe("issued_no_known_alerts");
    expect(qr.product).toEqual(web.product);
    expect(qr.batch).toEqual(web.batch);
    expect(qr.codeHint).toBe(label.code.slice(-4));
    expect(ussd).toMatch(/^END ISSUED, NO ALERTS/);
    expect(ussd).toContain(web.batch!.lot);
    expect(web.history?.previousChecks).toBe(1);
  });

  it("never reports success for unknown, mistyped or forged codes", async () => {
    const { labels } = await releasedBatch(t, { quantity: 2 });
    expect((await verifyCode(generateCode(), ctx())).status).toBe("unable_to_verify");
    const typo = labels[0].code.slice(0, 15) + ((Number(labels[0].code[15]) + 1) % 10);
    const r = await verifyCode(typo, ctx());
    expect(r.status).toBe("invalid_code");
    const forged = Buffer.from(labels[0].payload, "base64url");
    forged[20] ^= 0xff;
    const f = await verifyQr(forged.toString("base64url"), ctx({ channel: "qr" }));
    expect(f.status).toBe("unable_to_verify");
    expect(f.product).toBeUndefined();
  });
});

describe("lifecycle outcomes", () => {
  it("flags voided, rejected and unreleased codes and alerts the manufacturer", async () => {
    const { printJobId } = await allocatedBatch(t, 3);
    const { startPrintJob, getPrintLabels } = await import("@/lib/services/production");
    await startPrintJob(t.actors.operator, printJobId);
    const [label] = await getPrintLabels(t.actors.operator, printJobId);
    const r = await verifyCode(label.code, ctx());
    expect(r.status).toBe("not_released");
    expect(r.product).toBeUndefined();
    const cases = await getDb().select().from(schema.riskCases);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ kind: "unreleased_code_scanned", severity: "medium" });

    const { labels } = await releasedBatch(t, { quantity: 6, smudged: 1, holdBack: 1 });
    const states = await getDb().select({ id: schema.units.id, state: schema.units.state }).from(schema.units);
    const byId = new Map(states.map((s) => [s.id, s.state]));
    const voided = labels.find((l) => byId.get(l.unitId) === "VOIDED")!;
    const rejected = labels.find((l) => byId.get(l.unitId) === "REJECTED")!;
    expect((await verifyQr(voided.payload, ctx({ channel: "qr" }))).status).toBe("not_released");
    expect((await verifyCode(rejected.code, ctx())).status).toBe("not_released");
    const high = await getDb().select().from(schema.riskCases).where(eq(schema.riskCases.severity, "high"));
    expect(high).toHaveLength(2);
  });

  it("propagates an approved recall to every channel immediately", async () => {
    const { batch, labels } = await releasedBatch(t, { quantity: 4 });
    const recall = await initiateRecall(t.actors.compliance, batch.id, "Out-of-specification dissolution results", "Stop using and return to the pharmacy");
    expect((await verifyCode(labels[0].code, ctx())).status).toBe("issued_no_known_alerts");
    await expect(decideRecall(t.actors.compliance, recall.id, true, "")).rejects.toThrow();
    await decideRecall(t.actors.owner, recall.id, true, "");
    const web = await verifyCode(labels[1].code, ctx());
    const qr = await verifyQr(labels[1].payload, ctx({ channel: "qr" }));
    const ussd = await handleUssd({ sessionId: "s", serviceCode: "*347*800#", phoneNumber: "+2348000000002", text: `1*${labels[1].code}` });
    expect(web.status).toBe("recalled");
    expect(qr.status).toBe("recalled");
    expect(web.recall?.advice).toBe("Stop using and return to the pharmacy");
    expect(ussd).toMatch(/^END WARNING: RECALLED/);
  });

  it("warns on expired batches", async () => {
    const { batch, labels } = await releasedBatch(t, { quantity: 1 });
    await getDb().update(schema.batches).set({ expiryDate: "2026-10-05" }).where(eq(schema.batches.id, batch.id));
    expect((await verifyCode(labels[0].code, ctx())).status).toBe("expired");
  });
});

describe("clone and abuse signals", () => {
  it("treats impossible travel as a copied-code signal, not proof of a fake", async () => {
    const { labels } = await releasedBatch(t, { quantity: 1 });
    expect((await verifyCode(labels[0].code, ctx({ region: "LA" }))).status).toBe("issued_no_known_alerts");
    const r = await verifyQr(labels[0].payload, ctx({ channel: "qr", region: "KN" }));
    expect(r.status).toBe("suspicious");
    expect(r.product).toBeDefined();
    const [c] = await getDb().select().from(schema.riskCases);
    expect(c).toMatchObject({ kind: "possible_clone", severity: "high" });
    // Same-area re-checks from the buyer stay calm, but the open case keeps the code flagged.
    expect((await verifyCode(labels[0].code, ctx({ region: "KN" }))).status).toBe("suspicious");
  });

  it("flags many distinct devices on one code", async () => {
    const { labels } = await releasedBatch(t, { quantity: 1 });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await verifyCode(labels[0].code, ctx({ region: "LA" }))).status);
    expect(statuses.slice(0, 4).every((s) => s === "issued_no_known_alerts")).toBe(true);
    expect(statuses[4]).toBe("suspicious");
  });

  it("rate-limits enumeration with generic responses", async () => {
    const c = ctx();
    const results = [];
    for (let i = 0; i < 12; i++) results.push((await verifyCode(generateCode(), c)).status);
    expect(results.slice(0, 10).every((s) => s === "unable_to_verify")).toBe(true);
    expect(results.slice(10).every((s) => s === "rate_limited")).toBe(true);
  });
});

describe("USSD adapter", () => {
  it("authenticates aggregator callbacks", () => {
    const body = "sessionId=1&text=";
    const ts = String(Date.now());
    const sig = signUssdRequest(body, ts);
    expect(verifyUssdSignature(body, ts, sig)).toBe(true);
    expect(verifyUssdSignature(body + "x", ts, sig)).toBe(false);
    expect(verifyUssdSignature(body, String(Date.now() - 10 * 60_000), signUssdRequest(body, String(Date.now() - 10 * 60_000)))).toBe(false);
    expect(verifyUssdSignature(body, ts, null)).toBe(false);
  });

  it("walks the menu and keeps every response within USSD limits", async () => {
    const { labels } = await releasedBatch(t, { quantity: 1 });
    const req = (text: string) => handleUssd({ sessionId: "s", serviceCode: "*347*800#", phoneNumber: "+2348000000003", text });
    expect(await req("")).toMatch(/^CON /);
    expect(await req("1")).toMatch(/^CON Enter the 16-digit code/);
    expect(await req("9")).toMatch(/^END Invalid option/);
    const report = await req(`2*${labels[0].code}*Seal was broken`);
    expect(report).toMatch(/^END Thank you\. Report ref R[A-Z0-9]{7}/);
    const longest = (["issued_no_known_alerts", "suspicious", "recalled", "expired", "not_released", "unable_to_verify", "invalid_code", "rate_limited", "unavailable"] as const)
      .map((status) =>
        ussdResultText({
          status,
          assurance: "identity_only",
          headline: "",
          message: "",
          checkedAt: "",
          product: { name: "Artemether/Lumefantrine Tablets", strength: "20/120 mg", dosageForm: "", packSize: "", nafdacRegNo: null, alias: "ALU" },
          batch: { lot: "ALU-2610-0042", manufactureDate: "2026-10-01", expiryDate: "2028-09-30" },
          history: { previousChecks: 12, firstCheckedAt: null, firstRegion: null },
          recall: { reason: "", advice: "Stop using this batch and return it to the pharmacy where you bought it.", effectiveAt: "", source: "" },
        }).length,
      );
    expect(Math.max(...longest) + 4).toBeLessThanOrEqual(182);
  });
});

describe("consumer reports", () => {
  it("opens a manufacturer risk case when the code resolves", async () => {
    const { labels } = await releasedBatch(t, { quantity: 1 });
    const r = await submitReport({ code: labels[0].code, description: "Different colour tablets", region: "OY", channel: "web", clientKey: randomUUID() });
    expect(r.ok).toBe(true);
    const [c] = await getDb().select().from(schema.riskCases);
    expect(c).toMatchObject({ kind: "consumer_report" });
  });
});
