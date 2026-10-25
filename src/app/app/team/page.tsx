import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { can, ROLES } from "@/lib/authz";
import { teamMembers } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { Notice } from "@/components/ui";

export default async function TeamPage() {
  const actor = await requireActor();
  if (!can(actor, "team:view")) return <Notice tone="amber">Your role cannot view team access.</Notice>;
  const members = await teamMembers(actor);
  return (
    <>
      <PageHeader
        title="Team & access"
        description="Effective access = role permissions ∩ assigned sites ∩ workflow rules. Roles are templates, not blanket entitlements."
      />
      <Card>
        <Table head={["Person", "Roles", "Scope", "Status"]}>
          {members.map((m) => (
            <tr key={m.membershipId}>
              <Td>
                <div className="font-medium text-slate-900">{m.name}</div>
                <div className="text-xs text-slate-500">{m.title} · {m.email}</div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {m.roles.map((r) => (
                    <Badge key={r} tone="green">{ROLES[r]?.label ?? r}</Badge>
                  ))}
                </div>
              </Td>
              <Td className="text-slate-600">{m.grants.join(", ")}</Td>
              <Td>
                <Badge tone={m.active ? "green" : "neutral"}>{m.active ? "Active" : "Disabled"}</Badge>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card className="mt-6">
        <Table head={["Role template", "Default scope", "Permissions"]}>
          {Object.entries(ROLES).map(([key, r]) => (
            <tr key={key}>
              <Td className="font-medium text-slate-900">{r.label}</Td>
              <Td className="text-slate-600">{r.scope}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {r.permissions.map((p) => (
                    <code key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{p}</code>
                  ))}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
