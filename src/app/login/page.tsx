import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo, PrototypeNotice } from "@/components/brand";
import { Field, inputClass } from "@/components/ui";
import { getDb, schema } from "@/db";
import { PLATFORM_ROLES, ROLES } from "@/lib/authz";
import { env } from "@/lib/env";
import { signInAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ROLE_ORDER = ["owner", "admin", "factory_manager", "production_manager", "line_operator", "qa_officer", "compliance_officer", "auditor"];

async function demoAccounts() {
  const db = getDb();
  const rows = await db
    .select({
      email: schema.users.email,
      name: schema.users.name,
      title: schema.users.title,
      domain: schema.users.domain,
      org: schema.manufacturers.legalName,
      kyb: schema.manufacturers.kybStatus,
      role: schema.membershipRoles.roleKey,
      platformRole: schema.platformRoles.roleKey,
    })
    .from(schema.users)
    .leftJoin(schema.organizationMemberships, eq(schema.organizationMemberships.userId, schema.users.id))
    .leftJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.organizationMemberships.manufacturerId))
    .leftJoin(schema.membershipRoles, eq(schema.membershipRoles.membershipId, schema.organizationMemberships.id))
    .leftJoin(schema.platformRoles, eq(schema.platformRoles.userId, schema.users.id))
    .orderBy(asc(schema.users.createdAt));
  const groups = new Map<string, { email: string; name: string; title: string | null; role: string }[]>();
  for (const r of rows) {
    const group = r.domain === "platform" ? "Platform operator" : r.domain === "regulator" ? "Regulator (proposed integration)" : `${r.org}${r.kyb === "pending" ? " — awaiting onboarding review" : ""}`;
    const role = r.role ? ROLES[r.role]?.label : r.platformRole ? PLATFORM_ROLES[r.platformRole]?.label : "";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ email: r.email, name: r.name, title: r.title, role: role ?? "", ...(r.role ? { order: ROLE_ORDER.indexOf(r.role) } : {}) });
  }
  return [...groups.entries()];
}

export default async function LoginPage() {
  const accounts = env.demoMode ? await demoAccounts() : [];
  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <Logo subtitle="Manufacturer, platform & regulator access" />
        <ActionForm action={signInAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="username" className={inputClass} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
          <SubmitButton className="w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>
        <PrototypeNotice />
      </div>
      {env.demoMode && (
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Demo accounts</h2>
          <p className="mt-1 text-sm text-slate-600">
            One click signs in as that person. Each account only sees and does what its role and assigned sites allow — the server checks every action.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {accounts.map(([group, people]) => (
              <div key={group} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</div>
                <ul className="mt-2 divide-y divide-slate-100">
                  {people.map((p) => (
                    <li key={p.email}>
                      <ActionForm action={signInAction}>
                        <input type="hidden" name="email" value={p.email} />
                        <input type="hidden" name="password" value={env.demoPassword} />
                        <button type="submit" className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-slate-50">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                            <span className="block truncate text-xs text-slate-500">{p.title}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{p.role}</span>
                        </button>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
