import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, inputClass, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/authz";
import { lagosToday } from "@/lib/dates";
import { tenantCatalog } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { createBatchAction } from "../../actions";

export default async function NewBatchPage() {
  const actor = await requireActor();
  const { products, lines } = await tenantCatalog(actor);
  const myLines = lines.filter((l) => can(actor, "batch:create", { manufacturerId: actor.membership!.manufacturerId, factoryId: l.factoryId, lineId: l.id }));
  const approved = products.filter((p) => p.status === "approved");
  const today = lagosToday();
  const lotSuggestion = `${approved[0]?.alias ?? "LOT"}-${today.slice(2, 4)}${today.slice(5, 7)}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  if (!can(actor, "batch:create")) {
    return <Notice tone="amber" title="Not permitted">Your role cannot create batches.</Notice>;
  }
  return (
    <>
      <PageHeader title="New batch" description="Creates a draft. No identities exist until a request is approved by someone else." />
      <Card className="max-w-2xl p-5">
        <ActionForm action={createBatchAction} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product" hint="Only products approved by the platform can be issued.">
              <select name="productId" required className={inputClass}>
                {approved.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.alias} — {p.name} {p.strength} ({p.packSize})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Production line" hint="Lines at sites you are assigned to.">
              <select name="lineId" required className={inputClass}>
                {myLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.factoryName} — {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Lot number">
            <input name="lot" required defaultValue={lotSuggestion} className={`${inputClass} font-mono uppercase`} />
          </Field>
          <Field label="Planned quantity (units)" hint="Prototype limit: 5,000 per batch.">
            <input name="plannedQuantity" type="number" min={1} max={5000} required defaultValue={500} className={inputClass} />
          </Field>
          <Field label="Manufacturing date">
            <input name="manufactureDate" type="date" required defaultValue={today} className={inputClass} />
          </Field>
          <Field label="Expiry date">
            <input name="expiryDate" type="date" required defaultValue={`${Number(today.slice(0, 4)) + 2}${today.slice(4)}`} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Creating…">Create draft batch</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
