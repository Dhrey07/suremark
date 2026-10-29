import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { qrSvg } from "@/components/label";
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { getUnitDetail } from "@/lib/queries";
import { publicBaseUrl } from "@/lib/request-context";
import { requireActor } from "@/lib/session";

export default async function UnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor, baseUrl] = await Promise.all([params, requireActor(), publicBaseUrl()]);
  let d: Awaited<ReturnType<typeof getUnitDetail>>;
  try { d = await getUnitDetail(actor, id); } catch (error) { if (error instanceof DomainError) notFound(); throw error; }
  const verificationUrl = d.payload ? `${baseUrl}/v/${d.payload}` : null;
  const qr = verificationUrl ? await qrSvg(verificationUrl) : null;
  return <>
    <PageHeader eyebrow={<Link href={`/app/batches/${d.batch.id}?tab=units`}>{d.batch.lot} · Cartons & Units</Link>} title={`Unit ${String(d.unit.labelIndex).padStart(4, "0")}`} description={`${d.product.name} · ${d.carton?.code ?? "Loose unit"}`} action={<ButtonLink href={`/app/batches/${d.batch.id}?tab=units`} variant="secondary">Back to batch</ButtonLink>} />
    <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="p-5 text-center">
        <div className="flex justify-center"><Badge tone={d.unit.state === "ACTIVE" ? "green" : d.unit.state === "REJECTED" || d.unit.state === "VOIDED" || d.unit.state === "RECALLED" ? "red" : "amber"}>{d.unit.state.replaceAll("_", " ")}</Badge></div>
        {qr ? <div className="mx-auto mt-5 max-w-64 rounded-2xl bg-white p-4 ring-1 ring-slate-200 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="mt-5 rounded-xl bg-slate-50 p-10 text-sm text-slate-500">Verification data is restricted for your role.</div>}
        <div className="mt-5 font-mono text-lg font-bold tracking-[.12em] text-slate-950">{d.code ? d.code.replace(/(.{4})/g, "$1 ").trim() : "Restricted"}</div>
        <div className="mt-5 grid gap-2">
          {d.code && <CopyButton value={d.code}>Copy code</CopyButton>}
          {verificationUrl && <CopyButton value={verificationUrl}>Copy verification URL</CopyButton>}
          {verificationUrl && <ButtonLink href={verificationUrl} variant="secondary">Test verification</ButtonLink>}
          <ButtonLink href={`/api/batches/${d.batch.id}/export?format=units&unitIds=${d.unit.id}`} variant="secondary">Print label PDF</ButtonLink>
        </div>
      </Card>
      <div className="space-y-6">
        <Card><CardHeader title="Unit identity" description="Registered references and lifecycle data" /><dl className="grid gap-px bg-slate-100 sm:grid-cols-2">{[
          ["Unit reference", d.unit.id], ["Label position", String(d.unit.labelIndex).padStart(4,"0")], ["Numeric verification", d.code ? d.code.replace(/(.{4})/g,"$1 ").trim() : "Restricted"], ["Manufacturer", d.manufacturer.legalName], ["Product", d.product.name], ["Batch", d.batch.lot], ["Carton", d.carton?.code ?? "Loose unit"], ["Manufactured", formatDate(d.batch.manufactureDate)], ["Expires", formatDate(d.batch.expiryDate)], ["Identity generated", formatDateTime(d.unit.issuedAt)], ["Printing status", d.unit.printedAt ? `Printed ${formatDateTime(d.unit.printedAt)}` : "Not reported printed"], ["Lifecycle status", d.unit.state.replaceAll("_"," ")],
        ].map(([key,value]) => <div key={key} className="min-w-0 bg-white px-5 py-3"><dt className="text-xs uppercase tracking-wide text-slate-500">{key}</dt><dd className={`mt-1 break-words text-sm font-semibold text-slate-900 ${key.includes("reference") || key === "Batch" || key === "Carton" ? "font-mono" : ""}`}>{value}</dd></div>)}</dl></Card>
        <Card><CardHeader title="Verification history" description={`${d.verificationHistory.length} most recent consumer checks`} />{d.verificationHistory.length ? <div className="divide-y divide-slate-100">{d.verificationHistory.map((event, index) => <div key={`${event.createdAt.toISOString()}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"><div><div className="font-medium text-slate-900">{event.outcome.replaceAll("_"," ")}</div><div className="text-xs text-slate-500">{event.channel.toUpperCase()} · {event.region ?? "Unknown region"}</div></div><div className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</div></div>)}</div> : <div className="p-5 text-sm text-slate-500">This unit has not been checked by a consumer yet.</div>}</Card>
      </div>
    </div>
  </>;
}
