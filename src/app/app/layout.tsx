import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import type { NavItem } from "@/components/nav";
import { Shell } from "@/components/shell";
import { can, ROLES } from "@/lib/authz";
import { pendingApprovals } from "@/lib/queries";
import { unreadNotificationCount } from "@/lib/notifications";
import { requireActor } from "@/lib/session";
import { signOutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("/manufacturer/login");
  if (actor.domain === "platform") redirect("/platform");
  if (actor.domain === "regulator") redirect("/regulator");
  if (!actor.membership) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-16">
        <Logo />
        <h1 className="text-xl font-semibold text-slate-900">Your organisation is awaiting onboarding review</h1>
        <p className="text-sm text-slate-600">
          The platform verifies each manufacturer&apos;s legal identity and authorised representatives before any access is granted. You will be able to
          register products and request identities once the review is approved.
        </p>
        <form action={signOutAction}>
          <button className="text-sm font-medium text-brand-700 underline underline-offset-4">Sign out</button>
        </form>
      </div>
    );
  }

  const [approvals, unreadNotifications] = await Promise.all([pendingApprovals(actor), unreadNotificationCount(actor)]);
  const items: NavItem[] = [{ href: "/app", label: "Home", section: "Workspace" }];
  if (approvals.length || can(actor, "identity:allocate:approve") || can(actor, "recall:approve")) {
    items.push({ href: "/app/approvals", label: "Approvals", badge: approvals.length, section: "Workspace" });
  }
  items.push({ href: "/app/products", label: "Products", section: "Production" });
  if (can(actor, "batch:view")) items.push({ href: "/app/batches", label: "Production runs", section: "Production" });
  if (can(actor, "print_job:execute")) items.push({ href: "/app/line", label: "Print jobs", section: "Production" });
  if (can(actor, "risk:manage")) items.push({ href: "/app/risk", label: "Security alerts", section: "Trust" });
  if (can(actor, "batch:view")) items.push({ href: "/app/recalls", label: "Recalls", section: "Trust" });
  items.push({ href: "/app/notifications", label: "Notifications", badge: unreadNotifications, section: "Organization" });
  if (can(actor, "team:view")) items.push({ href: "/app/team", label: "Team & roles", section: "Organization" });
  if (can(actor, "audit:read")) items.push({ href: "/app/audit", label: "Audit trail", section: "Organization" });

  const roleLabel = actor.membership.roles.map((r) => ROLES[r]?.label ?? r).join(", ");
  return (
    <Shell actor={{ ...actor, title: `${actor.title ?? ""}${actor.title ? " · " : ""}${roleLabel}` }} items={items} context={actor.membership.manufacturerName}>
      {children}
    </Shell>
  );
}
