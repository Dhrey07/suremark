import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildPayload, decodeAndVerify, signClaims, CREDENTIAL_FORMAT_VERSION } from "@/lib/credential";
import { kms } from "@/lib/kms";

const claims = () => ({ issuerShortId: 7, productShortId: 42, batchShortId: 1001, unitRandom: randomBytes(16) });

function issue(c = claims()) {
  const { keyVersion, signature } = signClaims(c);
  return { c, keyVersion, payload: buildPayload({ ...c, formatVersion: CREDENTIAL_FORMAT_VERSION, keyVersion }, signature) };
}

afterEach(() => {
  process.env.SIGNING_KEY_VERSION = "1";
  delete process.env.REVOKED_KEY_VERSIONS;
});

describe("QR credential", () => {
  it("round-trips and fits comfortably in a QR URL", () => {
    const { c, payload } = issue();
    expect(payload.length).toBe(126);
    const d = decodeAndVerify(payload);
    expect(d.ok && d.claims.unitRandom.equals(c.unitRandom)).toBe(true);
    expect(d.ok && d.claims.batchShortId).toBe(1001);
  });

  it("fails if any claim byte or signature byte changes", () => {
    const { payload } = issue();
    const raw = Buffer.from(payload, "base64url");
    for (let i = 0; i < raw.length; i++) {
      const t = Buffer.from(raw);
      t[i] ^= 0x01;
      expect(decodeAndVerify(t.toString("base64url")).ok).toBe(false);
    }
  });

  it("rejects malformed input", () => {
    expect(decodeAndVerify("not-a-credential")).toEqual({ ok: false, reason: "malformed" });
    expect(decodeAndVerify("A".repeat(126)).ok).toBe(false);
  });

  it("keeps old credentials valid after rotation, and refuses revoked keys", () => {
    const old = issue();
    process.env.SIGNING_KEY_VERSION = "2";
    const fresh = issue();
    expect(fresh.keyVersion).toBe(2);
    expect(decodeAndVerify(old.payload).ok).toBe(true);
    expect(decodeAndVerify(fresh.payload).ok).toBe(true);
    process.env.REVOKED_KEY_VERSIONS = "1";
    expect(decodeAndVerify(old.payload)).toEqual({ ok: false, reason: "bad_signature" });
    expect(decodeAndVerify(fresh.payload).ok).toBe(true);
    expect(kms.publicKeys().map((k) => k.status)).toEqual(["revoked", "active"]);
  });

  it("refuses credentials claiming a future key version", () => {
    process.env.SIGNING_KEY_VERSION = "2";
    const future = issue();
    process.env.SIGNING_KEY_VERSION = "1";
    expect(decodeAndVerify(future.payload).ok).toBe(false);
  });
});
