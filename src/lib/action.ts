import { unstable_rethrow } from "next/navigation";
import { DomainError } from "./errors";

export type ActionState = { ok?: boolean; error?: string; message?: string; data?: unknown };

/** Runs a mutation and maps domain errors to form state. Redirects and other Next signals pass through. */
export async function attempt(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DomainError) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Nothing was changed." };
  }
}

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");
export const int = (fd: FormData, key: string) => Number.parseInt(str(fd, key), 10);
