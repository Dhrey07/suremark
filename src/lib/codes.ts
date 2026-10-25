import { randomInt } from "node:crypto";

/**
 * Consumer numeric reference: 15 uniformly random digits + 1 Damm check digit, in one national
 * namespace. The check digit catches every single-digit typo and every adjacent transposition, so
 * typos are caught before any lookup. It is public and provides no security.
 */
export const CODE_NAMESPACE = "NG";
export const CODE_PAYLOAD_DIGITS = 15;
export const CODE_LENGTH = CODE_PAYLOAD_DIGITS + 1;

const DAMM = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];

function dammInterim(digits: string): number {
  let interim = 0;
  for (const ch of digits) interim = DAMM[interim][ch.charCodeAt(0) - 48];
  return interim;
}

export function dammCheckDigit(digits: string): string {
  return String(dammInterim(digits));
}

export function generateCode(): string {
  let payload = "";
  for (let i = 0; i < CODE_PAYLOAD_DIGITS; i++) payload += String(randomInt(0, 10));
  return payload + dammCheckDigit(payload);
}

/** Strips spaces, dashes and dots. Returns null if anything other than digits remains. */
export function normalizeCode(input: string): string | null {
  const stripped = input.replace(/[\s\-.]/g, "");
  return /^[0-9]+$/.test(stripped) ? stripped : null;
}

export type CodeCheck = { ok: true; code: string } | { ok: false; reason: "format" | "length" | "checksum" };

export function checkCode(input: string): CodeCheck {
  const code = normalizeCode(input);
  if (code === null) return { ok: false, reason: "format" };
  if (code.length !== CODE_LENGTH) return { ok: false, reason: "length" };
  if (dammInterim(code) !== 0) return { ok: false, reason: "checksum" };
  return { ok: true, code };
}

export function formatCode(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, "$1 ");
}
