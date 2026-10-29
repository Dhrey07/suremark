import Link from "next/link";
import { notFound } from "next/navigation";
import { PackLabel } from "@/components/label";
import { Notice } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { getPrintJob } from "@/lib/queries";
import { publicBaseUrl } from "@/lib/request-context";
import { requireActor } from "@/lib/session";
import { getPrintLabels } from "@/lib/services/production";

const PER_PAGE = 40;

export default async function PrintSheet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const actor = await requireActor();
  let job: Awaited<ReturnType<typeof getPrintJob>>;
  try {
    job = await getPrintJob(actor, id);
  } catch (err) {
    if (err instanceof DomainError) notFound();
    throw err;
  }
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pages = Math.max(1, Math.ceil(job.job.quantity / PER_PAGE));
  let labels;
  try {
    labels = await getPrintLabels(actor, id, { offset: (page - 1) * PER_PAGE, limit: PER_PAGE });
  } catch (err) {
    if (err instanceof DomainError) return <Notice tone="amber" title="Print data unavailable">{err.message}</Notice>;
    throw err;
  }
  const base = await publicBaseUrl();
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Print sheet · {job.batch.lot} · labels {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, job.job.quantity)} of {job.job.quantity}. QR codes
          link to <span className="font-mono">{base}</span>.
        </div>
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && <Link href={`?page=${page - 1}`} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">← Prev</Link>}
          <span className="tabular text-slate-600">
            Page {page} / {pages}
          </span>
          {page < pages && <Link href={`?page=${page + 1}`} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">Next →</Link>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {labels.map((l) => (
          <PackLabel
            key={l.unitId}
            url={`${base}/v/${l.payload}`}
            code={l.code}
            index={l.labelIndex}
            manufacturerAlias={job.manufacturer.alias}
            productAlias={job.product.alias}
            productName={`${job.product.name} ${job.product.strength}`}
            lot={job.batch.lot}
            expiry={formatDate(job.batch.expiryDate)}
            state={l.state}
            cartonCode={l.cartonCode}
          />
        ))}
      </div>
    </div>
  );
}
