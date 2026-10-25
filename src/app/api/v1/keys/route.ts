import { NextResponse } from "next/server";
import { kms } from "@/lib/kms";

export const dynamic = "force-dynamic";

/** Public Ed25519 keys (JWK) so third parties, e.g. the regulator, can verify QR credentials offline. */
export function GET() {
  return NextResponse.json(
    {
      keys: kms.publicKeys(),
      credentialFormat: {
        version: 1,
        encoding: "base64url, 94 bytes",
        layout: "ver(1) keyVersion(1) issuer(u32) product(u32) batch(u32) unitRandom(16) | Ed25519 signature(64)",
        signedMessage: '"UPA-QR-CREDENTIAL-v1\\0" || first 30 bytes',
      },
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
