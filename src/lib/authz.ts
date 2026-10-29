import { recordDenial } from "./audit";
import { forbidden } from "./errors";

export const PERMISSIONS = [
  "batch:view",
  "batch:create",
  "identity:allocate:request",
  "identity:allocate:approve",
  "print_job:execute",
  "print_job:export",
  "unit:report_printed",
  "unit:report_rejected",
  "batch:reconcile",
  "batch:release",
  "recall:initiate",
  "recall:approve",
  "catalog:manage",
  "risk:manage",
  "audit:read",
  "team:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PLATFORM_PERMISSIONS = ["manufacturers:review", "manufacturers:govern", "products:review", "demo:reset", "regulator:read"] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

type RoleTemplate = { label: string; scope: string; permissions: Permission[] };

/** Role templates. Effective access = template permissions ∩ membership resource grants ∩ workflow rules. */
export const ROLES: Record<string, RoleTemplate> = {
  owner: {
    label: "Organization Owner",
    scope: "Organization",
    permissions: ["batch:view", "batch:create", "identity:allocate:request", "identity:allocate:approve", "print_job:export", "recall:approve", "risk:manage", "audit:read", "team:view", "catalog:manage"],
  },
  admin: {
    label: "Organization Admin",
    scope: "Organization",
    permissions: ["batch:view", "catalog:manage", "team:view"],
  },
  factory_manager: {
    label: "Factory Manager",
    scope: "Assigned factories",
    permissions: ["batch:view", "batch:create", "identity:allocate:approve"],
  },
  production_manager: {
    label: "Production Manager",
    scope: "Assigned factories/lines",
    permissions: ["batch:view", "batch:create", "identity:allocate:request", "print_job:export", "batch:reconcile"],
  },
  line_operator: {
    label: "Line Operator",
    scope: "Assigned lines",
    permissions: ["batch:view", "print_job:execute", "print_job:export", "unit:report_printed", "unit:report_rejected"],
  },
  qa_officer: {
    label: "Quality Assurance Officer",
    scope: "Assigned factories",
    permissions: ["batch:view", "print_job:export", "unit:report_rejected", "batch:reconcile", "batch:release"],
  },
  compliance_officer: {
    label: "Compliance Officer",
    scope: "Organization",
    permissions: ["batch:view", "recall:initiate", "risk:manage", "audit:read"],
  },
  auditor: {
    label: "Auditor",
    scope: "Explicitly granted",
    permissions: ["batch:view", "audit:read", "team:view"],
  },
};

export const PLATFORM_ROLES: Record<string, { label: string; permissions: PlatformPermission[] }> = {
  platform_admin: { label: "Platform Administrator", permissions: ["manufacturers:review", "manufacturers:govern", "products:review", "demo:reset"] },
  regulator_analyst: { label: "Regulator Analyst", permissions: ["regulator:read"] },
};

export type Grant = { type: "organization" | "factory" | "line"; id: string };

export type Membership = {
  id: string;
  manufacturerId: string;
  manufacturerName: string;
  manufacturerAlias: string;
  roles: string[];
  grants: Grant[];
};

export type Actor = {
  userId: string;
  name: string;
  email: string;
  title: string | null;
  domain: "platform" | "regulator" | "manufacturer";
  platformRoles: string[];
  membership: Membership | null;
};

export type Scope = { manufacturerId: string; factoryId?: string | null; lineId?: string | null };

export function memberPermissions(m: Membership | null): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of m?.roles ?? []) for (const p of ROLES[role]?.permissions ?? []) set.add(p);
  return set;
}

export function covers(m: Membership, scope: Scope): boolean {
  if (m.manufacturerId !== scope.manufacturerId) return false;
  return m.grants.some(
    (g) =>
      (g.type === "organization" && g.id === scope.manufacturerId) ||
      (g.type === "factory" && !!scope.factoryId && g.id === scope.factoryId) ||
      (g.type === "line" && !!scope.lineId && g.id === scope.lineId),
  );
}

/** Synchronous check for UI composition. Server mutations must call `authorize`. */
export function can(actor: Actor | null, permission: Permission, scope?: Scope): boolean {
  const m = actor?.membership;
  if (!m || !memberPermissions(m).has(permission)) return false;
  return scope ? covers(m, scope) : true;
}

export function canPlatform(actor: Actor | null, permission: PlatformPermission): boolean {
  if (!actor) return false;
  return actor.platformRoles.some((r) => PLATFORM_ROLES[r]?.permissions.includes(permission));
}

/** Server-side authorization: permission + tenant + resource scope. Denials are audited. */
export async function authorize(actor: Actor, permission: Permission, scope: Scope, resource?: { type: string; id: string }) {
  if (can(actor, permission, scope)) return;
  await recordDenial({
    manufacturerId: scope.manufacturerId,
    actorType: "user",
    actorId: actor.userId,
    action: permission,
    resourceType: resource?.type ?? null,
    resourceId: resource?.id ?? null,
    detail: { reason: actor.membership?.manufacturerId === scope.manufacturerId ? "missing_permission_or_scope" : "tenant_mismatch" },
  });
  throw forbidden();
}

export async function authorizePlatform(actor: Actor, permission: PlatformPermission) {
  if (canPlatform(actor, permission)) return;
  await recordDenial({ actorType: "user", actorId: actor.userId, action: permission });
  throw forbidden();
}

/** Maker-checker: compares immutable user ids, never role names. */
export async function requireIndependent(
  actor: Actor,
  action: string,
  scope: Scope,
  conflicting: { userId: string | null | undefined; why: string }[],
  resource?: { type: string; id: string },
) {
  const hit = conflicting.find((c) => c.userId && c.userId === actor.userId);
  if (!hit) return;
  await recordDenial({
    manufacturerId: scope.manufacturerId,
    actorType: "user",
    actorId: actor.userId,
    action,
    resourceType: resource?.type ?? null,
    resourceId: resource?.id ?? null,
    detail: { reason: "separation_of_duties", conflict: hit.why },
  });
  throw forbidden(`Independent approver required: you ${hit.why}.`);
}
