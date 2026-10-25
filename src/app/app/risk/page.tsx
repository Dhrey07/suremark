import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { riskKindLabel, Severity } from "@/components/status";
import { Badge, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { stateName } from "@/lib/geo";
import { riskCases } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { updateRiskCaseAction } from "../actions";

function evidenceLine(e: Record<string, unknown>) {
  const parts: string[] = [];
  if (Array.isArray(e.signals)) {
    for (const s of e.signals as string[]) {
      const [kind, value] = s.split(":");
      if (kind === "impossible_travel") {
        const [a, b] = value.split("->");
        parts.push(`Checked in ${stateName(a)} then ${stateName(b)} faster than goods can travel`);
      } else if (kind === "many_devices") parts.push(`${value} different devices checked this code`);
      else if (kind === "high_volume") parts.push(`${value} checks of one code`);
      else if (kind === "open_clone_case") parts.push("Repeat check on a flagged code");
    }
  }
  if (typeof e.state === "string") parts.push(`Label state: ${e.state}`);
  if (typeof e.description === "string") parts.push(`“${e.description}”`);
  if (typeof e.reference === "string") parts.push(`Ref ${e.reference}`);
  if (typeof e.region === "string") parts.push(`Region: ${stateName(e.region)}`);
  if (typeof e.channel === "string") parts.push(`Channel: ${e.channel.toUpperCase()}`);
  return parts.join(" · ");
}

export default async function RiskPage() {
  const actor = await requireActor();
  const cases = await riskCases(actor, { includeClosed: true });
  return (
    <>
      <PageHeader
        title="Alerts & cases"
        description="Signals from consumer checks and reports. A copied-code signal is a reason to investigate, not proof that a pack is fake."
      />
      {cases.length === 0 ? (
        <Card>
          <EmptyState>No alerts.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {cases.map(({ c, lot, product }) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Severity level={c.severity} />
                <span className="font-semibold text-slate-900">{riskKindLabel(c.kind)}</span>
                <Badge tone={c.status === "closed" ? "neutral" : c.status === "investigating" ? "blue" : "amber"}>{c.status}</Badge>
                {c.batchId && (
                  <Link href={`/app/batches/${c.batchId}`} className="font-mono text-sm text-brand-700">{lot}</Link>
                )}
                <span className="text-sm text-slate-500">{product}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{c.summary}</p>
              <p className="mt-1 text-xs text-slate-500">
                {evidenceLine(c.evidence)} · {c.occurrences} occurrence{c.occurrences === 1 ? "" : "s"} · last {formatDateTime(c.updatedAt)}
              </p>
              {c.resolutionNote && <p className="mt-2 text-xs text-slate-600">Note: {c.resolutionNote}</p>}
              {c.status !== "closed" && (
                <ActionForm action={updateRiskCaseAction} className="mt-4 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="caseId" value={c.id} />
                  <select name="status" defaultValue={c.status === "open" ? "investigating" : "closed"} className={`${inputClass} w-auto`}>
                    <option value="investigating">Investigating</option>
                    <option value="closed">Close case</option>
                  </select>
                  <input name="note" placeholder="Note (required to close)" className={`${inputClass} max-w-sm`} />
                  <SubmitButton variant="secondary" size="sm">Update</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
