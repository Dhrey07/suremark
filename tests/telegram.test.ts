import { afterEach, describe, expect, it } from "vitest";
import { extractCode, telegramResultText, verifyTelegramSecret } from "@/lib/telegram";
import type { VerifyResult } from "@/lib/verify";

const SECRET = "telegram-test-secret-0123456789abcdef";

afterEach(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

describe("telegram webhook secret", () => {
  it("is disabled until configured and then requires an exact match", () => {
    expect(verifyTelegramSecret(SECRET)).toBe("disabled");
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    expect(verifyTelegramSecret(SECRET)).toBe("valid");
    expect(verifyTelegramSecret(null)).toBe("invalid");
    expect(verifyTelegramSecret(`${SECRET}x`)).toBe("invalid");
  });

  it("rejects a weak configured secret", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "short";
    expect(() => verifyTelegramSecret("short")).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });
});

describe("telegram code extraction", () => {
  it("finds the code in free text with common separators", () => {
    expect(extractCode("4827391605732218")).toBe("4827391605732218");
    expect(extractCode("my code is 4827 3916-0573.2218 thanks")).toBe("4827 3916-0573.2218");
    expect(extractCode("pack 2 says 4827 3916 0573 2218")).toBe("4827 3916 0573 2218");
    expect(extractCode("no digits here")).toBeNull();
  });
});

describe("telegram result text", () => {
  const base: VerifyResult = {
    status: "issued_no_known_alerts",
    assurance: "identity_only",
    headline: "Code authenticated",
    message: "Registered & released.",
    checkedAt: new Date().toISOString(),
    product: {
      name: "Orange <Soda>",
      strength: "50cl",
      dosageForm: "Bottle",
      packSize: "1",
      nafdacRegNo: "SIM-1",
      alias: "FT01",
      regulatorySimulated: true,
      regulatorySource: "Dev registry",
    },
    manufacturer: { name: "Acme Ltd", alias: "ACM" },
    batch: { lot: "LOT-1", manufactureDate: "2026-10-01", expiryDate: "2027-10-01" },
    history: { previousChecks: 0, firstCheckedAt: null, firstRegion: null },
  };

  it("escapes HTML and labels simulated regulatory matches", () => {
    const text = telegramResultText(base, "https://example.test");
    expect(text).toContain("Orange &lt;Soda&gt;");
    expect(text).toContain("Registered &amp; released.");
    expect(text).toContain("LOT-1");
    expect(text).toContain("not an authoritative NAFDAC verification");
    expect(text).toContain("first time this code has been checked");
    expect(text).not.toContain("/report");
  });

  it("links to reporting for warnings and shows recall advice", () => {
    const text = telegramResultText(
      { ...base, status: "recalled", recall: { reason: "Contamination found", advice: "Return it", effectiveAt: new Date().toISOString(), source: "x" } },
      "https://example.test",
    );
    expect(text).toContain("Return it");
    expect(text).toContain('href="https://example.test/report"');
  });
});
