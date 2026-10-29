import { BatchPlanForm } from "@/components/batch-plan-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/authz";
import { lagosToday } from "@/lib/dates";
import { tenantCatalog } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { createBatchSetAction } from "../../actions";

export default async function NewBatchPage() {
  const actor = await requireActor();
  const { products, lines, packaging } = await tenantCatalog(actor);
  const myLines = lines.filter((l) => can(actor, "batch:create", { manufacturerId: actor.membership!.manufacturerId, factoryId: l.factoryId, lineId: l.id }));
  const approved = products.filter((p) => p.status === "approved");
  const today = lagosToday();
  const lotSuggestion = `${approved[0]?.alias ?? "LOT"}-${today.replaceAll("-", "").slice(2)}`;
  const productById = new Map(approved.map((p) => [p.id, p]));
  const options = packaging.flatMap((pack) => {
    const product = productById.get(pack.productId);
    return product ? [{ productId: product.id, packagingId: pack.id, unitsPerCarton: pack.unitsPerCarton, label: `${product.alias} — ${product.brand} ${product.variant || product.name} · v${pack.version} · ${pack.unitsPerCarton} ${pack.unitType}s/carton` }] : [];
  });

  if (!can(actor, "batch:create")) {
    return <Notice tone="amber" title="Not permitted">Your role cannot create batches.</Notice>;
  }
  return (
    <>
      <PageHeader eyebrow="Production · New run" title="Set up a production run" description="Add the production details now. Product codes are requested separately and require another person’s approval." />
      <div className="mb-5 flex max-w-2xl items-center gap-2 text-xs font-medium text-slate-500" aria-label="Step 1 of 4"><span className="rounded-full bg-[#10261e] px-3 py-1.5 text-white">1 · Details</span><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#e6e2d8]">2 · Codes</span><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#e6e2d8]">3 · Print</span><span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#e6e2d8]">4 · Quality</span></div>
      <Card className="max-w-2xl p-5 sm:p-7">
        {options.length && myLines.length ? <BatchPlanForm action={createBatchSetAction} options={options} lines={myLines.map((l) => ({ id: l.id, label: `${l.factoryName} — ${l.name}` }))} today={today} lotSuggestion={lotSuggestion} /> : <Notice tone="amber" title="Setup required">Approve a product with an active packaging version and add a production line before creating a run.</Notice>}
      </Card>
    </>
  );
}
