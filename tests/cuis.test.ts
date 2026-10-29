import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { CUIS_RANDOM_BYTES, CUIS_TAG_BYTES, decodeAndVerifyCuis, encodeCuisClaims, issueCuisCredential } from "@/lib/cuis";
import { authenticateCuisBeforeRegistryLookup } from "@/lib/credential-registry";

const ids = () => ({ manufacturerId: randomUUID(), productId: randomUUID(), batchId: randomUUID() });

function mutate(payload: string, offset: number) {
  const raw = Buffer.from(payload, "base64url");
  raw[offset] ^= 1;
  return raw.toString("base64url");
}

afterEach(() => {
  process.env.SIGNING_KEY_VERSION = "1";
  delete process.env.REVOKED_KEY_VERSIONS;
  delete process.env.CUIS_KEY_PROVIDER;
});

describe("CUIS v1 canonical credentials", () => {
  it("uses the RFC 4231 HMAC-SHA-256 standard vector", () => {
    const key = Buffer.alloc(20, 0x0b);
    const digest = createHmac("sha256", key).update("Hi There").digest("hex");
    expect(digest).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  it("issues independent 128-bit random identities and 128-bit tags", () => {
    const base = ids();
    const credentials = Array.from({ length: 10_000 }, () => issueCuisCredential({ type: "unit", ...base }));
    expect(credentials.every((c) => c.randomIdentity.length === CUIS_RANDOM_BYTES && c.authTag.length === CUIS_TAG_BYTES)).toBe(true);
    expect(new Set(credentials.map((c) => c.randomIdentity.toString("hex"))).size).toBe(credentials.length);
  });

  it("round-trips every credential type with unambiguous binary fields", () => {
    const base = ids();
    const batch = issueCuisCredential({ type: "batch", manufacturerId: base.manufacturerId, productId: base.productId });
    const carton = issueCuisCredential({ type: "carton", ...base });
    const unit = issueCuisCredential({ type: "unit", ...base });
    expect(decodeAndVerifyCuis(batch.payload, "batch")).toMatchObject({ ok: true, claims: { type: "batch", manufacturerId: base.manufacturerId, productId: base.productId } });
    expect(decodeAndVerifyCuis(carton.payload, "carton")).toMatchObject({ ok: true, claims: { type: "carton", batchId: base.batchId } });
    expect(decodeAndVerifyCuis(unit.payload, "unit")).toMatchObject({ ok: true, claims: { type: "unit", batchId: base.batchId } });
    expect(encodeCuisClaims(unit).length).toBe(72);
  });

  it("rejects changes to manufacturer, product, batch, random identity or authentication tag", () => {
    const credential = issueCuisCredential({ type: "unit", ...ids() });
    for (const offset of [8, 24, 40, 56, Buffer.from(credential.payload, "base64url").length - 1]) {
      expect(decodeAndVerifyCuis(mutate(credential.payload, offset), "unit")).toMatchObject({ ok: false, reason: "bad_tag" });
    }
  });

  it("rejects wrong types, unsupported versions, unknown keys and revoked keys", () => {
    const credential = issueCuisCredential({ type: "unit", ...ids() });
    expect(decodeAndVerifyCuis(credential.payload, "carton")).toEqual({ ok: false, reason: "invalid_type" });
    expect(decodeAndVerifyCuis(mutate(credential.payload, 4), "unit")).toEqual({ ok: false, reason: "unsupported_version" });
    const unknown = Buffer.from(credential.payload, "base64url");
    unknown.writeUInt16BE(99, 6);
    expect(decodeAndVerifyCuis(unknown.toString("base64url"), "unit")).toEqual({ ok: false, reason: "unknown_key" });
    process.env.REVOKED_KEY_VERSIONS = "1";
    expect(decodeAndVerifyCuis(credential.payload, "unit")).toEqual({ ok: false, reason: "revoked_key" });
  });

  it("keeps historical keys verifiable after rotation", () => {
    const old = issueCuisCredential({ type: "unit", ...ids() });
    process.env.SIGNING_KEY_VERSION = "2";
    const fresh = issueCuisCredential({ type: "unit", ...ids() });
    expect(decodeAndVerifyCuis(old.payload, "unit").ok).toBe(true);
    expect(decodeAndVerifyCuis(fresh.payload, "unit").ok).toBe(true);
  });

  it("strictly rejects malformed, truncated and oversized encodings", () => {
    const credential = issueCuisCredential({ type: "unit", ...ids() });
    expect(decodeAndVerifyCuis("not+a+credential", "unit")).toEqual({ ok: false, reason: "malformed" });
    expect(decodeAndVerifyCuis(credential.payload.slice(0, -4), "unit")).toEqual({ ok: false, reason: "malformed" });
    expect(decodeAndVerifyCuis("A".repeat(161), "unit")).toEqual({ ok: false, reason: "malformed" });
  });

  it("compares complete tags and refuses every one-byte tag modification", () => {
    const credential = issueCuisCredential({ type: "unit", ...ids(), randomIdentity: randomBytes(16) });
    const raw = Buffer.from(credential.payload, "base64url");
    for (let i = raw.length - CUIS_TAG_BYTES; i < raw.length; i++) {
      expect(decodeAndVerifyCuis(mutate(credential.payload, i), "unit")).toMatchObject({ ok: false, reason: "bad_tag" });
    }
  });

  it("never queries the issuance registry when cryptographic proof is invalid", async () => {
    const credential = issueCuisCredential({ type: "unit", ...ids() });
    let registryQueries = 0;
    const result = await authenticateCuisBeforeRegistryLookup(mutate(credential.payload, 56), async () => {
      registryQueries++;
      return { unitId: randomUUID() };
    });
    expect(result).toMatchObject({ ok: false, stage: "cryptographic", reason: "bad_tag" });
    expect(registryQueries).toBe(0);
  });

  it("queries the issuance registry only after valid proof and rejects unknown signed identities", async () => {
    const credential = issueCuisCredential({ type: "unit", ...ids() });
    let registryQueries = 0;
    const result = await authenticateCuisBeforeRegistryLookup(credential.payload, async () => {
      registryQueries++;
      return null;
    });
    expect(result).toMatchObject({ ok: false, stage: "registry", reason: "not_registered" });
    expect(registryQueries).toBe(1);
  });
});
