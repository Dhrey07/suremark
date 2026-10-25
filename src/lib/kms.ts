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

  /** Keyed, deterministic digest (HMAC-SHA-256) for lookups and pseudonymous identifiers. */
  mac(purpose: "code-lookup" | "device" | "phone" | "ip" | "ussd-aggregator", data: string | Buffer): Buffer {
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
