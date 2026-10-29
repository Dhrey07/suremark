import Link from "next/link";
import { BatchStatus } from "@/components/status";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { can } from "@/lib/authz";
import { formatDate } from "@/lib/dates";
import { listBatches } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export default async function BatchesPage() {
  const actor = await requireActor();
  const batches = await listBatches(actor);
  return (
    <>
      <PageHeader
        eyebrow="Production"
        title="Production runs"
        description="Follow each run from setup and code allocation through printing, quality review and release."
        action={can(actor, "batch:create") && <ButtonLink href="/app/batches/new">Start production run</ButtonLink>}
      />
      <Card>
        {batches.length === 0 ? (
          <EmptyState>No production runs in your assigned sites yet.</EmptyState>
        ) : (
          <Table head={["Lot", "Product", "Site / line", "Planned", "Status", "Expiry"]}>
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/app/batches/${b.id}`} className="whitespace-nowrap font-medium text-brand-700">{b.lot}</Link>
                </Td>
                <Td>
                  {b.productName} {b.productStrength}
                </Td>
                <Td className="text-slate-600">
                  {b.factoryName} · {b.lineName}
                </Td>
                <Td className="tabular">{b.plannedQuantity.toLocaleString()}</Td>
                <Td><BatchStatus status={b.status} /></Td>
                <Td className="tabular whitespace-nowrap">{formatDate(b.expiryDate)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
