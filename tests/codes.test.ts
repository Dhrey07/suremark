import { describe, expect, it } from "vitest";
import { checkCode, dammCheckDigit, formatCode, generateCode, CODE_LENGTH } from "@/lib/codes";

describe("numeric reference", () => {
  it("matches the published Damm example", () => {
    expect(dammCheckDigit("572")).toBe("4");
    expect(checkCode("5724").ok).toBe(false); // wrong length for our namespace, but checksum is right
  });

  it("generates 16-digit codes with a valid check digit", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateCode();
      expect(c).toMatch(/^\d{16}$/);
      expect(checkCode(c)).toEqual({ ok: true, code: c });
    }
  });

  it("detects every single-digit error and adjacent transposition", () => {
    for (let n = 0; n < 50; n++) {
      const c = generateCode();
      for (let i = 0; i < CODE_LENGTH; i++) {
        for (let d = 0; d <= 9; d++) {
          if (String(d) === c[i]) continue;
          const typo = c.slice(0, i) + d + c.slice(i + 1);
          expect(checkCode(typo).ok).toBe(false);
        }
        if (i < CODE_LENGTH - 1 && c[i] !== c[i + 1]) {
          const swapped = c.slice(0, i) + c[i + 1] + c[i] + c.slice(i + 2);
          expect(checkCode(swapped).ok).toBe(false);
        }
      }
    }
  });

  it("normalizes grouping and rejects non-digits", () => {
    const c = generateCode();
    expect(checkCode(formatCode(c))).toEqual({ ok: true, code: c });
    expect(checkCode(c.replace(/(\d{4})/g, "$1-"))).toEqual({ ok: true, code: c });
    expect(checkCode("1234 abcd 5678 9012")).toEqual({ ok: false, reason: "format" });
    expect(checkCode("123")).toEqual({ ok: false, reason: "length" });
    expect(formatCode("4827391605732218")).toBe("4827 3916 0573 2218");
  });
});
