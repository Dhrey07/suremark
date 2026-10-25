import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { UNIT_STATES } from "@/components/status";
import { Badge, buttonClass, Card, CardHeader, cx, Field, inputClass, Notice, PageHeader, Table, Td } from "@/components/ui";
import { can } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { getPrintJob } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { finishPrintJobAction, rejectLabelAction, runLineAction, startPrintJobAction } from "../../actions";

const CELL: Record<string, string> = {
  RESERVED: "bg-slate-200",
  PRINTED_PENDING: "bg-sky-500",
  QA_PENDING: "bg-violet-500",
  ACTIVE: "bg-emerald-500",
  REJECTED: "bg-amber-500",
  VOIDED: "bg-amber-300",
  RECALLED: "bg-red-500",
};

export default async function PrintJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  let d: Awaited<ReturnType<typeof getPrintJob>>;
  try {
    d = await getPrintJob(actor, id);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  const { job, batch, product, line } = d;
  const canRun = can(actor, "print_job:execute", batch);
  const leaseValid = job.leaseExpiresAt && job.leaseExpiresAt > new Date();
  const mine = job.status === "in_progress" && job.leaseHolder === actor.userId && leaseValid;
  const reserved = d.counts.RESERVED ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/app/line">Line jobs</Link>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Print job · <span className="font-mono">{batch.lot}</span>
            <Badge tone={job.status === "completed" ? "neutral" : job.status === "in_progress" ? "blue" : "amber"}>
              {job.status === "in_progress" ? "In progress" : job.status === "ready" ? "Ready" : "Completed"}
            </Badge>
          </span>
        }
        description={`${product.name} ${product.strength} · ${line.name} · ${job.quantity.toLocaleString()} labels · signing key v${job.keyVersion}`}
        action={<Link href={`/app/batches/${batch.id}`} className={buttonClass("secondary", "sm")}>View batch</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          {job.status === "completed" ? (
            <Notice tone="green" title="Run finished">
              Completed {formatDateTime(job.completedAt)}. Unused identities were voided. Reconciliation and QA release happen on the batch page.
            </Notice>
          ) : !canRun ? (
            <Notice>Only operators assigned to {line.name} can run this job.</Notice>
          ) : !mine ? (
            <Card className="p-5">
              {job.leaseHolder && leaseValid && job.leaseHolder !== actor.userId ? (
                <Notice tone="amber">{d.leaseHolderName} currently holds this job. Leases prevent two stations printing the same labels.</Notice>
              ) : (
                <ActionForm action={startPrintJobAction} className="space-y-3">
                  <input type="hidden" name="jobId" value={job.id} />
                  <p className="text-sm text-slate-700">
                    Starting the job gives you an 8-hour lease. Only the lease holder can retrieve label data and report outcomes.
                  </p>
                  <SubmitButton>Start job</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader title="1. Print labels" description="Decrypts this job's label data for your station. Every retrieval is audited." />
                <div className="p-5">
                  <Link href={`/app/print-jobs/${job.id}/labels`} target="_blank" className={buttonClass("secondary")}>
                    Open print sheet ↗
                  </Link>
                </div>
              </Card>
              <Card>
                <CardHeader
                  title="2. Run the line (simulated printer + inline camera)"
                  description="The camera reads every label: it decodes the QR, verifies its Ed25519 signature and checks the code's check digit. Unreadable labels are rejected and their identities retired."
                />
                <ActionForm action={runLineAction} className="grid gap-4 p-5 sm:grid-cols-2">
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="runId" value={randomUUID()} />
                  <Field label="Labels smudged during printing" hint="Will fail the camera read.">
                    <input name="smudged" type="number" min={0} max={reserved} defaultValue={Math.min(2, reserved)} className={inputClass} />
                  </Field>
                  <Field label="Labels left on the roll" hint="Not printed; voided when you finish.">
                    <input name="holdBack" type="number" min={0} max={reserved} defaultValue={0} className={inputClass} />
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton disabled={reserved === 0} pendingText="Printing and inspecting…">
                      Run line on {reserved.toLocaleString()} remaining labels
                    </SubmitButton>
                  </div>
                </ActionForm>
              </Card>
              <Card>
                <CardHeader title="3. Report a damaged label" description="For a label torn or spoiled after printing. Its identity is retired permanently." />
                <ActionForm action={rejectLabelAction} className="grid gap-4 p-5 sm:grid-cols-[8rem_1fr_auto] sm:items-end" resetOnSuccess>
                  <input type="hidden" name="jobId" value={job.id} />
                  <Field label="Label #">
                    <input name="labelIndex" type="number" min={1} max={job.quantity} required className={inputClass} />
                  </Field>
                  <Field label="Reason">
                    <input name="reason" required className={inputClass} defaultValue="Torn during packing" />
                  </Field>
                  <SubmitButton variant="secondary">Reject label</SubmitButton>
                </ActionForm>
              </Card>
              <Card>
                <CardHeader title="4. Finish the run" description="Any label not yet reported is returned as unused and its identity is voided." />
                <ActionForm action={finishPrintJobAction} className="p-5">
                  <input type="hidden" name="jobId" value={job.id} />
                  <SubmitButton variant="secondary">Finish run</SubmitButton>
                </ActionForm>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Label outcomes" />
            <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
              {UNIT_STATES.filter((s) => d.counts[s.key]).map((s) => (
                <div key={s.key} className="bg-white px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cx("size-2.5 rounded-sm", CELL[s.key])} aria-hidden />
                    <span className="text-sm font-medium text-slate-700">{s.label}</span>
                  </div>
                  <div className="tabular mt-1 text-xl font-semibold text-slate-900">{d.counts[s.key].toLocaleString()}</div>
                </div>
              ))}
            </div>
            {d.units.length <= 2500 && (
              <div className="border-t border-slate-100 p-5">
                <div className="flex flex-wrap gap-[3px]" aria-label="Label states by position">
                  {d.units.map((u) => (
                    <span key={u.labelIndex} title={`#${u.labelIndex} · ${u.state}`} className={cx("size-2.5 rounded-[2px]", CELL[u.state])} />
                  ))}
                </div>
              </div>
            )}
          </Card>
          {d.events.length > 0 && (
            <Card>
              <CardHeader title="Production events" description="Idempotent, append-only" />
              <Table head={["Outcome", "Reason", "Labels"]}>
                {d.events.map((e, i) => (
                  <tr key={i}>
                    <Td className="capitalize">{e.type}</Td>
                    <Td className="text-slate-600">{e.reason ?? "—"}</Td>
                    <Td className="tabular">{e.n.toLocaleString()}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
