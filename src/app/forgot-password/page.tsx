import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/brand";
import { inputClass } from "@/components/ui";
import { requestPasswordResetAction } from "./actions";

export default function ForgotPasswordPage() {
  return <main className="min-h-dvh bg-[#f7f5ef] px-4 py-8"><div className="mx-auto max-w-md"><Logo /><div className="mt-16"><p className="text-sm font-semibold text-brand-700">Account recovery</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.05em] text-slate-950">Reset your password.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Enter your work email. The response is identical whether or not an account exists.</p><ActionForm action={requestPasswordResetAction} className="mt-8 space-y-5"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Email address</span><input name="email" type="email" required autoComplete="email" className={inputClass} /></label><SubmitButton className="min-h-12 w-full" pendingText="Preparing reset…">Continue</SubmitButton></ActionForm></div></div></main>;
}
