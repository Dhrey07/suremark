import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td } from "@/components/ui";
import { getDb } from "@/db";
import { can } from "@/lib/authz";
import { verifyAuditChain } from "@/lib/audit";
import { formatDateTime } from "@/lib/dates";
import { auditTrail } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export default async function AuditPage() {
  const actor = await requireActor();
  if (!can(actor, "audit:read")) return <Notice tone="amber">Your role cannot read the audit log.</Notice>;
  const [rows, chain] = await Promise.all([auditTrail(actor), verifyAuditChain(getDb())]);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every allow and deny decision, approval, print event and release. Entries are append-only and hash-chained, so any edit breaks the chain."
      />
      <div className="mb-6">
        {chain.ok ? (
          <Notice tone="green" title="Hash chain intact">
            All {chain.checked.toLocaleString()} platform audit entries verified. Chain head <span className="font-mono">{chain.head.slice(0, 16)}…</span>
          </Notice>
        ) : (
          <Notice tone="red" title="Hash chain broken">Tampering detected at entry #{chain.brokenAtSeq}.</Notice>
        )}
      </div>
      <Card>
        <CardHeader title="Your organisation's entries" description={`Latest ${rows.length}`} />
        <Table head={["#", "When", "Who", "Action", "Decision", "Detail"]}>
          {rows.map(({ e, actorName }) => (
            <tr key={e.seq}>
              <Td className="tabular text-slate-500">{e.seq}</Td>
              <Td className="whitespace-nowrap text-slate-600">{formatDateTime(e.occurredAt)}</Td>
              <Td>{actorName ?? e.actorType}</Td>
              <Td className="font-mono text-xs">{e.action}</Td>
              <Td>
                <Badge tone={e.decision === "allow" ? "green" : "red"}>{e.decision}</Badge>
              </Td>
              <Td className="max-w-sm truncate font-mono text-xs text-slate-500">{JSON.stringify(e.detail)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
