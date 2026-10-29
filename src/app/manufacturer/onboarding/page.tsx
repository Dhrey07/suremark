import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/brand";
import { Field, inputClass, Notice } from "@/components/ui";
import { isDatabaseConfigured } from "@/db";
import { NG_STATES } from "@/lib/geo";
import { submitManufacturerApplicationAction } from "./actions";

export default function ManufacturerOnboardingPage() {
  const databaseConfigured = isDatabaseConfigured();
  const states = Object.entries(NG_STATES).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  return (
    <main className="min-h-dvh bg-[#f7f5ef] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4"><Logo subtitle="Manufacturer onboarding" /><Link href="/manufacturer/login" className="text-sm font-semibold text-brand-700">Sign in</Link></div>
        <div className="mt-12 rounded-3xl border border-[#e6e2d8] bg-white p-6 shadow-[0_20px_60px_rgba(25,45,35,.08)] sm:p-10">
          <p className="text-sm font-semibold text-brand-700">Join the trust network</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-.05em] text-slate-950">Register your manufacturer.</h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-600">Submit the legal organization and authorized representative details used for platform review. Production access remains locked until the application is approved.</p>
          {!databaseConfigured && <div className="mt-6"><Notice tone="amber" title="Database connection required">The application can be submitted after the Supabase PostgreSQL connection is configured.</Notice></div>}
          <ActionForm action={submitManufacturerApplicationAction} className="mt-9 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">Organization details</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Legal company name"><input className={inputClass} name="legalName" required maxLength={180} autoComplete="organization" /></Field></div>
                <Field label="Registration number"><input className={inputClass} name="rcNumber" required maxLength={80} /></Field>
                <Field label="Sector"><input className={inputClass} name="sector" required maxLength={100} placeholder="Pharmaceuticals" /></Field>
                <Field label="Headquarters state"><select className={inputClass} name="hqState" required defaultValue=""><option value="" disabled>Select a state</option>{states.map(([code, state]) => <option value={code} key={code}>{state.name}</option>)}</select></Field>
                <div className="sm:col-span-2 rounded-xl bg-[#eef7e5] px-4 py-3 text-sm text-[#29483c]"><b className="text-[#10261e]">Manufacturer prefix is assigned automatically.</b> It becomes permanent after registration and is never reused.</div>
              </div>
            </section>
            <section className="border-t border-slate-100 pt-7">
              <h2 className="text-lg font-semibold text-slate-950">Authorized representative</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field label="Full name"><input className={inputClass} name="ownerName" required maxLength={140} autoComplete="name" /></Field>
                <Field label="Job title"><input className={inputClass} name="ownerTitle" required maxLength={120} autoComplete="organization-title" /></Field>
                <div className="sm:col-span-2"><Field label="Work email"><input className={inputClass} name="ownerEmail" type="email" required maxLength={254} autoComplete="email" /></Field></div>
                <Field label="Password" hint="At least 12 characters"><input className={inputClass} name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>
                <Field label="Confirm password"><input className={inputClass} name="passwordConfirmation" type="password" required minLength={12} autoComplete="new-password" /></Field>
              </div>
            </section>
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-600"><input type="checkbox" required className="mt-1 size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600" /><span>I confirm that I am authorized to submit these organization details for verification.</span></label>
            <div className="flex flex-wrap items-center gap-4"><SubmitButton disabled={!databaseConfigured} className="min-h-12 px-6" pendingText="Submitting application…">Submit application</SubmitButton><span className="text-sm text-slate-500">Already registered? <Link className="font-semibold text-brand-700" href="/manufacturer/login">Sign in</Link></span></div>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
