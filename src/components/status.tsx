import { Badge, type Tone } from "./ui";

const BATCH: Record<string, [string, Tone]> = {
  draft: ["Draft", "neutral"],
  allocation_pending: ["Awaiting approval", "amber"],
  allocated: ["Printing", "blue"],
  reconciled: ["Awaiting QA release", "violet"],
  released: ["Released", "green"],
  recalled: ["Recalled", "red"],
};

export function BatchStatus({ status }: { status: string }) {
  const [label, tone] = BATCH[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export const UNIT_STATES: { key: string; label: string; tone: Tone; description: string }[] = [
  { key: "RESERVED", label: "Reserved", tone: "neutral", description: "Issued, not yet printed" },
  { key: "PRINTED_PENDING", label: "Printed", tone: "blue", description: "Printed and camera-verified; awaiting reconciliation" },
  { key: "QA_PENDING", label: "QA pending", tone: "violet", description: "Reconciled; awaiting QA release" },
  { key: "ACTIVE", label: "Active", tone: "green", description: "Released; consumers can verify" },
  { key: "REJECTED", label: "Rejected", tone: "amber", description: "Failed print/camera or damaged; permanently retired" },
  { key: "VOIDED", label: "Voided", tone: "amber", description: "Never printed; permanently retired" },
  { key: "RECALLED", label: "Recalled", tone: "red", description: "Consumers see a recall warning" },
];

export function UnitState({ state }: { state: string }) {
  const s = UNIT_STATES.find((u) => u.key === state);
  return <Badge tone={s?.tone ?? "neutral"}>{s?.label ?? state}</Badge>;
}

const RISK_KIND: Record<string, string> = {
  possible_clone: "Possible copied code",
  unreleased_code_scanned: "Unreleased code in market",
  consumer_report: "Consumer report",
};
export const riskKindLabel = (k: string) => RISK_KIND[k] ?? k;

export function Severity({ level }: { level: string }) {
  return <Badge tone={level === "high" ? "red" : level === "medium" ? "amber" : "neutral"}>{level}</Badge>;
}
