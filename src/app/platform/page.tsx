import { count, desc, eq, ne } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, Stat, Table, Td } from "@/components/ui";
import { getDb, schema } from "@/db";
import { formatDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { stateName } from "@/lib/geo";
import { requireActor } from "@/lib/session";
import { governManufacturerAction, resetDemoAction, reviewManufacturerAction, reviewProductAction } from "./actions";

function Decide({ action, field, id, approveLabel }: { action: typeof reviewManufacturerAction; field: string; id: string; approveLabel: string }) {
  return (
    <ActionForm action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name={field} value={id} />
      <button name="decision" value="approve" className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800">
        {approveLabel}
      </button>
      <button name="decision" value="reject" className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
        Reject
      </button>
    </ActionForm>
  );
}

export default async function PlatformPage() {
  const actor = await requireActor("/platform/login");
  const db = getDb();
  const [manufacturers, pendingProducts, manufacturerStats, productStats, unitStats, verificationStats, riskStats, recallStats] = await Promise.all([
    db.select().from(schema.manufacturers).orderBy(desc(schema.manufacturers.createdAt)),
    db
      .select({ p: schema.products, m: schema.manufacturers.legalName })
      .from(schema.products)
      .innerJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.products.manufacturerId))
      .where(eq(schema.products.status, "pending")),
    db.select({ status: schema.manufacturers.kybStatus, n: count() }).from(schema.manufacturers).groupBy(schema.manufacturers.kybStatus),
    db.select({ n: count() }).from(schema.products),
    db.select({ state: schema.units.state, n: count() }).from(schema.units).groupBy(schema.units.state),
    db.select({ n: count() }).from(schema.verificationEvents),
    db.select({ n: count() }).from(schema.riskCases).where(ne(schema.riskCases.status, "closed")),
    db.select({ n: count() }).from(schema.recalls).where(eq(schema.recalls.status, "active")),
  ]);
  const manufacturerCounts = Object.fromEntries(manufacturerStats.map((row) => [row.status, Number(row.n)]));
  const unitCounts = Object.fromEntries(unitStats.map((row) => [row.state, Number(row.n)]));
  const totalManufacturers = Object.values(manufacturerCounts).reduce((sum, value) => sum + value, 0);
  const totalUnits = Object.values(unitCounts).reduce((sum, value) => sum + value, 0);
  return (
    <>
      <PageHeader
        eyebrow="Trust network"
        title={`Good morning, ${actor.name.split(" ")[0]}.`}
        description="Review organizations, watch identity activity and act on trust signals across the network."
      />
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
          <div className="rounded-2xl bg-[#10261e] p-6 text-white shadow-sm">
            <div className="text-sm text-white/60">Product identities protected</div>
            <div className="tabular mt-3 text-4xl font-semibold tracking-[-0.05em]">{totalUnits.toLocaleString()}</div>
            <div className="mt-5 flex gap-5 border-t border-white/10 pt-4 text-sm"><span><b className="text-[#b8f06a]">{(unitCounts.ACTIVE ?? 0).toLocaleString()}</b> released</span><span><b>{Number(verificationStats[0]?.n ?? 0).toLocaleString()}</b> checks</span></div>
          </div>
          <Stat label="Organizations in the network" value={totalManufacturers.toLocaleString()} hint={`${manufacturerCounts.approved ?? 0} approved · ${manufacturerCounts.pending ?? 0} awaiting review`} />
          <Stat label="Attention required" value={Number(riskStats[0]?.n ?? 0).toLocaleString()} hint={`${Number(recallStats[0]?.n ?? 0)} active recalls · ${Number(productStats[0]?.n ?? 0)} registered products`} />
        </div>
        <Card>
          <CardHeader title="Manufacturer network" description="Review onboarding, monitor standing and manage access to the identity network." />
          <Table head={["Organisation", "RC number", "Sector", "HQ", "Applied", "Status", ""]}>
            {manufacturers.map((m) => (
              <tr key={m.id}>
                <Td>
                  <div className="font-medium text-slate-900">{m.legalName}</div>
                  <div className="font-mono text-xs text-slate-500">{m.alias}</div>
                </Td>
                <Td className="font-mono text-xs">{m.rcNumber}</Td>
                <Td>{m.sector}</Td>
                <Td>{stateName(m.hqState)}</Td>
                <Td className="whitespace-nowrap">{formatDate(m.createdAt)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1"><Badge tone={m.kybStatus === "approved" ? "green" : m.kybStatus === "pending" ? "amber" : "red"}>{m.kybStatus}</Badge>
                  {m.kybStatus === "approved" && <Badge tone={m.operationalStatus === "active" ? "green" : "red"}>{m.operationalStatus}</Badge>}</div>
                </Td>
                <Td>{m.kybStatus === "pending" ? <Decide action={reviewManufacturerAction} field="manufacturerId" id={m.id} approveLabel="Approve" /> : m.kybStatus === "approved" ? (
                  <ActionForm action={governManufacturerAction} className="flex min-w-64 flex-wrap gap-2">
                    <input type="hidden" name="manufacturerId" value={m.id} />
                    <input name="reason" required minLength={10} aria-label="Governance reason" placeholder="Reason (minimum 10 characters)" className="min-w-48 flex-1 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300" />
                    <button name="operation" value={m.operationalStatus === "active" ? "suspend" : "reactivate"} className={m.operationalStatus === "active" ? "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white" : "rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white"}>{m.operationalStatus === "active" ? "Suspend" : "Reactivate"}</button>
                  </ActionForm>
                ) : null}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title="Product claims awaiting review" description="Confirms the manufacturer owns or is authorised for the product and its registration." />
          {pendingProducts.length === 0 ? (
            <EmptyState>No products awaiting review.</EmptyState>
          ) : (
            <Table head={["Product", "Manufacturer", "Registration no.", "GTIN", ""]}>
              {pendingProducts.map(({ p, m }) => (
                <tr key={p.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{p.name} {p.strength}</div>
                    <div className="text-xs text-slate-500">{p.alias} · {p.dosageForm} · {p.packSize}</div>
                  </Td>
                  <Td>{m}</Td>
                  <Td className="font-mono text-xs">{p.nafdacRegNo ?? "—"}</Td>
                  <Td className="font-mono text-xs">{p.gtin ?? "—"}</Td>
                  <Td><Decide action={reviewProductAction} field="productId" id={p.id} approveLabel="Approve" /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        {env.demoMode && (
          <Card>
            <CardHeader title="Demo controls" />
            <div className="space-y-3 p-5">
              <Notice tone="amber">
                Resets the whole demo to its starting state: erases all data, including anything created during a walkthrough, and signs everyone out.
              </Notice>
              <ActionForm action={resetDemoAction}>
                <SubmitButton variant="danger" pendingText="Resetting (about 10 seconds)…">Reset demo data</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
