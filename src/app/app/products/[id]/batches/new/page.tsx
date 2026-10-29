import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductBatchForm } from "@/components/product-batch-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/authz";
import { lagosToday } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { getProductDetail, tenantCatalog } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { createProductBatchAction } from "../../../../actions";

export default async function NewProductBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor] = await Promise.all([params, requireActor()]);
  let product: Awaited<ReturnType<typeof getProductDetail>>;
  try { product = await getProductDetail(actor, id); } catch (error) { if (error instanceof DomainError) notFound(); throw error; }
  if (!can(actor, "batch:create")) return <Notice tone="amber" title="Not permitted">Your role cannot create production batches.</Notice>;
  const { lines } = await tenantCatalog(actor);
  const myLines = lines.filter((line) => can(actor, "batch:create", { manufacturerId: actor.membership!.manufacturerId, factoryId: line.factoryId, lineId: line.id }));
  const packaging = product.packaging.find((p) => p.active);
  return <>
    <PageHeader eyebrow={<Link href={`/app/products/${id}`}>{product.product.name}</Link>} title="Create production batch" description="The product and packaging are fixed from the catalogue. Confirm the site, dates and physical quantities before creating the permanent batch record." />
    <Card className="max-w-3xl p-5 sm:p-7">{packaging && myLines.length ? <ProductBatchForm action={createProductBatchAction} product={{ id, name: product.product.name, alias: product.product.alias, manufacturerPrefix: product.manufacturer.alias }} packaging={packaging} lines={myLines.map((line) => ({ id: line.id, label: `${line.factoryName} — ${line.name}` }))} today={lagosToday()} /> : <Notice tone="amber" title="Setup required">This product needs an active packaging version and an assigned production line.</Notice>}</Card>
  </>;
}
