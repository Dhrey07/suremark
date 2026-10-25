export class DomainError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "conflict" | "invalid" | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (message = "Not found") => new DomainError("not_found", message);
export const forbidden = (message = "You are not allowed to do this") => new DomainError("forbidden", message);
export const conflict = (message: string) => new DomainError("conflict", message);
export const invalid = (message: string) => new DomainError("invalid", message);
