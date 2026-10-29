import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { qrSvg } from "@/components/label";
import { Badge, Notice, type Tone } from "@/components/ui";
import { formatCode } from "@/lib/codes";
import { formatDate } from "@/lib/dates";
import { demoSamples, type Sample } from "@/lib/demo-samples";
import { env } from "@/lib/env";
import { publicBaseUrl } from "@/lib/request-context";
import { requireActor } from "@/lib/session";
import { USSD_SERVICE_CODE } from "@/lib/ussd";

export const metadata: Metadata = { title: "Sample packs", robots: { index: false, follow: false } };

async function SampleCard(props: {
  title: string;
  expect: string;
  tone: Tone;
  how: React.ReactNode;
  url?: string | null;
  code?: string | null;
  sample?: Sample | null;
}) {
  const svg = props.url ? await qrSvg(props.url) : null;
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{props.title}</h2>
        <Badge tone={props.tone}>{props.expect}</Badge>
      </div>
      {props.sample && (
        <p className="mt-1 text-xs text-slate-500">
          {props.sample.manufacturerAlias} / {props.sample.productAlias} · {props.sample.product} · Lot {props.sample.lot} · Exp {formatDate(props.sample.expiry)}
        </p>
      )}
      <div className="mt-4 flex flex-1 flex-wrap items-center gap-5">
        {svg && props.url && (
          <a href={props.url} target="_blank" rel="noreferrer" className="block w-32 shrink-0 [&_svg]:h-auto [&_svg]:w-full" title="Scan with a phone, or click to open" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
        <div className="min-w-0 space-y-2">
          {props.code && (
            <div>
              <div className="text-xs text-slate-500">16-digit code</div>
              <div className="font-mono text-lg font-semibold tracking-wider text-slate-900 select-all">{formatCode(props.code)}</div>
            </div>
          )}
          <div className="text-sm text-slate-600">{props.how}</div>
        </div>
      </div>
    </div>
  );
}

export default async function DemoPacksPage() {
  if (!env.demoMode) notFound();
  const actor = await requireActor();
  const [d, base] = await Promise.all([demoSamples(actor), publicBaseUrl()]);
  const qr = (sample: Sample | null) => (sample ? `${base}/v/${sample.payload}` : null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sample packs for the demo</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Real codes from this deployment&apos;s demo batches. Scan a QR with a phone camera, click it to open, or type the code on the{" "}
        <Link href="/" className="font-medium text-brand-700 underline underline-offset-4">Check</Link> page or the{" "}
        <Link href="/ussd" className="font-medium text-brand-700 underline underline-offset-4">USSD simulator</Link> ({USSD_SERVICE_CODE}). The
        &ldquo;genuine&rdquo; packs are ones nobody has checked yet; once used they are replaced by fresh ones when you reload this page.
      </p>
      <div className="mt-4">
        <Notice tone="amber">Demo mode only. A real deployment never displays issued codes outside the authorised print workflow.</Notice>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {d.genuine.map((g, i) => (
          <SampleCard
            key={g.unitId}
            title={`Genuine pack ${i + 1}`}
            expect="Identity issued — no known alerts"
            tone="green"
            sample={g}
            url={qr(g)}
            code={g.code}
            how="Shows product, batch and expiry, says this is the first check, and on QR asks the buyer to compare the last 4 digits printed on the pack."
          />
        ))}
        {d.clone && (
          <SampleCard
            title="Copied code"
            expect="Possible copied code"
            tone="amber"
            sample={d.clone}
            url={qr(d.clone)}
            code={d.clone.code}
            how="This code was checked in Lagos and then in Kano minutes later — impossible for one pack — so the risk engine flagged it as copied and opened a high-severity case for the manufacturer and the regulator. Every check now warns the buyer."
          />
        )}
        {d.recalled && (
          <SampleCard
            title="Recalled batch"
            expect="Recalled — do not use"
            tone="red"
            sample={d.recalled}
            url={qr(d.recalled)}
            code={d.recalled.code}
            how="Shows the recall reason, the advice to consumers and that it was approved under dual control."
          />
        )}
        {d.expired && (
          <SampleCard
            title="Expired batch"
            expect="Expired — do not use"
            tone="red"
            sample={d.expired}
            url={qr(d.expired)}
            code={d.expired.code}
            how="A real, released code whose batch is past its expiry date."
          />
        )}
        {d.unreleased && (
          <SampleCard
            title="Label that never left the factory"
            expect="Not released"
            tone="amber"
            sample={d.unreleased}
            url={qr(d.unreleased)}
            code={d.unreleased.code}
            how="A label voided or rejected on the line. If it shows up in the market, the manufacturer's QA team gets a high-severity alert (see Alerts & cases)."
          />
        )}
        <SampleCard
          title="Made-up code"
          expect="Unable to verify"
          tone="neutral"
          code={d.fakeCode}
          how="Correct-looking format, but never issued. The answer is deliberately generic so guessers learn nothing; repeated guesses are rate-limited."
        />
        {d.forged && (
          <SampleCard
            title="Forged QR"
            expect="Unable to verify"
            tone="neutral"
            url={`${base}/v/${d.forged}`}
            how="An altered QR is rejected securely and recorded for risk monitoring."
          />
        )}
        <SampleCard
          title="Typo"
          expect="Check the code and try again"
          tone="neutral"
          code={d.genuine[0] ? d.genuine[0].code.slice(0, 15) + ((Number(d.genuine[0].code[15]) + 1) % 10) : null}
          how="Genuine code pack 1 with its last digit changed. The altered value is rejected securely."
        />
      </div>
    </div>
  );
}
