import { invalid } from "./errors";

export type RegulatoryValidation = {
  normalized: string | null;
  status:
    | "not_submitted"
    | "pending_verification"
    | "authoritative_verified"
    | "simulated_match"
    | "mismatch"
    | "verification_unavailable"
    | "rejected"
    | "expired_inactive";
  source: string | null;
  verifiedAt: Date | null;
  note: string | null;
  simulated: boolean;
};

export function normalizeNafdacNumber(input: string | undefined) {
  const value = input?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
  if (!value) return null;
  if (value.length < 5 || value.length > 48 || !/^[A-Z0-9\-/ .]+$/.test(value)) {
    throw invalid("Enter a valid registration reference using letters, numbers, spaces, '-' or '/'.");
  }
  return value;
}

/**
 * No authorized NAFDAC API is configured in this deployment. Production submissions are therefore
 * queued for manual review. A single explicitly fictional record supports repeatable development QA.
 */
export function validateNafdacRegistration(input: {
  registrationNumber?: string;
  productFamily: string;
  productName: string;
}): RegulatoryValidation {
  const normalized = normalizeNafdacNumber(input.registrationNumber);
  if (!normalized) return { normalized: null, status: "not_submitted", source: null, verifiedAt: null, note: null, simulated: false };

  if (process.env.NODE_ENV !== "production" && normalized === "SIM-NAFDAC-FANTA-001") {
    const matches = /FANTA/i.test(`${input.productFamily} ${input.productName}`);
    return {
      normalized,
      status: matches ? "simulated_match" : "mismatch",
      source: "Development registry (simulated — not an authoritative NAFDAC source)",
      verifiedAt: new Date(),
      note: matches
        ? "The fictional development record matches the submitted Fanta test product. Manual or authoritative verification is still required before production use."
        : "The fictional development record does not match the submitted product details.",
      simulated: true,
    };
  }

  return {
    normalized,
    status: "verification_unavailable",
    source: "Manual platform review",
    verifiedAt: new Date(),
    note: "No authorized NAFDAC registry integration is configured. The number has not been confirmed as valid.",
    simulated: false,
  };
}
