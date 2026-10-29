import { CodeCheck } from "@/components/code-check";

export default function VerifyPage() {
  return <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16"><p className="text-sm font-semibold text-brand-700">Product check</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.05em] text-slate-950">Verify a product.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Enter the 16-digit number printed on the packaging. No account is required.</p><div className="mt-8 rounded-3xl border border-[#e6e2d8] bg-white p-5 shadow-[0_20px_60px_rgba(25,45,35,.08)] sm:p-7"><CodeCheck /></div></div>;
}
