import "server-only";
import { randomBytes } from "node:crypto";
import { kms, type CuisCredentialType } from "./kms";

/**
 * CUIS v1 canonical binary credential.
 *
 * Header and claims (authenticated in full):
 *   magic[4] | version:u8 | type:u8 | keyVersion:u16be |
 *   manufacturerUuid[16] | productVariantUuid[16] |
 *   batchUuid[16, CARTON/UNIT only] | randomIdentity[16]
 *
 * Credential container: canonical claims | HMAC-SHA-256 tag truncated to 128 bits.
 * Each type uses a purpose-separated key. UUIDs are encoded as their 16 raw bytes, never as
 * concatenated text, so field boundaries and types are unambiguous.
 */

export const CUIS_PROTOCOL = "CUIS";
export const CUIS_VERSION = 1;
export const CUIS_RANDOM_BYTES = 16;
export const CUIS_TAG_BYTES = 16;
export const CUIS_MAX_ENCODED_LENGTH = 160;

const MAGIC = Buffer.from(CUIS_PROTOCOL, "ascii");
const HEADER_BYTES = 8;
const BATCH_CLAIMS_BYTES = HEADER_BYTES + 16 + 16 + 16;
const CHILD_CLAIMS_BYTES = BATCH_CLAIMS_BYTES + 16;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPE_CODE: Record<CuisCredentialType, number> = { batch: 1, carton: 2, unit: 3 };
const CODE_TYPE: Record<number, CuisCredentialType | undefined> = { 1: "batch", 2: "carton", 3: "unit" };

export type CuisClaims = {
  version: number;
  type: CuisCredentialType;
  keyVersion: number;
  manufacturerId: string;
  productId: string;
  batchId?: string;
  randomIdentity: Buffer;
};

export type IssuedCuisCredential = CuisClaims & { authTag: Buffer; payload: string };

export type CuisDecodeResult =
  | { ok: true; claims: CuisClaims; authTag: Buffer }
  | { ok: false; reason: "malformed" | "unsupported_version" | "invalid_type" | "unknown_key" | "revoked_key" | "bad_tag" };

function uuidBytes(uuid: string): Buffer {
  if (!UUID_RE.test(uuid)) throw new Error("CUIS identifiers must be canonical UUIDs");
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function uuidString(bytes: Buffer): string {
  if (bytes.length !== 16) throw new Error("CUIS UUID field must be 16 bytes");
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function encodeCuisClaims(claims: CuisClaims): Buffer {
  if (claims.version !== CUIS_VERSION) throw new Error("Unsupported CUIS credential version");
  if (!Number.isInteger(claims.keyVersion) || claims.keyVersion < 1 || claims.keyVersion > 65_535) throw new Error("Invalid CUIS key version");
  if (claims.randomIdentity.length !== CUIS_RANDOM_BYTES) throw new Error("CUIS random identity must be 128 bits");
  if (claims.type !== "batch" && !claims.batchId) throw new Error(`${claims.type} credentials must bind an immutable batch UUID`);
  if (claims.type === "batch" && claims.batchId) throw new Error("Batch credentials do not encode a parent batch UUID");

  const child = claims.type !== "batch";
  const out = Buffer.alloc(child ? CHILD_CLAIMS_BYTES : BATCH_CLAIMS_BYTES);
  MAGIC.copy(out, 0);
  out.writeUInt8(CUIS_VERSION, 4);
  out.writeUInt8(TYPE_CODE[claims.type], 5);
  out.writeUInt16BE(claims.keyVersion, 6);
  uuidBytes(claims.manufacturerId).copy(out, 8);
  uuidBytes(claims.productId).copy(out, 24);
  let offset = 40;
  if (child) {
    uuidBytes(claims.batchId!).copy(out, offset);
    offset += 16;
  }
  claims.randomIdentity.copy(out, offset);
  return out;
}

export function issueCuisCredential(input: Omit<CuisClaims, "version" | "keyVersion" | "randomIdentity"> & { randomIdentity?: Buffer }): IssuedCuisCredential {
  const claims: CuisClaims = {
    ...input,
    version: CUIS_VERSION,
    keyVersion: kms.activeSigningKeyVersion(),
    randomIdentity: input.randomIdentity ? Buffer.from(input.randomIdentity) : randomBytes(CUIS_RANDOM_BYTES),
  };
  const canonical = encodeCuisClaims(claims);
  const authTag = kms.cuisTag(claims.type, claims.keyVersion, canonical);
  return { ...claims, authTag, payload: Buffer.concat([canonical, authTag]).toString("base64url") };
}

export function looksLikeCuisCredential(payload: string): boolean {
  if (payload.length > CUIS_MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(payload)) return false;
  try {
    const head = Buffer.from(payload, "base64url").subarray(0, 4);
    return head.length === 4 && head.equals(MAGIC);
  } catch {
    return false;
  }
}

export function decodeAndVerifyCuis(payload: string, expectedType?: CuisCredentialType): CuisDecodeResult {
  if (payload.length < 80 || payload.length > CUIS_MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(payload)) return { ok: false, reason: "malformed" };
  let raw: Buffer;
  try {
    raw = Buffer.from(payload, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!raw.subarray(0, 4).equals(MAGIC)) return { ok: false, reason: "malformed" };
  const version = raw.readUInt8(4);
  if (version !== CUIS_VERSION) return { ok: false, reason: "unsupported_version" };
  const type = CODE_TYPE[raw.readUInt8(5)];
  if (!type || (expectedType && type !== expectedType)) return { ok: false, reason: "invalid_type" };
  const claimsLength = type === "batch" ? BATCH_CLAIMS_BYTES : CHILD_CLAIMS_BYTES;
  if (raw.length !== claimsLength + CUIS_TAG_BYTES) return { ok: false, reason: "malformed" };

  const canonical = raw.subarray(0, claimsLength);
  const authTag = Buffer.from(raw.subarray(claimsLength));
  const keyVersion = canonical.readUInt16BE(6);
  const verification = kms.verifyCuisTag(type, keyVersion, canonical, authTag);
  if (verification !== "valid") return { ok: false, reason: verification };
  let offset = 40;
  const batchId = type === "batch" ? undefined : uuidString(Buffer.from(canonical.subarray(offset, (offset += 16))));
  const claims: CuisClaims = {
    version,
    type,
    keyVersion,
    manufacturerId: uuidString(Buffer.from(canonical.subarray(8, 24))),
    productId: uuidString(Buffer.from(canonical.subarray(24, 40))),
    batchId,
    randomIdentity: Buffer.from(canonical.subarray(offset, offset + 16)),
  };
  return { ok: true, claims, authTag };
}
