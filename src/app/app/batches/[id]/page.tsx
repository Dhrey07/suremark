import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { BatchStatus, UNIT_STATES } from "@/components/status";
import { ButtonLink, Card, CardHeader, cx, Field, inputClass, Notice, PageHeader } from "@/components/ui";
import { can, type Actor } from "@/lib/authz";
import { formatDate, formatDateTime } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { stateName } from "@/lib/geo";
import { getBatchDetail, getBatchUnits } from "@/lib/queries";
import { publicBaseUrl } from "@/lib/request-context";
import { requireActor } from "@/lib/session";
import {
  decideAllocationAction,
  decideRecallAction,
  initiateRecallAction,
  reconcileAction,
  releaseAction,
  requestAllocationAction,
} from "../../actions";

type Detail = Awaited<ReturnType<typeof getBatchDetail>>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_LABELS: Record<string, string> = {
  "batch.create": "Batch drafted",
  "identity.allocation.request": "Identities requested",
  "identity.allocation.approve": "Allocation approved — identities issued",
  "identity.allocation.reject": "Allocation rejected",
  "identity:allocate:approve": "Approval refused",
  "print_job.lease": "Print job started",
  "print_job.labels_retrieved": "Label data retrieved",
  "production.events": "Production outcomes reported",
  "production.label_damaged": "Label rejected after printing",
  "print_job.complete": "Print run finished",
  "batch.reconcile": "Reconciled",
  "batch.reconcile.exception": "Reconciliation exception",
  "batch.release": "QA released",
  "batch:release": "Release refused",
  "recall.initiate": "Recall proposed",
  "recall.approve": "Recall approved",
  "recall.reject": "Recall rejected",
};

function describe(detail: Record<string, unknown>) {
  const d = detail as Record<string, string | number | undefined>;
  if (d.reason === "separation_of_duties") return `Separation of duties: actor ${d.conflict}`;
  const parts: string[] = [];
  for (const k of ["quantity", "printed", "rejected", "unused", "voided", "issued", "physicalCount", "activated", "recalledUnits", "count"] as const) {
    if (typeof d[k] === "number") parts.push(`${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${Number(d[k]).toLocaleString()}`);
  }
  if (typeof d.manifestHash === "string") parts.push(`manifest ${d.manifestHash.slice(0, 12)}…`);
  return parts.join(" · ");
}

function Steps({ status, counts }: { status: string; counts: Record<string, number> }) {
  const order = ["draft", "allocation_pending", "allocated", "reconciled", "released"];
  const idx = status === "recalled" ? 4 : order.indexOf(status);
  const printed = (counts.PRINTED_PENDING ?? 0) + (counts.QA_PENDING ?? 0) + (counts.ACTIVE ?? 0) + (counts.RECALLED ?? 0) > 0;
  const steps = [
    { label: "Draft", done: idx >= 1 },
    { label: "Identities issued", done: idx >= 2 },
    { label: "Printed & verified", done: idx >= 3 || (idx === 2 && printed) },
    { label: "Reconciled", done: idx >= 3 },
    { label: status === "recalled" ? "Recalled" : "QA released", done: idx >= 4 },
  ];
  return (
    <ol className="grid grid-cols-5 gap-2">
      {steps.map((s, i) => (
        <li key={s.label} className="min-w-0">
          <div className={cx("h-1.5 rounded-full", s.done ? (status === "recalled" && i === 4 ? "bg-red-500" : "bg-brand-600") : "bg-slate-200")} />
          <div className={cx("mt-1.5 truncate text-xs", s.done ? "font-medium text-slate-800" : "text-slate-500")}>{s.label}</div>
        </li>
      ))}
    </ol>
  );
}

