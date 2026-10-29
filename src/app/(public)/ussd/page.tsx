import type { Metadata } from "next";
import { USSD_SERVICE_CODE } from "@/lib/ussd";
import { Phone } from "./phone";

export const metadata: Metadata = { title: "USSD simulator" };

export default function UssdPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[1fr_auto] md:items-center lg:px-8">
      <div className="max-w-xl space-y-5">
        <p className="text-sm font-semibold text-brand-700">No mobile data needed</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-[-0.05em] text-slate-950">Check a product from any phone.</h1>
        <p className="text-lg leading-8 text-slate-600">
          Dial {USSD_SERVICE_CODE}, choose “Verify product”, then enter the 16-digit number on the pack.
        </p>
        <div className="rounded-2xl border border-[#e6e2d8] bg-white p-5 text-sm leading-6 text-slate-600"><b className="text-slate-950">This is a working simulation.</b> It uses the same verification checks as the website. The shortcode is a placeholder until a licensed telecom provider provisions the live service.</div>
      </div>
      <Phone serviceCode={USSD_SERVICE_CODE} />
    </div>
  );
}
