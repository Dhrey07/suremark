import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/brand";
import { inputClass } from "@/components/ui";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="min-h-dvh bg-[#f7f5ef] px-4 py-8"><div className="mx-auto max-w-md"><Logo /><div className="mt-16"><p className="text-sm font-semibold text-brand-700">Account recovery</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.05em] text-slate-950">Choose a new password.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Use at least 12 characters with uppercase, lowercase and a number.</p><ActionForm action={resetPasswordAction} className="mt-8 space-y-5"><input type="hidden" name="token" value={token} /><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">New password</span><input name="password" type="password" required minLength={12} autoComplete="new-password" className={inputClass} /></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Confirm password</span><input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" className={inputClass} /></label><SubmitButton className="min-h-12 w-full" pendingText="Updating password…">Update password</SubmitButton></ActionForm></div></div></main>;
}
