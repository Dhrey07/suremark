import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, Field, inputClass, PageHeader, Table, Td } from "@/components/ui";
import { can } from "@/lib/authz";
import { stateName } from "@/lib/geo";
import { tenantCatalog } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { createProductAction } from "../actions";

export default async function ProductsPage() {
  const actor = await requireActor();
  const { products, lines } = await tenantCatalog(actor);
  const factories = [...new Map(lines.map((l) => [l.factoryId, { name: l.factoryName, state: l.state, lines: lines.filter((x) => x.factoryId === l.factoryId) }])).values()];
  return (
    <>
      <PageHeader title="Products & sites" description="Products must be approved by the platform before identities can be issued for them." />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Product catalogue" />
          <Table head={["Alias", "Product", "Pack", "Reg. no.", "Status"]}>
            {products.map((p) => (
              <tr key={p.id}>
                <Td className="font-mono font-semibold">{p.alias}</Td>
                <Td>
                  {p.name} {p.strength}
                  <div className="text-xs text-slate-500">{p.dosageForm}{p.gtin && ` · GTIN ${p.gtin}`}</div>
                </Td>
                <Td className="text-slate-600">{p.packSize}</Td>
                <Td className="whitespace-nowrap text-slate-600">{p.nafdacRegNo ?? "—"}</Td>
                <Td>
                  <Badge tone={p.status === "approved" ? "green" : p.status === "pending" ? "amber" : "red"}>
                    {p.status === "pending" ? "Platform review" : p.status}
                  </Badge>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Factories & lines" />
            <ul className="divide-y divide-slate-100 text-sm">
              {factories.map((f) => (
                <li key={f.name} className="px-5 py-3">
                  <div className="font-medium text-slate-900">
                    {f.name} <span className="font-normal text-slate-500">· {stateName(f.state)}</span>
                  </div>
                  <div className="mt-1 text-slate-600">{f.lines.map((l) => l.name).join(" · ")}</div>
                </li>
              ))}
            </ul>
          </Card>
          {can(actor, "catalog:manage") && (
            <Card>
              <CardHeader title="Register a product" description="Submitted products are reviewed by the platform before use." />
              <ActionForm action={createProductAction} resetOnSuccess className="grid gap-3 p-5 sm:grid-cols-2">
                <Field label="Alias">
                  <input name="alias" required maxLength={8} className={`${inputClass} font-mono uppercase`} placeholder="e.g. CIP" />
                </Field>
                <Field label="Strength">
                  <input name="strength" required className={inputClass} placeholder="500 mg" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Name">
                    <input name="name" required className={inputClass} placeholder="Ciprofloxacin Tablets" />
                  </Field>
                </div>
                <Field label="Dosage form">
                  <input name="dosageForm" required className={inputClass} placeholder="Tablet" />
                </Field>
                <Field label="Pack size">
                  <input name="packSize" required className={inputClass} placeholder="10 × 10 blister" />
                </Field>
                <Field label="GTIN (optional)" hint="Validated check digit">
                  <input name="gtin" inputMode="numeric" className={inputClass} />
                </Field>
                <Field label="Registration no. (optional)">
                  <input name="nafdacRegNo" className={inputClass} />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton>Submit for review</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
