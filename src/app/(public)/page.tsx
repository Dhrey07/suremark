import { CodeCheck } from "@/components/code-check";
import { DemoRegion } from "@/components/demo-region";
import { env } from "@/lib/env";
import { demoRegion } from "@/lib/request-context";
import { USSD_SERVICE_CODE } from "@/lib/ussd";
import Link from "next/link";

export default async function Home() {
  const region = await demoRegion();
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-x-10 md:py-16">
      <div className="md:col-start-1 md:row-start-1">
        <p className="text-sm font-medium text-brand-700">Before you take it, check it</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">Check that a product&apos;s code was really issued and released.</h1>
        <p className="mt-3 max-w-xl text-slate-600">Every pack carries its own one-time identity. Check it in seconds — no app, no scratching, any phone.</p>
      </div>
      <div className="space-y-3 md:col-start-2 md:row-span-2 md:row-start-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <CodeCheck />
        </div>
        {env.demoMode && <DemoRegion current={region} />}
      </div>
      <div className="space-y-6 md:col-start-1 md:row-start-2">
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["Scan", "Point your phone camera at the QR code on the pack and open the link."],
            ["Type", "Enter the 16-digit code printed under the QR in the box on this page."],
            ["Dial", `No smartphone? Dial ${USSD_SERVICE_CODE} on any phone and enter the code.`],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-brand-700">
                {i + 1}. {t}
              </div>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </li>
          ))}
        </ol>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <div className="font-semibold text-slate-900">What a result means</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-emerald-800">Identity issued, no known alerts</span> — the code is real and was released after quality
              checks. Codes can be copied, so still check the seal, packaging and seller.
            </li>
            <li>
              <span className="font-medium text-amber-800">Caution</span> — the code was never released, or its check history suggests copying.
            </li>
            <li>
              <span className="font-medium text-red-700">Warning</span> — the batch is recalled or expired. Do not use it.
            </li>
          </ul>
        </div>
        <p className="text-sm text-slate-600">
          Something looks wrong? <Link href="/report" className="font-medium text-brand-700 underline underline-offset-4">Report a suspected fake</Link>.
        </p>
      </div>
    </div>
  );
}
