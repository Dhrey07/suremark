import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, inputClass, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/authz";
import { DomainError } from "@/lib/errors";
import { getProductDetail } from "@/lib/queries";
import { requireActor } from "@/lib/session";
import { updateProductAction } from "../../../actions";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor] = await Promise.all([params, requireActor()]);
  let d: Awaited<ReturnType<typeof getProductDetail>>;
  try { d = await getProductDetail(actor, id); } catch (error) { if (error instanceof DomainError) notFound(); throw error; }
  if (!can(actor, "catalog:manage")) return <Notice tone="amber" title="Not permitted">Your role cannot edit catalogue records.</Notice>;
  const pack = d.packaging.find((p) => p.active) ?? d.packaging[0];
  return <>
    <PageHeader eyebrow={<Link href={`/app/products/${id}`}>{d.product.name}</Link>} title="Edit product" description="Permanent product and manufacturer codes cannot change. Packaging changes create a new version while existing batches retain their original snapshot." />
    <Card className="max-w-3xl p-5 sm:p-7"><ActionForm action={updateProductAction} className="grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="productId" value={id} />
      <Field label="Product name"><input name="name" required defaultValue={d.product.name} className={inputClass} /></Field>
      <Field label="Variant"><input name="variant" required defaultValue={d.product.variant} className={inputClass} /></Field>
      <Field label="Category"><input name="category" required defaultValue={d.product.category} className={inputClass} /></Field>
      <Field label="Product image URL"><input name="imageUrl" defaultValue={d.product.imageUrl ?? ""} className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field label="Description"><textarea name="description" rows={4} defaultValue={d.product.description} className={inputClass} /></Field></div>
      <Field label="Shelf life (days)"><input name="shelfLifeDays" type="number" min={1} max={7300} required defaultValue={d.product.shelfLifeDays} className={inputClass} /></Field>
      <Field label="Packaging type"><input name="packagingType" required defaultValue={pack?.unitType ?? d.product.packagingType} className={inputClass} /></Field>
      <Field label="Units per carton"><input name="unitsPerCarton" type="number" min={1} max={10000} required defaultValue={pack?.unitsPerCarton ?? 1} className={inputClass} /></Field>
      <Field label="Cartons per pallet"><input name="cartonsPerPallet" type="number" min={1} max={10000} defaultValue={pack?.cartonsPerPallet ?? ""} className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field label="Manufacturing requirements"><textarea name="manufacturingRequirements" rows={3} defaultValue={d.product.manufacturingRequirements ?? ""} className={inputClass} /></Field></div>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton pendingText="Saving product…">Save product</SubmitButton></div>
    </ActionForm></Card>
  </>;
}
