import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { BatchStatus } from "@/components/status";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/authz";
import { DomainError } from "@/lib/errors";
import { getBatchGroup } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { requestAllocationAction } from "../../../actions";

export default async function BatchGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  let group: Awaited<ReturnType<typeof getBatchGroup>>;
  try { group = await getBatchGroup(actor, id); } catch (error) { if (error instanceof DomainError) notFound(); throw error; }
  const first = group.rows[0];
  const totalPlanned = group.rows.reduce((n, r) => n + r.batch.plannedQuantity, 0);
  const totalCartons = group.rows.reduce((n, r) => n + (r.batch.cartonCount ?? 0), 0);
  const issued = Object.values(group.unitCounts).reduce((a, b) => a + b, 0);
  const createdCartons = Object.values(group.cartonCounts).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader eyebrow={<Link href="/app/batches">Production runs</Link>} title="Multi-batch production plan" description={`${first.product.brand} ${first.product.variant || first.product.name} · ${first.factory.name} · ${first.line.name}`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[['Batches', group.rows.length], ['Planned cartons', totalCartons], ['Carton identities', createdCartons], ['Unit identities', issued || `0 / ${totalPlanned}`]].map(([label, value]) => <Card key={String(label)} className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold tabular text-slate-950">{typeof value === 'number' ? value.toLocaleString() : value}</div></Card>)}
      </div>
      <Notice tone="blue" title="Controlled issuance">
        Carton and unit identities are generated only after an independent factory manager approves each request. Carton codes are distinct from consumer unit codes.
      </Notice>
      <div className="mt-6 space-y-4">
        {group.rows.map(({ batch, product }) => (
          <Card key={batch.id}>
            <CardHeader title={<span className="flex flex-wrap items-center gap-3"><Link href={`/app/batches/${batch.id}`} className="font-mono text-brand-700">{batch.lot}</Link><BatchStatus status={batch.status} /></span>} description={`${batch.cartonCount ?? 0} cartons × ${batch.unitsPerCarton ?? 0} units = ${batch.plannedQuantity.toLocaleString()} units`} />
            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 p-5">
              <div className="text-sm text-slate-600"><span className="font-medium text-slate-900">{product.alias}</span> · {group.cartonCounts[batch.id] ?? 0} carton identities · {group.unitCounts[batch.id] ?? 0} unit identities</div>
              {batch.status === "draft" && can(actor, "identity:allocate:request", batch) ? (
                <ActionForm action={requestAllocationAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="quantity" value={batch.plannedQuantity} />
                  <input type="hidden" name="reason" value="Approved production plan; exact carton quantity requested." />
                  <SubmitButton size="sm">Request {batch.plannedQuantity.toLocaleString()} identities</SubmitButton>
                </ActionForm>
              ) : <Link href={`/app/batches/${batch.id}`} className="text-sm font-semibold text-brand-700">Open batch →</Link>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
