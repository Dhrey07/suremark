import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, CardHeader, PageHeader, Table, Td } from "@/components/ui";
import { BatchStatus } from "@/components/status";
import { can } from "@/lib/authz";
import { formatDate, formatDateTime } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { getProductDetail } from "@/lib/queries";
import { requireActor } from "@/lib/session";

const PAGE_SIZE = 10;

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string; from?: string; to?: string }> }) {
  const [{ id }, sp, actor] = await Promise.all([params, searchParams, requireActor()]);
  let d: Awaited<ReturnType<typeof getProductDetail>>;
  try { d = await getProductDetail(actor, id); } catch (error) { if (error instanceof DomainError) notFound(); throw error; }
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = sp.status ?? "all";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const sorted = d.batches
    .filter(({ batch }) => (!q || batch.lot.toLowerCase().includes(q)) && (status === "all" || batch.status === status) && (!from || batch.manufactureDate >= from) && (!to || batch.manufactureDate <= to))
    .sort((a, b) => sp.sort === "oldest" ? +a.batch.createdAt - +b.batch.createdAt : sp.sort === "expiry" ? a.batch.expiryDate.localeCompare(b.batch.expiryDate) : +b.batch.createdAt - +a.batch.createdAt);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pack = d.packaging.find((p) => p.active) ?? d.packaging[0];
  const pageHref = (target: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value && key !== "page") qs.set(key, value);
    qs.set("page", String(target));
    return `?${qs}`;
  };
  return <>
    <PageHeader eyebrow={<Link href="/app/products">Product catalogue</Link>} title={d.product.name} description={`${d.product.brand} · ${d.product.variant || d.product.strength}`} action={<div className="flex flex-wrap gap-2">{can(actor, "batch:create") && pack && <ButtonLink href={`/app/products/${id}/batches/new`}>Create batch</ButtonLink>}<ButtonLink href="#batches" variant="secondary">View batches</ButtonLink></div>} />
    <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="overflow-hidden">
        {d.product.imageUrl ? <img src={d.product.imageUrl} alt={d.product.name} className="h-64 w-full bg-[#f4f8ef] object-contain p-6" /> : <div className="flex h-64 items-center justify-center bg-[#eef7e5] font-mono text-4xl font-bold text-[#10261e]">{d.product.alias}</div>}
        <div className="p-5"><div className="flex flex-wrap gap-2"><Badge tone={d.product.status === "approved" ? "green" : "amber"}>{d.product.status}</Badge><Badge tone={d.product.regulatoryStatus.includes("verified") ? "green" : d.product.regulatoryStatus === "simulated_match" ? "violet" : "amber"}>{d.product.regulatoryStatus.replaceAll("_", " ")}</Badge></div><p className="mt-4 text-sm leading-6 text-slate-600">{d.product.description}</p></div>
      </Card>
      <Card>
        <CardHeader title="Product & regulatory record" description="Permanent identity, packaging and provenance" />
        <dl className="grid gap-px bg-slate-100 sm:grid-cols-2">
          {[
            ["Manufacturer", d.manufacturer.legalName], ["Manufacturer prefix", d.manufacturer.alias], ["Product family", d.family?.name ?? d.product.brand], ["Variant", d.product.variant || d.product.strength], ["Product code", d.product.alias], ["NAFDAC registration", d.product.nafdacRegNo ?? "Not submitted"], ["Regulatory status", d.product.regulatoryStatus.replaceAll("_", " ")], ["Regulatory source", d.product.regulatorySource ?? "—"], ["Packaging", `${d.product.packagingType} · ${d.product.netQuantity} ${d.product.measurementUnit}`], ["Units per carton", pack?.unitsPerCarton?.toLocaleString() ?? "—"], ["Created", formatDateTime(d.product.createdAt)], ["Created by", `${d.creatorName ?? "Unknown"}${d.creatorTitle ? ` · ${d.creatorTitle}` : ""}`],
          ].map(([key, value]) => <div key={key} className="bg-white px-5 py-3"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{key}</dt><dd className={`mt-1 text-sm font-semibold text-slate-900 ${key.includes("code") || key.includes("prefix") ? "font-mono" : ""}`}>{value}</dd></div>)}
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5">{can(actor, "batch:create") && <ButtonLink href={`/app/products/${id}/batches/new`}>Create batch</ButtonLink>}<ButtonLink href="#batches" variant="secondary">View batches</ButtonLink>{can(actor, "catalog:manage") && <ButtonLink href={`/app/products/${id}/edit`} variant="ghost">Edit product</ButtonLink>}<ButtonLink href="/app/audit" variant="ghost">Verification activity</ButtonLink></div>
      </Card>
    </div>
    <Card id="batches" className="mt-6 scroll-mt-5">
      <CardHeader title="Production batches" description={`${sorted.length} batch${sorted.length === 1 ? "" : "es"} for this product`} action={can(actor, "batch:create") && <ButtonLink href={`/app/products/${id}/batches/new`} size="sm">New batch</ButtonLink>} />
      <form className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-8">
        <input name="q" defaultValue={sp.q} placeholder="Search batch reference" className="min-h-10 rounded-xl border border-[#d9d5ca] px-3 text-sm lg:col-span-2" />
        <select name="status" defaultValue={status} className="min-h-10 rounded-xl border border-[#d9d5ca] px-3 text-sm"><option value="all">All statuses</option>{["draft","allocation_pending","allocated","reconciled","released","recalled"].map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select>
        <input type="date" name="from" defaultValue={from} aria-label="Manufactured from" className="min-h-10 rounded-xl border border-[#d9d5ca] px-3 text-sm" />
        <input type="date" name="to" defaultValue={to} aria-label="Manufactured to" className="min-h-10 rounded-xl border border-[#d9d5ca] px-3 text-sm" />
        <select name="sort" defaultValue={sp.sort ?? "newest"} className="min-h-10 rounded-xl border border-[#d9d5ca] px-3 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="expiry">Expiry date</option></select>
        <button className="rounded-xl bg-[#10261e] px-4 text-sm font-semibold text-white">Apply filters</button>
      </form>
      {rows.length ? <Table head={["Batch", "Manufactured", "Packaging", "Unit codes", "Printing", "QA / release", "Created by"]}>{rows.map(({ batch, creatorName }) => <tr key={batch.id} className="cursor-pointer hover:bg-[#f8faf5]">
        <Td><Link href={`/app/batches/${batch.id}`} className="font-mono font-semibold text-brand-800">{batch.lot}</Link><div className="mt-1 text-xs text-slate-500">{d.product.variant || d.product.strength}</div></Td>
        <Td><div>{formatDate(batch.manufactureDate)}</div><div className="text-xs text-slate-500">Expires {formatDate(batch.expiryDate)}</div></Td>
        <Td><div>{batch.cartonCount ?? 0} cartons × {batch.unitsPerCarton ?? "—"}</div><div className="text-xs text-slate-500">{batch.looseUnits} loose · {batch.plannedQuantity} total</div></Td>
        <Td className="tabular font-semibold">{(d.unitCounts[batch.id] ?? 0).toLocaleString()}</Td>
        <Td><Badge tone={batch.status === "draft" || batch.status === "allocation_pending" ? "amber" : "green"}>{batch.status === "allocated" ? "In production" : batch.status === "draft" ? "Not started" : "Recorded"}</Badge></Td>
        <Td><BatchStatus status={batch.status} /></Td>
        <Td><div>{batch.createdByName || creatorName}</div><div className="text-xs text-slate-500">{formatDate(batch.createdAt)}</div></Td>
      </tr>)}</Table> : <div className="p-8 text-center text-sm text-slate-500">No batches match these filters.</div>}
      {pages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm"><span>Page {page} of {pages}</span><div className="flex gap-2">{page > 1 && <Link className="rounded-lg border px-3 py-1.5" href={pageHref(page - 1)}>Previous</Link>}{page < pages && <Link className="rounded-lg border px-3 py-1.5" href={pageHref(page + 1)}>Next</Link>}</div></div>}
    </Card>
  </>;
}
