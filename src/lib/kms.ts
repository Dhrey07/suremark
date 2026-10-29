import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";
import { env } from "./env";

/**
 * Simulated key-management service.
 *
 * Every key is derived from MASTER_SECRET with HKDF and never leaves this module: callers get
 * sign/verify/mac/encrypt operations, not key material. In production this module is replaced by
 * a managed KMS/HSM client with the same operations.
 */

const SALT = Buffer.from("upa-kms-v1");
const derived = new Map<string, Buffer>();

function deriveKey(label: string): Buffer {
  let key = derived.get(label);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", env.masterSecret, SALT, Buffer.from(label), 32));
    derived.set(label, key);
  }
  return key;
}

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const signingKeys = new Map<number, { privateKey: KeyObject; publicKey: KeyObject }>();

export type CuisCredentialType = "batch" | "carton" | "unit";

function decodeManagedKey(version: number): Buffer {
  const raw = process.env[`CUIS_KEY_V${version}`];
  if (!raw) throw new Error(`CUIS_KEY_V${version} is not configured for the managed key provider`);
  const key = /^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length < 32) throw new Error(`CUIS_KEY_V${version} must contain at least 32 bytes`);
  return key;
}

function cuisKey(type: CuisCredentialType, version: number): Buffer {
  if (env.cuisKeyProvider === "managed") {
    return Buffer.from(hkdfSync("sha256", decodeManagedKey(version), SALT, Buffer.from(`cuis-v1:${type}`), 32));
  }
  return deriveKey(`cuis-v1:${type}:${version}`);
}

function signingKey(version: number) {
  let pair = signingKeys.get(version);
  if (!pair) {
    const seed = deriveKey(`ed25519-signing:${version}`);
    const privateKey = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: "der",
      type: "pkcs8",
    });
    pair = { privateKey, publicKey: createPublicKey(privateKey) };
    signingKeys.set(version, pair);
  }
  return pair;
}

export const kms = {
  activeSigningKeyVersion(): number {
    return env.signingKeyVersion;
  },

  sign(keyVersion: number, message: Buffer): Buffer {
    if (keyVersion !== env.signingKeyVersion) throw new Error("Only the active key may sign");
    return sign(null, message, signingKey(keyVersion).privateKey);
  },

  /** Returns false for revoked or never-activated key versions. */
  verify(keyVersion: number, message: Buffer, signature: Buffer): boolean {
    if (keyVersion < 1 || keyVersion > env.signingKeyVersion) return false;
    if (env.revokedKeyVersions.has(keyVersion)) return false;
    if (signature.length !== 64) return false;
    return verify(null, message, signingKey(keyVersion).publicKey, signature);
  },

  /** Public keys for independent (offline) verification, e.g. by the regulator. */
  publicKeys() {
    const keys = [];
    for (let v = 1; v <= env.signingKeyVersion; v++) {
      const jwk = signingKey(v).publicKey.export({ format: "jwk" });
      keys.push({
        kid: String(v),
        kty: "OKP",
        crv: "Ed25519",
        alg: "EdDSA",
        x: jwk.x,
        status: env.revokedKeyVersions.has(v) ? "revoked" : v === env.signingKeyVersion ? "active" : "verify-only",
      });
    }
    return keys;
  },

  cuisProvider(): "development" | "managed" {
    return env.cuisKeyProvider;
  },

  /** Issues a 128-bit CUIS tag with a purpose-separated, versioned HMAC-SHA-256 key. */
  cuisTag(type: CuisCredentialType, keyVersion: number, message: Buffer): Buffer {
    if (keyVersion !== env.signingKeyVersion) throw new Error("Only the active CUIS key version may issue credentials");
    return createHmac("sha256", cuisKey(type, keyVersion)).update(message).digest().subarray(0, 16);
  },

  /** Verifies historical CUIS tags in constant time and rejects unknown or revoked key versions. */
  verifyCuisTag(type: CuisCredentialType, keyVersion: number, message: Buffer, tag: Buffer): "valid" | "unknown_key" | "revoked_key" | "bad_tag" {
    if (keyVersion < 1 || keyVersion > env.signingKeyVersion) return "unknown_key";
    if (env.revokedKeyVersions.has(keyVersion)) return "revoked_key";
    if (tag.length !== 16) return "bad_tag";
    const expected = createHmac("sha256", cuisKey(type, keyVersion)).update(message).digest().subarray(0, 16);
    return timingSafeEqual(expected, tag) ? "valid" : "bad_tag";
  },

  cuisKeyMetadata() {
    const keys = [];
    for (let version = 1; version <= env.signingKeyVersion; version++) {
      keys.push({
        version,
        provider: env.cuisKeyProvider,
        status: env.revokedKeyVersions.has(version) ? "revoked" as const : version === env.signingKeyVersion ? "active" as const : "verify_only" as const,
      });
    }
    return keys;
  },

  /** Keyed, deterministic digest (HMAC-SHA-256) for lookups and pseudonymous identifiers. */
  mac(purpose: "code-lookup" | "device" | "phone" | "ip" | "ussd-aggregator" | "carton-credential", data: string | Buffer): Buffer {
    return createHmac("sha256", deriveKey(`mac:${purpose}`)).update(data).digest();
  },

  /** Shared secret given to the USSD aggregator for request signing. */
  ussdAggregatorSecret(): Buffer {
    return deriveKey("ussd-aggregator-shared-secret");
  },

  encrypt(purpose: "manual-code", plaintext: string, aad: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", deriveKey(`enc:${purpose}`), iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([iv, ct, cipher.getAuthTag()]);
  },

  decrypt(purpose: "manual-code", blob: Buffer, aad: string): string {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(blob.length - 16);
    const ct = blob.subarray(12, blob.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(`enc:${purpose}`), iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  },
};
