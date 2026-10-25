import "server-only";
import { kms } from "./kms";

/**
 * QR credential, canonical binary encoding (94 bytes, base64url in the QR URL):
 *
 *   [0]      format version (1)
 *   [1]      signing key version
 *   [2..5]   issuer (manufacturer) short id, uint32 BE
 *   [6..9]   product short id, uint32 BE
 *   [10..13] batch short id, uint32 BE
 *   [14..29] unit random identity (128-bit CSPRNG)
 *   [30..93] Ed25519 signature over DOMAIN || bytes[0..29]
 *
 * The QR carries no personal or commercially sensitive data. Anyone holding the public key can
 * verify a credential offline; the server additionally checks lifecycle and risk state.
 */

export const CREDENTIAL_FORMAT_VERSION = 1;
const CLAIMS_LENGTH = 30;
const SIGNATURE_LENGTH = 64;
const DOMAIN = Buffer.from("UPA-QR-CREDENTIAL-v1\0");

export type CredentialClaims = {
  formatVersion: number;
  keyVersion: number;
  issuerShortId: number;
  productShortId: number;
  batchShortId: number;
  unitRandom: Buffer;
};

export function encodeClaims(c: CredentialClaims): Buffer {
  if (c.unitRandom.length !== 16) throw new Error("unit random identity must be 16 bytes");
  const buf = Buffer.alloc(CLAIMS_LENGTH);
  buf.writeUInt8(c.formatVersion, 0);
  buf.writeUInt8(c.keyVersion, 1);
  buf.writeUInt32BE(c.issuerShortId, 2);
  buf.writeUInt32BE(c.productShortId, 6);
  buf.writeUInt32BE(c.batchShortId, 10);
  c.unitRandom.copy(buf, 14);
  return buf;
}

function signingInput(claims: Buffer) {
  return Buffer.concat([DOMAIN, claims]);
}

export function signClaims(c: Omit<CredentialClaims, "formatVersion" | "keyVersion">) {
  const keyVersion = kms.activeSigningKeyVersion();
  const claims = encodeClaims({ ...c, formatVersion: CREDENTIAL_FORMAT_VERSION, keyVersion });
  const signature = kms.sign(keyVersion, signingInput(claims));
  return { keyVersion, signature };
}

export function buildPayload(c: CredentialClaims, signature: Buffer): string {
  return Buffer.concat([encodeClaims(c), signature]).toString("base64url");
}

export type DecodedCredential =
  | { ok: true; claims: CredentialClaims }
  | { ok: false; reason: "malformed" | "unsupported_version" | "bad_signature" };

export function decodeAndVerify(payload: string): DecodedCredential {
  if (!/^[A-Za-z0-9_-]{100,140}$/.test(payload)) return { ok: false, reason: "malformed" };
  const buf = Buffer.from(payload, "base64url");
  if (buf.length !== CLAIMS_LENGTH + SIGNATURE_LENGTH) return { ok: false, reason: "malformed" };
  const claimsBuf = buf.subarray(0, CLAIMS_LENGTH);
  const signature = buf.subarray(CLAIMS_LENGTH);
  const formatVersion = claimsBuf.readUInt8(0);
  if (formatVersion !== CREDENTIAL_FORMAT_VERSION) return { ok: false, reason: "unsupported_version" };
  const keyVersion = claimsBuf.readUInt8(1);
  if (!kms.verify(keyVersion, signingInput(claimsBuf), signature)) return { ok: false, reason: "bad_signature" };
  return {
    ok: true,
    claims: {
      formatVersion,
      keyVersion,
      issuerShortId: claimsBuf.readUInt32BE(2),
      productShortId: claimsBuf.readUInt32BE(6),
      batchShortId: claimsBuf.readUInt32BE(10),
      unitRandom: Buffer.from(claimsBuf.subarray(14, 30)),
    },
  };
}
