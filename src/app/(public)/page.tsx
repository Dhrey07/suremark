import { CodeCheck } from "@/components/code-check";
import { USSD_SERVICE_CODE } from "@/lib/ussd";
import Link from "next/link";

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="brand-grid absolute inset-y-0 right-0 hidden w-[45%] [mask-image:linear-gradient(to_left,black,transparent)] lg:block" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800">
              <span className="size-1.5 rounded-full bg-brand-500" /> No account or app needed
            </div>
            <h1 className="mt-6 max-w-3xl text-[clamp(2.8rem,7vw,5.8rem)] font-semibold leading-[.92] tracking-[-0.065em] text-[#171a18]">Know what you&apos;re buying.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Verify a product in seconds. Scan its code or enter the number printed on the packaging.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#verify" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#10261e] px-5 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#1b3b30]">Enter a code</a>
              <Link href="/ussd" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d9d5ca] bg-white px-5 font-semibold text-slate-800 transition hover:bg-[#f0eee7]">Verify with USSD</Link>
            </div>
          </div>
          <div id="verify" className="relative scroll-mt-24">
            <div className="absolute -inset-8 rounded-full bg-[#dcefc7]/70 blur-3xl" aria-hidden />
            <div className="relative rounded-[1.75rem] border border-[#dedacf] bg-white p-5 shadow-[0_24px_80px_rgba(25,45,35,0.13)] sm:p-7">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Product check</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Enter the pack code</h2></div>
                <span className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden>⌁</span>
              </div>
              <CodeCheck />
              <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs leading-5 text-slate-500">Your check helps identify unusual activity. We do not require your name or phone number.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-[#e6e2d8] bg-[#10261e] text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl">One code. Three easy ways to check.</p>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-white/15 sm:grid-cols-3">
          {[
            ["Scan the mark", "Open your phone camera and point it at the QR code."],
            ["Enter the number", "Type the 16 digits printed beside the QR code."],
            ["Use any phone", `Dial ${USSD_SERVICE_CODE} when mobile data is not available.`],
          ].map(([t, d], i) => (
            <li key={t} className="bg-[#10261e] p-6 sm:p-7">
              <div className="text-sm font-semibold text-[#b8f06a]">0{i + 1}</div>
              <h3 className="mt-5 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">{d}</p>
            </li>
          ))}
          </ol>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8 lg:py-16">
        <div><p className="text-sm font-semibold text-brand-700">Still unsure?</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Trust the result—and trust your instincts.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A valid code confirms an issued identity, not the physical pack itself. Check the seal, packaging and seller too.</p></div>
        <Link href="/report" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d9d5ca] bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-[#f0eee7]">Report something suspicious</Link>
      </section>
    </div>
  );
}
