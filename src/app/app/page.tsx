import Link from "next/link";
import { BatchStatus } from "@/components/status";
import { Card, CardHeader, EmptyState, PageHeader, Stat, Table, Td } from "@/components/ui";
import { can, ROLES } from "@/lib/authz";
import { formatDate } from "@/lib/dates";
import { listBatches, operatorJobs, pendingApprovals, tenantOverview } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export default async function Overview() {
  const actor = await requireActor();
  const m = actor.membership!;
  const [overview, approvals, batches, jobs] = await Promise.all([tenantOverview(actor), pendingApprovals(actor), listBatches(actor, { limit: 8 }), operatorJobs(actor)]);
  const all = await listBatches(actor);

  const todo: { href: string; text: string }[] = [];
  for (const a of approvals) {
    todo.push({
      href: a.request.action === "recall" ? "/app/approvals" : `/app/batches/${a.batch.id}`,
      text: a.request.action === "recall" ? `Approve recall of ${a.batch.lot}` : `Approve ${Number(a.request.payload.quantity).toLocaleString()} identities for ${a.batch.lot}`,
    });
  }
  for (const j of jobs.filter((j) => j.job.status !== "completed")) todo.push({ href: `/app/print-jobs/${j.job.id}`, text: `Run print job for ${j.batch.lot} on ${j.line.name}` });
  for (const b of all) {
    if (b.status === "draft" && can(actor, "identity:allocate:request")) todo.push({ href: `/app/batches/${b.id}`, text: `Request identities for ${b.lot}` });
    if (b.status === "allocated" && can(actor, "batch:reconcile")) todo.push({ href: `/app/batches/${b.id}`, text: `Reconcile ${b.lot} once printing finishes` });
    if (b.status === "reconciled" && can(actor, "batch:release")) todo.push({ href: `/app/batches/${b.id}`, text: `QA release for ${b.lot}` });
  }

  const checks = Object.values(overview.checks).reduce((a, b) => a + b, 0);
  const alerts = (overview.checks.suspicious ?? 0) + (overview.checks.not_released ?? 0);
  return (
    <>
      <PageHeader
        eyebrow={m.manufacturerName}
        title={`Here’s what needs attention, ${actor.name.split(" ")[0]}.`}
        description={`${m.roles.map((r) => ROLES[r]?.label ?? r).join(", ")} · Your workspace is tailored to your role and assigned sites.`}
      />
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-2xl bg-[#10261e] p-6 text-white shadow-sm">
          <div className="text-sm text-white/60">Products protected in market</div>
          <div className="tabular mt-3 text-4xl font-semibold tracking-[-0.05em]">{(overview.units.ACTIVE ?? 0).toLocaleString()}</div>
          <div className="mt-5 border-t border-white/10 pt-4 text-sm text-white/70"><span className="font-semibold text-[#b8f06a]">{checks.toLocaleString()}</span> consumer checks in 30 days</div>
        </div>
        <Stat label="Checks needing attention" value={alerts.toLocaleString()} hint="Suspicious or checked before release" />
        <Stat label="Open security cases" value={overview.openRisk.toLocaleString()} hint={overview.openRisk ? "Review and assign next steps" : "No unresolved cases"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Needs your action" />
          {todo.length === 0 ? (
            <EmptyState>Nothing waiting for you.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todo.slice(0, 10).map((t, i) => (
                <li key={i}>
                  <Link href={t.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <span className="text-slate-800">{t.text}</span>
                    <span className="text-brand-700" aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {can(actor, "batch:view") && (
          <Card>
            <CardHeader title="Recent batches" action={<Link href="/app/batches" className="text-sm font-medium text-brand-700">All batches</Link>} />
            {batches.length === 0 ? (
              <EmptyState>No batches in your scope yet.</EmptyState>
            ) : (
              <Table head={["Lot", "Product", "Status", "Expiry"]}>
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/app/batches/${b.id}`} className="whitespace-nowrap font-medium text-brand-700">{b.lot}</Link>
                    </Td>
                    <Td>{b.productName} {b.productStrength}</Td>
                    <Td><BatchStatus status={b.status} /></Td>
                    <Td className="tabular whitespace-nowrap">{formatDate(b.expiryDate)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