function ActionPanel({ actor, d }: { actor: Actor; d: Detail }) {
  const { batch } = d;
  const pending = d.approvals.find((a) => a.status === "pending" && a.action === "identity_allocation");
  const openRecall = d.recalls.find((r) => r.status === "pending_approval");
  const name = (id: string | null | undefined) => (id ? d.userName[id] ?? "Unknown" : "—");

  if (batch.status === "draft") {
    if (!can(actor, "identity:allocate:request", batch)) return <Notice>Waiting for a production manager to request unit identities.</Notice>;
    const max = batch.plannedQuantity + Math.floor((batch.plannedQuantity * 10) / 100);
    return (
      <ActionForm action={requestAllocationAction} className="space-y-3">
        <input type="hidden" name="batchId" value={batch.id} />
        <Field label="Identities to request" hint={`Up to ${max.toLocaleString()} (planned quantity + 10% spoilage allowance).`}>
          <input name="quantity" type="number" min={1} max={max} defaultValue={batch.plannedQuantity} required className={inputClass} />
        </Field>
        <Field label="Note for the approver (optional)">
          <input name="reason" className={inputClass} placeholder="e.g. Scheduled run, roll of 1,000 labels" />
        </Field>
        <SubmitButton>Request identity allocation</SubmitButton>
      </ActionForm>
    );
  }

  if (batch.status === "allocation_pending" && pending) {
    const quantity = Number(pending.payload.quantity);
    const head = (
      <p className="text-sm text-slate-700">
        <span className="font-medium">{name(pending.requesterId)}</span> requested <span className="font-semibold">{quantity.toLocaleString()}</span>{" "}
        identities on {formatDateTime(pending.createdAt)}.{pending.requestReason ? ` “${pending.requestReason}”` : ""}
      </p>
    );
    if (!can(actor, "identity:allocate:approve", batch)) return <div className="space-y-3">{head}<Notice>Awaiting an independent approver (Factory Manager).</Notice></div>;
    if (pending.requesterId === actor.userId) {
      return (
        <div className="space-y-3">
          {head}
          <Notice tone="amber" title="You cannot approve your own request">Maker-checker: a different authorised person must approve it.</Notice>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {head}
        <ActionForm action={decideAllocationAction} className="space-y-3">
          <input type="hidden" name="requestId" value={pending.id} />
          <Field label="Reason (required to reject)">
            <input name="reason" className={inputClass} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button name="decision" value="approve" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
              Approve and issue identities
            </button>
            <button name="decision" value="reject" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
              Reject
            </button>
          </div>
        </ActionForm>
      </div>
    );
  }

  if (batch.status === "allocated" && d.job) {
    if (d.job.status !== "completed") {
      return (
        <div className="space-y-3">
          <Notice tone="blue" title={d.job.status === "ready" ? "Print job ready" : "Printing in progress"}>
            {d.job.quantity.toLocaleString()} identities are reserved for {d.line.name}. Units stay inactive until the run is reconciled and QA releases
            the batch.
          </Notice>
          {can(actor, "print_job:execute", batch) && <ButtonLink href={`/app/print-jobs/${d.job.id}`}>Open print job</ButtonLink>}
        </div>
      );
    }
    if (!can(actor, "batch:reconcile", batch)) return <Notice>Print run finished. Waiting for reconciliation by production or QA.</Notice>;
    const printed = d.counts.PRINTED_PENDING ?? 0;
    return (
      <ActionForm action={reconcileAction} className="space-y-3">
        <input type="hidden" name="batchId" value={batch.id} />
        <p className="text-sm text-slate-700">
          The line reported <span className="font-semibold">{printed.toLocaleString()}</span> good labels. Enter the physical count of finished units.
          If it does not match, no unit is activated.
        </p>
        <Field label="Physical count of finished units">
          <input name="physicalCount" type="number" min={0} required className={inputClass} />
        </Field>
        <Field label="Note (optional)">
          <input name="note" className={inputClass} placeholder="e.g. Counted from line counter and pallet tally" />
        </Field>
        <SubmitButton>Reconcile batch</SubmitButton>
      </ActionForm>
    );
  }

  if (batch.status === "reconciled") {
    if (!can(actor, "batch:release", batch)) return <Notice>Reconciled. Waiting for QA release.</Notice>;
    const requester = d.approvals.find((a) => a.action === "identity_allocation" && a.status === "approved")?.requesterId;
    const conflict =
      batch.createdBy === actor.userId ? "created this batch" : requester === actor.userId ? "requested its identities" : d.printerIds.includes(actor.userId) ? "reported its production" : null;
    if (conflict) return <Notice tone="amber" title="Independent release required">You {conflict}, so another QA officer must release it.</Notice>;
    return (
      <ActionForm action={releaseAction} className="space-y-3">
        <input type="hidden" name="batchId" value={batch.id} />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="samplesInspected" required className="mt-0.5 size-4 rounded border-slate-300" />
          Physical samples inspected and label data checked against the batch record.
        </label>
        <Field label="QA release note">
          <input name="note" required className={inputClass} placeholder="e.g. Retained samples conform; COA attached" />
        </Field>
        <SubmitButton>Release batch — activate {(d.counts.QA_PENDING ?? 0).toLocaleString()} units</SubmitButton>
      </ActionForm>
    );
  }

  if (batch.status === "released") {
    if (openRecall) {
      if (openRecall.initiatedBy === actor.userId)
        return <Notice tone="amber" title="Recall awaiting a second approver">You proposed it; dual control requires another authorised person.</Notice>;
      if (!can(actor, "recall:approve", batch)) return <Notice tone="amber" title="Recall awaiting approval">Proposed by {name(openRecall.initiatedBy)}.</Notice>;
      return (
        <div className="space-y-3">
          <Notice tone="red" title="Recall proposed">
            {openRecall.reason} — proposed by {name(openRecall.initiatedBy)}. Consumer advice: “{openRecall.consumerAdvice}”
          </Notice>
          <ActionForm action={decideRecallAction} className="space-y-3">
            <input type="hidden" name="recallId" value={openRecall.id} />
            <Field label="Reason (required to reject)">
              <input name="reason" className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="approve" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                Approve recall
              </button>
              <button name="decision" value="reject" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300">
                Reject
              </button>
            </div>
          </ActionForm>
        </div>
      );
    }
    if (!can(actor, "recall:initiate", batch)) return <Notice tone="green" title="Released">Units are active and verifiable on all channels.</Notice>;
    return (
      <ActionForm action={initiateRecallAction} className="space-y-3">
        <input type="hidden" name="batchId" value={batch.id} />
        <Notice tone="green">Released. Units are active and verifiable on all channels.</Notice>
        <Field label="Recall reason">
          <input name="reason" required minLength={10} className={inputClass} placeholder="e.g. Out-of-specification assay result" />
        </Field>
        <Field label="Advice shown to consumers">
          <input name="advice" required minLength={10} className={inputClass} placeholder="e.g. Stop using and return to the pharmacy" />
        </Field>
        <SubmitButton variant="danger">Propose recall</SubmitButton>
      </ActionForm>
    );
  }

  if (batch.status === "recalled") {
    const r = d.recalls.find((x) => x.status === "active");
    return (
      <Notice tone="red" title="Recalled">
        {r ? `${r.reason} Effective ${formatDateTime(r.effectiveAt)}. Consumers see: “${r.consumerAdvice}”` : "This batch is recalled."}
      </Notice>
    );
  }
  return null;
}

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; carton?: string; loose?: string; page?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const actor = await requireActor();
  let d: Detail;
  try {
    d = await getBatchDetail(actor, id);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  const { batch, product } = d;
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  const tab = ["overview", "units", "print", "quality", "activity"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const cartonId = sp.carton && UUID_RE.test(sp.carton) ? sp.carton : undefined;
  const unitPage = tab === "units" ? await getBatchUnits(actor, id, { cartonId, loose: sp.loose === "1", page, pageSize: 24 }) : null;
  const allCodes = tab === "print" && total <= 1000 ? await getBatchUnits(actor, id, { pageSize: 1000 }) : null;
  const baseUrl = tab === "print" ? await publicBaseUrl() : "";
  const createdBy = `${batch.createdByRole} — ${batch.createdByName}`;
  const batchSummary = [
    `Manufacturer: ${d.manufacturer.legalName}`, `Manufacturer Prefix: ${d.manufacturer.alias}`, `Product: ${product.name}`, `Product Code: ${product.alias}`, `Batch: ${batch.lot}`,
    `Cartons: ${batch.cartonCount ?? 0}`, `Units per Carton: ${batch.unitsPerCarton ?? 0}`, `Loose Units: ${batch.looseUnits}`, `Total Units: ${batch.plannedQuantity}`,
    `Manufactured: ${formatDate(batch.manufactureDate)}`, `Expires: ${formatDate(batch.expiryDate)}`, `Factory: ${d.factory.name}`, `Production Line: ${d.line.name}`,
    `Created By: ${createdBy}`, `Created: ${formatDateTime(batch.createdAt)}`,
  ].join("\n");
  const tabs = [{ key: "overview", label: "Overview" }, { key: "units", label: "Cartons & Units" }, { key: "print", label: "Print & Export" }, { key: "quality", label: "Quality Review" }, { key: "activity", label: "Activity History" }];
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/app/batches">Batches</Link>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{batch.lot}</span>
            <BatchStatus status={batch.status} />
          </span>
        }
        description={`${product.name} ${product.variant || product.strength} · ${d.factory.name}, ${d.line.name} · created ${formatDateTime(batch.createdAt)}`}
        action={batch.status === "allocated" && d.job && can(actor, "print_job:execute", batch) ? <ButtonLink href={`/app/print-jobs/${d.job.id}`}>Continue printing</ButtonLink> : <ButtonLink href={`/app/products/${product.id}`} variant="secondary">View product</ButtonLink>}
      />
      <Card className="mb-6 px-5 py-4">
        <Steps status={batch.status} counts={d.counts} />
      </Card>
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-[#e6e2d8] bg-white p-1.5" aria-label="Batch workspace">
        {tabs.map((item) => <Link key={item.key} href={`?tab=${item.key}`} className={cx("whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold", tab === item.key ? "bg-[#10261e] text-white" : "text-slate-600 hover:bg-slate-50")}>{item.label}</Link>)}
      </nav>
      {tab === "overview" && <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Next step" />
            <div className="p-5">
              <ActionPanel actor={actor} d={d} />
            </div>
          </Card>
          {batch.cartonCount && (
            <Card>
              <CardHeader title="Carton hierarchy" description={`${batch.cartonCount} distinct carton identities · ${batch.unitsPerCarton} units expected in each carton`} />
              {d.cartons.length ? (
                <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
                  {d.cartons.map((carton) => (
                    <div key={carton.id} className="bg-white px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3"><span className="font-mono font-semibold text-slate-900">{carton.code}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{carton.status}</span></div>
                      <div className="mt-1 text-xs text-slate-500">Carton {carton.cartonIndex} · {carton.expectedUnits} units · {carton.cuisCredential ? "Registered" : "Pending registration"}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="px-5 py-4 text-sm text-slate-500">Carton identities will be generated together with the approved unit identities.</div>}
            </Card>
          )}
          <Card>
            <CardHeader
              title="Unit identities"
              description={total ? `${total.toLocaleString()} issued · every identity is unique and never reused` : "No identities issued yet"}
            />
            {total > 0 && (
              <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
                {UNIT_STATES.filter((s) => d.counts[s.key]).map((s) => (
                  <div key={s.key} className="bg-white px-5 py-3">
                    <div className="tabular text-xl font-semibold text-slate-900">{d.counts[s.key].toLocaleString()}</div>
                    <div className="text-sm font-medium text-slate-700">{s.label}</div>
                    <div className="text-xs text-slate-500">{s.description}</div>
                  </div>
                ))}
              </div>
            )}
            {d.reconciliation && (
              <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-700">
                Reconciled by {d.userName[d.reconciliation.performedBy]} on {formatDateTime(d.reconciliation.createdAt)}:{" "}
                <span className="tabular font-medium">
                  {d.reconciliation.issued} issued = {d.reconciliation.printed} printed + {d.reconciliation.rejected} rejected + {d.reconciliation.voided}{" "}
                  voided
                </span>
                ; physical count {d.reconciliation.physicalCount}.
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Batch record" />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ["Product", `${product.alias} — ${product.name} ${product.strength}`],
                ["Registration no.", product.nafdacRegNo ?? "—"],
                ["Manufactured", formatDate(batch.manufactureDate)],
                ["Expires", formatDate(batch.expiryDate)],
                ["Planned quantity", batch.plannedQuantity.toLocaleString()],
                ["Packaging", batch.unitsPerCarton ? `${batch.cartonCount ?? 0} cartons × ${batch.unitsPerCarton} units + ${batch.looseUnits} loose` : "Legacy unit plan"],
                ["Site", `${d.factory.name} (${stateName(d.factory.state)})`],
                ["Line", d.line.name],
                ["Created by", createdBy],
                ["Created on", formatDateTime(batch.createdAt)],
                ["Organization", d.manufacturer.legalName],
                ["Last modified by", batch.lastModifiedBy ? d.userName[batch.lastModifiedBy] : batch.createdByName],
                ["Last modified", formatDateTime(batch.updatedAt)],
                ["Released by", batch.releasedBy ? `${d.userName[batch.releasedBy]} · ${formatDateTime(batch.releasedAt)}` : "—"],
                ["Batch identity", batch.cuisCredential ? "Registered" : "Pending registration"],
                ["Manifest hash", d.job && d.job.manifestHash.some((b) => b) ? `${d.job.manifestHash.toString("hex").slice(0, 24)}…` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Activity" description="From the tamper-evident audit log" />
            <ol className="divide-y divide-slate-100">
              {d.activity.map((e) => (
                <li key={e.seq} className="px-5 py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cx("font-medium", e.decision === "deny" ? "text-red-700" : "text-slate-900")}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                    <span className="tabular shrink-0 text-xs text-slate-500">{formatDateTime(e.occurredAt)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {e.actorId ? d.userName[e.actorId] : "System"}
                    {describe(e.detail) && ` · ${describe(e.detail)}`}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>}

      {tab === "units" && <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card>
          <CardHeader title="Cartons" description={`${d.cartons.length} generated · ${batch.looseUnits} loose units`} />
          {d.cartons.length ? <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">{d.cartons.map((carton) => (
            <Link key={carton.id} href={`?tab=units&carton=${carton.id}`} className={cx("block px-5 py-3 hover:bg-[#f8faf5]", cartonId === carton.id && "bg-[#eef7e5]")}>
              <div className="flex items-center justify-between gap-3"><span className="font-mono text-sm font-semibold text-slate-900">{carton.code}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{carton.status}</span></div>
              <div className="mt-1 text-xs text-slate-500">Carton {String(carton.cartonIndex).padStart(3, "0")} · {carton.expectedUnits} units · {carton.cuisCredential ? "Registered" : "Pending registration"}</div>
            </Link>
          ))}</div> : <div className="p-5 text-sm text-slate-500">Carton identities appear after allocation approval.</div>}
          {batch.looseUnits > 0 && <Link href="?tab=units&loose=1" className={cx("block border-t border-slate-100 px-5 py-4 text-sm font-semibold", sp.loose === "1" && "bg-[#eef7e5]")}>Loose units · {batch.looseUnits}</Link>}
        </Card>
        <Card>
          <CardHeader title={cartonId ? d.cartons.find((c) => c.id === cartonId)?.code ?? "Carton units" : sp.loose === "1" ? "Loose units" : "All unit identities"} description={unitPage ? `${unitPage.total.toLocaleString()} units · page ${unitPage.page} of ${Math.max(1, Math.ceil(unitPage.total / unitPage.pageSize))}` : undefined} action={cartonId ? <ButtonLink href={`/api/batches/${id}/export?format=units&cartonIds=${cartonId}`} size="sm" variant="secondary">Print this carton</ButtonLink> : undefined} />
          {unitPage?.rows.length ? <>
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">{unitPage.rows.map((unit) => (
              <Link key={unit.id} href={`/app/units/${unit.id}`} className="bg-white p-4 hover:bg-[#f8faf5]">
                <div className="flex items-center justify-between gap-3"><span className="font-mono text-sm font-bold text-brand-800">Unit {String(unit.labelIndex).padStart(4, "0")}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{unit.state.replaceAll("_", " ")}</span></div>
                <div className="mt-2 font-mono text-sm tracking-wide text-slate-900">{unit.code ? unit.code.replace(/(.{4})/g, "$1 ").trim() : "Restricted"}</div>
                <div className="mt-1 text-xs text-slate-500">{unit.cartonCode ?? "Loose unit"}</div>
              </Link>
            ))}</div>
            <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm"><span>{unitPage.total.toLocaleString()} records</span><div className="flex gap-2">{page > 1 && <Link className="rounded-lg border px-3 py-1.5" href={`?tab=units${cartonId ? `&carton=${cartonId}` : sp.loose === "1" ? "&loose=1" : ""}&page=${page - 1}`}>Previous</Link>}{page * unitPage.pageSize < unitPage.total && <Link className="rounded-lg border px-3 py-1.5" href={`?tab=units${cartonId ? `&carton=${cartonId}` : sp.loose === "1" ? "&loose=1" : ""}&page=${page + 1}`}>Next</Link>}</div></div>
          </> : <div className="p-8 text-center text-sm text-slate-500">No unit identities in this selection yet.</div>}
        </Card>
      </div>}

      {tab === "print" && <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader title="Print-ready output" description="Generated from the exact persisted identity records" />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <ButtonLink href={`/api/batches/${id}/export?format=units`}>Download unit-label PDF</ButtonLink>
            <ButtonLink href={`/api/batches/${id}/export?format=cartons`} variant="secondary">Download carton-label PDF</ButtonLink>
            <ButtonLink href={`/api/batches/${id}/export?format=summary`} variant="secondary">Download batch summary PDF</ButtonLink>
            <ButtonLink href={`/api/batches/${id}/export?format=csv`} variant="secondary">Export CSV</ButtonLink>
            {d.job && can(actor, "print_job:execute", batch) && <ButtonLink href={`/app/print-jobs/${d.job.id}/labels`} variant="secondary">Open print preview</ButtonLink>}
            <CopyButton value={batchSummary}>Copy batch information</CopyButton>
            {allCodes && allCodes.rows.length === total && <CopyButton value={allCodes.rows.map((unit) => [batch.lot, unit.cartonCode ?? "LOOSE", `UNIT-${String(unit.labelIndex).padStart(4, "0")}`, unit.code, `${baseUrl}/v/${unit.payload}`].join("\t")).join("\n")}>Copy all batch codes</CopyButton>}
          </div>
          <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">Downloads are tenant-scoped, audited, deterministically ordered and recorded as short-lived export jobs. Generating a file does not mark any physical label as printed.</div>
        </Card>
        <Card><CardHeader title="Export history" description="Latest audited requests" /><div className="divide-y divide-slate-100">{d.exports.length ? d.exports.map((job) => <div key={job.id} className="px-5 py-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium text-slate-900">{job.type.replaceAll("_", " ")}</span><span className="capitalize text-slate-500">{job.status}</span></div><div className="mt-1 text-xs text-slate-500">{formatDateTime(job.createdAt)} · {job.recordCount ?? "—"} records</div></div>) : <div className="p-5 text-sm text-slate-500">No exports have been generated.</div>}</div></Card>
      </div>}

      {tab === "quality" && <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Quality review & release" /><div className="p-5"><ActionPanel actor={actor} d={d} /></div></Card>
        <Card><CardHeader title="Reconciliation" />{d.reconciliation ? <div className="space-y-3 p-5 text-sm text-slate-700"><p>Performed by <strong>{d.userName[d.reconciliation.performedBy]}</strong> on {formatDateTime(d.reconciliation.createdAt)}.</p><p className="rounded-xl bg-[#eef7e5] p-4 tabular">{d.reconciliation.issued} issued = {d.reconciliation.printed} printed + {d.reconciliation.rejected} rejected + {d.reconciliation.voided} voided</p><p>Physical finished-unit count: <strong>{d.reconciliation.physicalCount}</strong></p></div> : <div className="p-5 text-sm text-slate-500">Reconciliation has not been completed.</div>}</Card>
      </div>}

      {tab === "activity" && <Card>
        <CardHeader title="Complete activity history" description="Immutable actor IDs, timestamps and workflow outcomes from the tamper-evident audit log" />
        <ol className="divide-y divide-slate-100">{d.activity.map((e) => <li key={e.seq} className="px-5 py-3 text-sm"><div className="flex flex-wrap items-baseline justify-between gap-3"><span className={cx("font-medium", e.decision === "deny" ? "text-red-700" : "text-slate-900")}>{ACTION_LABELS[e.action] ?? e.action}</span><span className="tabular text-xs text-slate-500">{formatDateTime(e.occurredAt)}</span></div><div className="mt-1 text-xs text-slate-500">{e.actorId ? `${d.userTitle[e.actorId] ?? "User"} — ${d.userName[e.actorId]}` : "System"}{describe(e.detail) && ` · ${describe(e.detail)}`}</div></li>)}</ol>
      </Card>}
    </>
  );
}
