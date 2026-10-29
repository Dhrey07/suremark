import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const env = {
  get masterSecret(): Buffer {
    const raw = required("MASTER_SECRET");
    const buf = /^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length < 32) throw new Error("MASTER_SECRET must be at least 32 bytes");
    return buf;
  },
  get signingKeyVersion(): number {
    const v = Number(process.env.SIGNING_KEY_VERSION ?? "1");
    if (!Number.isInteger(v) || v < 1 || v > 255) throw new Error("SIGNING_KEY_VERSION must be 1-255");
    return v;
  },
  get cuisKeyProvider(): "development" | "managed" {
    const provider = process.env.CUIS_KEY_PROVIDER ?? "development";
    if (provider !== "development" && provider !== "managed") throw new Error("CUIS_KEY_PROVIDER must be development or managed");
    if (process.env.NODE_ENV === "production" && provider === "development") {
      throw new Error("The CUIS development key provider is disabled in production");
    }
    return provider;
  },
  // Key versions that must no longer verify (comma separated), e.g. after a compromise.
  get revokedKeyVersions(): Set<number> {
    return new Set(
      (process.env.REVOKED_KEY_VERSIONS ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    );
  },
  get demoMode(): boolean {
    return process.env.DEMO_MODE === "true";
  },
  get demoPassword(): string {
    return process.env.DEMO_PASSWORD ?? "pitch-demo-2026";
  },
};
