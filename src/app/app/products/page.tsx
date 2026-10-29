import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, Field, inputClass, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { can } from "@/lib/authz";
import { stateName } from "@/lib/geo";
import { tenantCatalog } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { createProductAction } from "../actions";

export default async function ProductsPage() {
  const actor = await requireActor();
  const { products, lines } = await tenantCatalog(actor);
  const packagingRows = actor.membership ? await getDb().select().from(schema.packagingVersions).where(eq(schema.packagingVersions.manufacturerId, actor.membership.manufacturerId)) : [];
  const packagingByProduct = new Map(packagingRows.filter((row) => row.active).map((row) => [row.productId, row]));
  const factories = [...new Map(lines.map((l) => [l.factoryId, { name: l.factoryName, state: l.state, lines: lines.filter((x) => x.factoryId === l.factoryId) }])).values()];
  return (
    <>
      <PageHeader eyebrow="Catalogue" title="Products & packaging" description="Register a product family and sellable variant, capture regulatory evidence, and lock the packaging used for production." action={can(actor, "catalog:manage") ? <a href="#add-product" className="rounded-xl bg-[#10261e] px-4 py-2.5 text-sm font-semibold text-white">Add product</a> : undefined} />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_.85fr]">
        <Card>
          <CardHeader title="Product catalogue" description={`${products.length} registered variant${products.length === 1 ? "" : "s"}`} />
          {products.length === 0 ? <EmptyState>No products yet. Add the first product to configure packaging and production.</EmptyState> : <div className="grid gap-3 p-4 sm:grid-cols-2">{products.map((p) => { const packaging = packagingByProduct.get(p.id); return (
            <Link key={p.id} href={`/app/products/${p.id}`} className="group overflow-hidden rounded-2xl border border-[#e6e2d8] bg-[#fbfaf6] transition hover:-translate-y-0.5 hover:border-[#b9cda9] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
              {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-36 w-full object-cover" /> : <div className="flex h-28 items-end bg-[linear-gradient(135deg,#dcefc7,#f8f5ea)] p-4"><span className="rounded-full bg-white/80 px-3 py-1 font-mono text-sm font-bold text-[#10261e]">{p.alias}</span></div>}
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={p.status === "approved" ? "green" : p.status === "pending" ? "amber" : "red"}>{p.status === "pending" ? "Platform review" : p.status}</Badge>{p.regulatorySimulated && <Badge tone="violet">Simulated registry</Badge>}</div>
                <h2 className="mt-3 text-lg font-semibold tracking-[-.02em] text-slate-950">{p.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{p.brand} · {p.variant || p.strength}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Product code</dt><dd className="mt-1 font-mono font-bold text-slate-900">{p.alias}</dd></div><div><dt className="text-slate-500">Packaging</dt><dd className="mt-1 font-semibold text-slate-900">{packaging ? `${packaging.unitsPerCarton} ${packaging.unitType}s / carton` : p.packSize}</dd></div><div className="col-span-2"><dt className="text-slate-500">Regulatory status</dt><dd className="mt-1 font-medium text-slate-900">{p.nafdacRegNo ?? "Not submitted"} · {p.regulatoryStatus.replaceAll("_", " ")}</dd></div></dl>
                <div className="mt-4 text-sm font-semibold text-brand-800">Open product workspace →</div>
              </div>
            </Link>
          );})}</div>}
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
        </div>
      </div>
      {can(actor, "catalog:manage") && <Card id="add-product" className="mt-6 scroll-mt-6">
        <CardHeader title="Add a product variant" description="The product code is assigned automatically and cannot be changed later." />
        <div className="border-b border-slate-100 px-5 py-4"><ol className="grid grid-cols-3 gap-2 text-xs font-semibold"><li className="rounded-full bg-[#10261e] px-3 py-2 text-center text-white">1 · Product</li><li className="rounded-full bg-brand-50 px-3 py-2 text-center text-brand-800">2 · Regulation</li><li className="rounded-full bg-[#f5f3ed] px-3 py-2 text-center text-slate-700">3 · Packaging</li></ol></div>
        <ActionForm action={createProductAction} resetOnSuccess className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3"><h3 className="text-sm font-semibold text-slate-950">Product identity</h3></div>
          <Field label="Brand"><input name="brand" required className={inputClass} defaultValue="Fanta" /></Field>
          <Field label="Product family"><input name="familyName" required className={inputClass} defaultValue="Fanta" /></Field>
          <Field label="Variant"><input name="variant" required className={inputClass} defaultValue="Orange 50cl" /></Field>
          <div className="sm:col-span-2"><Field label="Display name"><input name="name" required className={inputClass} defaultValue="Fanta Orange 50cl" /></Field></div>
          <Field label="Category"><input name="category" required className={inputClass} defaultValue="Beverage" /></Field>
          <div className="sm:col-span-2 lg:col-span-3"><Field label="Description"><textarea name="description" required rows={3} className={inputClass} defaultValue="Orange-flavoured carbonated soft drink in a 500 ml bottle." /></Field></div>
          <Field label="Product image URL (optional)"><input name="imageUrl" type="url" className={inputClass} placeholder="https://…" /></Field>
          <Field label="GTIN / barcode (optional)" hint="Check digit is validated"><input name="gtin" inputMode="numeric" className={inputClass} /></Field>
          <Field label="Shelf life (days)"><input name="shelfLifeDays" type="number" min={1} max={7300} required defaultValue={365} className={inputClass} /></Field>
          <div className="sm:col-span-2 lg:col-span-3 border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold text-slate-950">Regulatory registration</h3><p className="mt-1 text-xs text-slate-500">The development reference below is fictional and will be marked simulated—not officially verified.</p></div>
          <div className="sm:col-span-2"><Field label="NAFDAC registration number"><input name="nafdacRegNo" className={inputClass} defaultValue="SIM-NAFDAC-FANTA-001" /></Field></div>
          <div className="sm:col-span-2 lg:col-span-3 border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold text-slate-950">Packaging configuration · version 1</h3></div>
          <Field label="Packaging type"><input name="packagingType" required className={inputClass} defaultValue="Bottle" /></Field>
          <Field label="Net quantity"><input name="netQuantity" type="number" min={1} required className={inputClass} defaultValue={500} /></Field>
          <Field label="Measurement unit"><select name="measurementUnit" className={inputClass} defaultValue="ml"><option value="ml">ml</option><option value="cl">cl</option><option value="l">litres</option><option value="g">grams</option><option value="kg">kilograms</option><option value="unit">unit</option></select></Field>
          <Field label="Units per carton"><input name="unitsPerCarton" type="number" min={1} max={10000} required className={inputClass} defaultValue={24} /></Field>
          <Field label="Cartons per pallet (optional)"><input name="cartonsPerPallet" type="number" min={1} max={10000} className={inputClass} defaultValue={50} /></Field>
          <Field label="Product form"><input name="dosageForm" required className={inputClass} defaultValue="Beverage" /></Field>
          <Field label="Declared quantity"><input name="strength" required className={inputClass} defaultValue="500 ml" /></Field>
          <Field label="Pack description"><input name="packSize" required className={inputClass} defaultValue="24 × 500 ml bottles" /></Field>
          <div className="sm:col-span-2"><Field label="Manufacturing requirements (optional)"><input name="manufacturingRequirements" className={inputClass} placeholder="Cold-fill line; food-grade PET" /></Field></div>
          <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#eef7e5] p-4"><div><div className="font-semibold text-[#10261e]">Ready for review</div><div className="text-sm text-[#29483c]">A permanent product code and packaging version will be created together.</div></div><SubmitButton pendingText="Registering product…">Register product</SubmitButton></div>
        </ActionForm>
      </Card>}
    </>
  );
}
