import type { Metadata } from "next";
import { USSD_SERVICE_CODE } from "@/lib/ussd";
import { Phone } from "./phone";

export const metadata: Metadata = { title: "USSD simulator" };

export default function UssdPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1fr_auto]">
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Check from any phone with USSD</h1>
        <p className="text-slate-600">
          Many consumers use basic phones without data. In production, a licensed USSD aggregator forwards each session on {USSD_SERVICE_CODE} to the
          platform. This simulator sends exactly those callbacks — signed with the aggregator&apos;s shared secret — to the same adapter, so the answer
          is identical to what a real handset would show.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Same verification engine and risk checks as QR and web.</li>
          <li>Short responses that fit the 182-character USSD screen.</li>
          <li>Stateless menu, so network retries and duplicate sessions are safe.</li>
          <li>Phone numbers are stored only as keyed digests for rate limiting and scan patterns.</li>
        </ul>
        <p className="text-xs text-slate-500">The shortcode {USSD_SERVICE_CODE} is a placeholder; a real code is assigned by the operator.</p>
      </div>
      <Phone serviceCode={USSD_SERVICE_CODE} />
    </div>
  );
}
