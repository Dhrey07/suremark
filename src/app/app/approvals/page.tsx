import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, inputClass, Notice, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { pendingApprovals } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { decideAllocationAction, decideRecallAction } from "../actions";

export default async function ApprovalsPage() {
  const actor = await requireActor();
  const items = await pendingApprovals(actor);
  const recallIds = new Map(
    (await getDb().select({ id: schema.recalls.id, approvalRequestId: schema.recalls.approvalRequestId, advice: schema.recalls.consumerAdvice }).from(schema.recalls).where(eq(schema.recalls.status, "pending_approval"))).map((r) => [
      r.approvalRequestId,
      r,
    ]),
  );
  return (
    <>
      <PageHeader title="Approvals" description="Maker-checker: you can never approve a request you raised yourself, whatever roles you hold." />
      {items.length === 0 ? (
        <Card>
          <EmptyState>No requests are waiting for you.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map(({ request, batch, product, requester }) => {
            const own = request.requesterId === actor.userId;
            const isRecall = request.action === "recall";
            const recall = recallIds.get(request.id);
            return (
              <Card key={request.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={isRecall ? "red" : "amber"}>{isRecall ? "Recall" : "Identity allocation"}</Badge>
                      <Link href={`/app/batches/${batch.id}`} className="font-mono text-sm font-semibold text-brand-700">{batch.lot}</Link>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {isRecall ? (
                        <>Recall of {product.name} {product.strength}: {request.requestReason}{recall && <> Consumers will see: “{recall.advice}”</>}</>
                      ) : (
                        <>
                          Issue <span className="font-semibold">{Number(request.payload.quantity).toLocaleString()}</span> unit identities for {product.name}{" "}
                          {product.strength} (planned {batch.plannedQuantity.toLocaleString()}).
                          {request.requestReason && <> “{request.requestReason}”</>}
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested by {requester} · {formatDateTime(request.createdAt)}
                    </p>
                  </div>
                </div>
                {own ? (
                  <div className="mt-4">
                    <Notice tone="amber">You raised this request, so someone else must decide it.</Notice>
                  </div>
                ) : (
                  <ActionForm action={isRecall ? decideRecallAction : decideAllocationAction} className="mt-4 flex flex-wrap items-center gap-2">
                    <input type="hidden" name={isRecall ? "recallId" : "requestId"} value={isRecall ? (recall?.id ?? "") : request.id} />
                    <input name="reason" placeholder="Reason (required to reject)" className={`${inputClass} max-w-xs`} />
                    <button name="decision" value="approve" className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${isRecall ? "bg-red-600 hover:bg-red-700" : "bg-brand-700 hover:bg-brand-800"}`}>
                      {isRecall ? "Approve recall" : "Approve and issue"}
                    </button>
                    <button name="decision" value="reject" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
                      Reject
                    </button>
                  </ActionForm>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
