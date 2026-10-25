import { desc, eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, Table, Td } from "@/components/ui";
import { getDb, schema } from "@/db";
import { formatDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { stateName } from "@/lib/geo";
import { requireActor } from "@/lib/session";
import { resetDemoAction, reviewManufacturerAction, reviewProductAction } from "./actions";

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
  await requireActor();
  const db = getDb();
  const [manufacturers, pendingProducts] = await Promise.all([
    db.select().from(schema.manufacturers).orderBy(desc(schema.manufacturers.createdAt)),
    db
      .select({ p: schema.products, m: schema.manufacturers.legalName })
      .from(schema.products)
      .innerJoin(schema.manufacturers, eq(schema.manufacturers.id, schema.products.manufacturerId))
      .where(eq(schema.products.status, "pending")),
  ]);
  return (
    <>
      <PageHeader
        title="Onboarding & reviews"
        description="The platform verifies each manufacturer (KYB) and each product claim before any identity can be issued. Reviewers cannot alter issued history."
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Manufacturers" description="Know-your-business review: legal identity, CAC registration, authorised representatives." />
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
                  <Badge tone={m.kybStatus === "approved" ? "green" : m.kybStatus === "pending" ? "amber" : "red"}>{m.kybStatus}</Badge>
                </Td>
                <Td>{m.kybStatus === "pending" && <Decide action={reviewManufacturerAction} field="manufacturerId" id={m.id} approveLabel="Approve" />}</Td>
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
