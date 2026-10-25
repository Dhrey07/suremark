import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { tenantRecalls } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export default async function RecallsPage() {
  const actor = await requireActor();
  const recalls = await tenantRecalls(actor);
  return (
    <>
      <PageHeader title="Recalls" description="Proposed by compliance, activated only after a second authorised approval. Active recalls reach every channel at once." />
      <Card>
        {recalls.length === 0 ? (
          <EmptyState>No recalls.</EmptyState>
        ) : (
          <Table head={["Batch", "Product", "Reason", "Consumer advice", "Status", "Effective"]}>
            {recalls.map(({ r, lot, product, strength }) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/app/batches/${r.batchId}`} className="whitespace-nowrap font-mono font-medium text-brand-700">{lot}</Link>
                </Td>
                <Td>{product} {strength}</Td>
                <Td className="max-w-xs text-slate-700">{r.reason}</Td>
                <Td className="max-w-xs text-slate-700">{r.consumerAdvice}</Td>
                <Td>
                  <Badge tone={r.status === "active" ? "red" : r.status === "pending_approval" ? "amber" : "neutral"}>
                    {r.status === "pending_approval" ? "Awaiting approval" : r.status}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">{formatDateTime(r.effectiveAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
