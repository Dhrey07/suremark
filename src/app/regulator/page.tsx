import { BarList, DailyColumns } from "@/components/charts";
import { riskKindLabel, Severity } from "@/components/status";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Table, Td } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { stateName } from "@/lib/geo";
import { regulatorOverview } from "@/lib/regulator";
import { requireActor } from "@/lib/session";

const OUTCOMES: { key: string; label: string; color: string; tag: string }[] = [
  { key: "issued_no_known_alerts", label: "No known alerts", color: "#0ca30c", tag: "✓" },
  { key: "suspicious", label: "Possible copied code", color: "#fab219", tag: "!" },
  { key: "not_released", label: "Unreleased code", color: "#ec835a", tag: "!" },
  { key: "recalled", label: "Recalled batch", color: "#d03b3b", tag: "✕" },
  { key: "expired", label: "Expired batch", color: "#d03b3b", tag: "✕" },
  { key: "unable_to_verify", label: "Unable to verify", color: "#898781", tag: "?" },
];

export default async function RegulatorPage() {
  const actor = await requireActor();
  const d = await regulatorOverview(actor);
  const alerts = (d.byOutcome.suspicious ?? 0) + (d.byOutcome.not_released ?? 0) + (d.byOutcome.recalled ?? 0) + (d.byOutcome.expired ?? 0);
  return (
    <>
      <PageHeader
        eyebrow="Proposed regulator integration"
        title="National product-authentication overview"
        description="Scoped, read-only view across all participating manufacturers. Regulator access exists only under a formal agreement; nothing here can alter manufacturer records."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Participating manufacturers" value={d.manufacturers} />
        <Stat label="Approved products" value={d.products} />
        <Stat label="Active units in market" value={d.activeUnits.toLocaleString()} />
        <Stat label="Consumer checks · 30 days" value={d.totalChecks.toLocaleString()} />
        <Stat label="Warning results · 30 days" value={alerts.toLocaleString()} hint="Copied, unreleased, recalled, expired" />
        <Stat label="Rejected QR attempts · 30 days" value={d.forgedQr.toLocaleString()} hint="Invalid or unregistered identities" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Consumer checks per day" description="All channels (QR, web, USSD), last 30 days, West Africa Time" />
          <div className="p-5">
            <DailyColumns label="Consumer checks per day, last 30 days" data={d.daily.map((r) => ({ date: r.day, label: formatDate(r.day).replace(/ \d{4}$/, ""), value: r.n }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Results · 30 days" description="What consumers were told" />
          <div className="p-5">
            <BarList unit="checks" rows={OUTCOMES.map((o) => ({ key: o.key, label: o.label, value: d.byOutcome[o.key] ?? 0, color: o.color, tag: o.tag }))} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader title="Where checks happen" description="By state (coarse network location), last 30 days" />
          <div className="p-5">
            <BarList
              unit="checks"
              rows={d.regions.slice(0, 12).map((r) => ({ key: r.region ?? "unknown", label: r.region ? stateName(r.region) : "Unknown / outside NG", value: r.n }))}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Open risk cases" description="Signals to investigate — not proof of counterfeiting" />
          {d.cases.length === 0 ? (
            <EmptyState>No open cases.</EmptyState>
          ) : (
            <Table head={["Severity", "Signal", "Manufacturer / batch", "Updated"]}>
              {d.cases.map(({ c, manufacturer, lot, product }) => (
                <tr key={c.id}>
                  <Td><Severity level={c.severity} /></Td>
                  <Td>
                    <div className="font-medium text-slate-900">{riskKindLabel(c.kind)}</div>
                    <div className="text-xs text-slate-500">{c.occurrences} occurrence{c.occurrences === 1 ? "" : "s"} · {c.status}</div>
                  </Td>
                  <Td>
                    <div>{manufacturer}</div>
                    <div className="text-xs text-slate-500">{lot ? `${lot} · ${product}` : "—"}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDateTime(c.updatedAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader title="Active recalls" description="Shown to consumers on every channel" />
          {d.recalls.length === 0 ? (
            <EmptyState>No active recalls.</EmptyState>
          ) : (
            <Table head={["Batch", "Manufacturer", "Reason", "Effective"]}>
              {d.recalls.map(({ r, manufacturer, lot, product, strength }) => (
                <tr key={r.id}>
                  <Td>
                    <div className="font-mono font-medium">{lot}</div>
                    <div className="text-xs text-slate-500">{product} {strength}</div>
                  </Td>
                  <Td>{manufacturer}</Td>
                  <Td className="max-w-xs text-slate-700">{r.reason}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDateTime(r.effectiveAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Manufacturers" />
          <Table head={["Manufacturer", "Onboarding", "Active units", "Checks 30d", "Open cases"]}>
            {d.manufacturerRows.map((m) => (
              <tr key={m.id}>
                <Td>
                  <div className="font-medium text-slate-900">{m.legal_name}</div>
                  <div className="text-xs text-slate-500">{m.alias} · {m.sector}</div>
                </Td>
                <Td><Badge tone={m.kyb_status === "approved" ? "green" : m.kyb_status === "pending" ? "amber" : "red"}>{m.kyb_status}</Badge></Td>
                <Td className="tabular">{Number(m.active).toLocaleString()}</Td>
                <Td className="tabular">{Number(m.checks).toLocaleString()}</Td>
                <Td className="tabular">{m.open_cases}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

    </>
  );
}
