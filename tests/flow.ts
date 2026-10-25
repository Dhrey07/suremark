import { randomUUID } from "node:crypto";
import { makeTenant } from "./fixtures";
import {
  createBatch,
  decideAllocation,
  finishPrintJob,
  getPrintLabels,
  reconcileBatch,
  releaseBatch,
  requestAllocation,
  runLineSimulation,
  startPrintJob,
} from "@/lib/services/production";

type Tenant = Awaited<ReturnType<typeof makeTenant>>;

let lotSeq = 0;

export async function draftBatch(t: Tenant, planned = 20, expiryDate = "2028-06-30") {
  return createBatch(t.actors.productionManager, {
    productId: t.product.id,
    lineId: t.line.id,
    lot: `LOT-${++lotSeq}`,
    manufactureDate: "2026-10-01",
    expiryDate,
    plannedQuantity: planned,
  });
}

export async function allocatedBatch(t: Tenant, quantity = 20, expiryDate?: string) {
  const batch = await draftBatch(t, quantity, expiryDate);
  const req = await requestAllocation(t.actors.productionManager, batch.id, quantity, "Run");
  const res = await decideAllocation(t.actors.factoryManager, req.id, true, "");
  if (!res.approved) throw new Error("not approved");
  return { batch, printJobId: res.printJobId, requestId: req.id };
}

export async function releasedBatch(t: Tenant, opts: { quantity?: number; smudged?: number; holdBack?: number; expiryDate?: string } = {}) {
  const { batch, printJobId } = await allocatedBatch(t, opts.quantity ?? 20, opts.expiryDate);
  const op = t.actors.operator;
  await startPrintJob(op, printJobId);
  const labels = await getPrintLabels(op, printJobId);
  const sim = await runLineSimulation(op, printJobId, randomUUID(), { smudged: opts.smudged ?? 0, holdBack: opts.holdBack ?? 0 });
  await finishPrintJob(op, printJobId);
  await reconcileBatch(t.actors.productionManager, batch.id, sim.printed, "");
  await releaseBatch(t.actors.qa, batch.id, true, "Samples inspected, conforms");
  return { batch, printJobId, labels, sim };
}
