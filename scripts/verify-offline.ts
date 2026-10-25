/**
 * Independent verification using only published public keys — no database, no platform trust.
 *   npx tsx scripts/verify-offline.ts <qr-url-or-payload> [https://host/api/v1/keys]
 */
import { createPublicKey, verify } from "node:crypto";

const DOMAIN = Buffer.from("UPA-QR-CREDENTIAL-v1\0");

async function main() {
  const [input, keysUrl] = process.argv.slice(2);
  if (!input) throw new Error("usage: verify-offline <qr-url-or-payload> [keys-url]");
  const payload = input.includes("/v/") ? input.split("/v/")[1] : input;
  const source = keysUrl ?? (input.startsWith("http") ? new URL("/api/v1/keys", input).toString() : null);
  if (!source) throw new Error("Provide the keys URL when passing a bare payload");
  const { keys } = (await (await fetch(source)).json()) as { keys: { kid: string; x: string; status: string }[] };

  const buf = Buffer.from(payload, "base64url");
  if (buf.length !== 94 || buf[0] !== 1) throw new Error("Not a v1 credential");
  const claims = buf.subarray(0, 30);
  const key = keys.find((k) => k.kid === String(buf[1]));
  if (!key) throw new Error(`Unknown key version ${buf[1]}`);
  const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" });
  const ok = key.status !== "revoked" && verify(null, Buffer.concat([DOMAIN, claims]), publicKey, buf.subarray(30));
  console.log({
    signatureValid: ok,
    keyVersion: buf[1],
    keyStatus: key.status,
    issuerId: claims.readUInt32BE(2),
    productId: claims.readUInt32BE(6),
    batchId: claims.readUInt32BE(10),
    unit: claims.subarray(14, 30).toString("hex"),
  });
  console.log(ok ? "Issued by the platform. (Lifecycle, recall and copy checks still need the online service.)" : "NOT a valid platform credential.");
  process.exitCode = ok ? 0 : 2;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
