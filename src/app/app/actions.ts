"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { attempt, int, str, type ActionState } from "@/lib/action";
import { appendAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz";
import { invalid, notFound } from "@/lib/errors";
import { requireActor } from "@/lib/session";
import { createProduct } from "@/lib/services/catalog";
import {
  createBatch,
  decideAllocation,
  finishPrintJob,
  reconcileBatch,
  rejectLabel,
  releaseBatch,
  requestAllocation,
  runLineSimulation,
  startPrintJob,
} from "@/lib/services/production";
import { decideRecall, initiateRecall } from "@/lib/services/recalls";

export async function createBatchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id = "";
  const res = await attempt(async () => {
    const batch = await createBatch(actor, {
      productId: str(fd, "productId"),
      lineId: str(fd, "lineId"),
      lot: str(fd, "lot"),
      manufactureDate: str(fd, "manufactureDate"),
      expiryDate: str(fd, "expiryDate"),
      plannedQuantity: int(fd, "plannedQuantity"),
    });
    id = batch.id;
  });
  if (res.error) return res;
  redirect(`/app/batches/${id}`);
}

export async function requestAllocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const batchId = str(fd, "batchId");
  return attempt(async () => {
    await requestAllocation(actor, batchId, int(fd, "quantity"), str(fd, "reason"));
    revalidatePath(`/app/batches/${batchId}`);
    return { ok: true, message: "Request sent. An independent approver must now approve it." };
  });
}

export async function decideAllocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const approve = str(fd, "decision") === "approve";
  return attempt(async () => {
    const res = await decideAllocation(actor, str(fd, "requestId"), approve, str(fd, "reason"));
    revalidatePath("/app", "layout");
    return { ok: true, message: res.approved ? "Approved. Identities were issued and a print job was created." : "Request rejected." };
  });
}

export async function startPrintJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const jobId = str(fd, "jobId");
  return attempt(async () => {
    await startPrintJob(actor, jobId);
    revalidatePath(`/app/print-jobs/${jobId}`);
  });
}

export async function runLineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const jobId = str(fd, "jobId");
  return attempt(async () => {
    const smudged = int(fd, "smudged");
    const holdBack = int(fd, "holdBack");
    if (![smudged, holdBack].every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)) throw invalid("Enter whole numbers between 0 and 1000.");
    const res = await runLineSimulation(actor, jobId, str(fd, "runId") || randomUUID(), { smudged, holdBack });
    revalidatePath(`/app/print-jobs/${jobId}`);
    return {
      ok: true,
      message: `Line run complete: ${res.printed} labels printed and verified by camera, ${res.rejected} rejected.${res.duplicates ? ` ${res.duplicates} duplicate events ignored.` : ""}`,
    };
  });
}

export async function rejectLabelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const jobId = str(fd, "jobId");
  return attempt(async () => {
    const labelIndex = int(fd, "labelIndex");
    const [unit] = await getDb()
      .select({ id: schema.units.id })
      .from(schema.units)
      .where(and(eq(schema.units.printJobId, jobId), eq(schema.units.labelIndex, labelIndex)));
    if (!unit) throw invalid(`Label #${labelIndex} is not part of this job.`);
    await rejectLabel(actor, jobId, unit.id, str(fd, "reason"));
    revalidatePath(`/app/print-jobs/${jobId}`);
    return { ok: true, message: "Label rejected. Its identity is permanently retired." };
  });
}

export async function finishPrintJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const jobId = str(fd, "jobId");
  return attempt(async () => {
    const res = await finishPrintJob(actor, jobId);
    revalidatePath(`/app/print-jobs/${jobId}`);
    return { ok: true, message: `Run finished. ${res.voided} unused label identities were voided.` };
  });
}

export async function reconcileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const batchId = str(fd, "batchId");
  return attempt(async () => {
    const r = await reconcileBatch(actor, batchId, int(fd, "physicalCount"), str(fd, "note"));
    revalidatePath(`/app/batches/${batchId}`);
    return { ok: true, message: `Reconciled: ${r.issued} issued = ${r.printed} printed + ${r.rejected} rejected + ${r.voided} voided.` };
  });
}

export async function releaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const batchId = str(fd, "batchId");
  return attempt(async () => {
    const r = await releaseBatch(actor, batchId, fd.get("samplesInspected") === "on", str(fd, "note"));
    revalidatePath(`/app/batches/${batchId}`);
    return { ok: true, message: `Released. ${r.activated} units are now ACTIVE and verifiable by consumers.` };
  });
}

export async function initiateRecallAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const batchId = str(fd, "batchId");
  return attempt(async () => {
    await initiateRecall(actor, batchId, str(fd, "reason"), str(fd, "advice"));
    revalidatePath(`/app/batches/${batchId}`);
    return { ok: true, message: "Recall proposed. A second authorized person must approve it before consumers see it." };
  });
}

export async function decideRecallAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const approve = str(fd, "decision") === "approve";
  return attempt(async () => {
    const r = await decideRecall(actor, str(fd, "recallId"), approve, str(fd, "reason"));
    revalidatePath("/app", "layout");
    return { ok: true, message: r.approved ? `Recall active. ${r.recalledUnits} units now show a recall warning on every channel.` : "Recall rejected." };
  });
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return attempt(async () => {
    await createProduct(actor, {
      alias: str(fd, "alias"),
      name: str(fd, "name"),
      dosageForm: str(fd, "dosageForm"),
      strength: str(fd, "strength"),
      packSize: str(fd, "packSize"),
      gtin: str(fd, "gtin"),
      nafdacRegNo: str(fd, "nafdacRegNo"),
    });
    revalidatePath("/app/products");
    return { ok: true, message: "Product submitted for platform review." };
  });
}

export async function updateRiskCaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return attempt(async () => {
    const status = str(fd, "status");
    if (!["open", "investigating", "closed"].includes(status)) throw invalid("Unknown status.");
    const note = str(fd, "note").trim();
    if (status === "closed" && note.length < 5) throw invalid("Add a short resolution note before closing.");
    const m = actor.membership;
    if (!m) throw notFound();
    await getDb().transaction(async (tx) => {
      const [c] = await tx.select().from(schema.riskCases).where(eq(schema.riskCases.id, str(fd, "caseId"))).for("update");
      if (!c || c.manufacturerId !== m.manufacturerId) throw notFound("Case not found");
      await authorize(actor, "risk:manage", { manufacturerId: m.manufacturerId }, { type: "risk_case", id: c.id });
      await tx
        .update(schema.riskCases)
        .set({ status: status as "open", resolutionNote: note || c.resolutionNote, updatedAt: new Date() })
        .where(eq(schema.riskCases.id, c.id));
      await appendAudit(tx, {
        manufacturerId: m.manufacturerId,
        actorType: "user",
        actorId: actor.userId,
        action: "risk_case.update",
        resourceType: "risk_case",
        resourceId: c.id,
        decision: "allow",
        detail: { status, note },
      });
    });
    revalidatePath("/app/risk");
    return { ok: true, message: "Case updated." };
  });
}
