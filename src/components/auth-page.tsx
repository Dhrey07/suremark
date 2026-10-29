"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ActionState } from "@/lib/action";
import { ActionForm, SubmitButton } from "./action-form";
import { Logo } from "./brand";
import { inputClass } from "./ui";

type DemoAccount = { label: string; email: string; password: string };

export function AuthPage({
  kind,
  action,
  demoAccounts = [],
  databaseConfigured = true,
}: {
  kind: "manufacturer" | "platform";
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  demoAccounts?: DemoAccount[];
  databaseConfigured?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const platform = kind === "platform";
  const fill = (account: DemoAccount) => {
    if (emailRef.current) emailRef.current.value = account.email;
    if (passwordRef.current) passwordRef.current.value = account.password;
    emailRef.current?.focus();
  };

  return (
    <main className="min-h-dvh bg-[#f7f5ef] lg:grid lg:grid-cols-[1.08fr_.92fr]">
      <section className={`relative hidden min-h-dvh overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between xl:p-16 ${platform ? "bg-[#10261e] text-white" : "bg-[#dcefc7] text-[#10261e]"}`}>
        <Logo href="/" inverse={platform} subtitle={platform ? "Trust network operations" : "Manufacturer workspace"} />
        <div className="relative z-10 max-w-xl">
          <p className={`text-xs font-semibold uppercase tracking-[.18em] ${platform ? "text-[#b8f06a]" : "text-brand-700"}`}>{platform ? "Restricted operations" : "Make trust visible"}</p>
          <h1 className="mt-5 text-[clamp(3.5rem,6vw,6.5rem)] font-semibold leading-[.9] tracking-[-.065em]">{platform ? "Protect the network behind every check." : "Every product has a story. Make yours verifiable."}</h1>
          <p className={`mt-7 max-w-lg text-lg leading-8 ${platform ? "text-white/65" : "text-[#29483c]"}`}>{platform ? "Oversee manufacturers, identity infrastructure and verification operations from one secure workspace." : "Manage products, production runs and verification identities in one secure workspace."}</p>
        </div>
        <div className="relative grid max-w-lg grid-cols-3 gap-3" aria-hidden>
          {["Product", "Identity", "Verified"].map((label, index) => <div key={label} className={`rounded-2xl border p-4 ${platform ? "border-white/10 bg-white/5" : "border-[#10261e]/10 bg-white/45"}`}><div className={`size-2 rounded-full ${index === 2 ? "bg-[#b8f06a]" : "bg-brand-600"}`} /><div className="mt-8 text-xs font-semibold">{label}</div></div>)}
          <svg viewBox="0 0 300 28" className="absolute -top-5 left-8 w-[calc(100%-4rem)]" fill="none"><path d="M2 14h296" stroke="currentColor" strokeDasharray="3 7" opacity=".25" /></svg>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden"><Logo /><Link href="/" className="text-sm font-medium text-slate-600">Consumer check</Link></div>
          <p className="text-sm font-semibold text-brand-700">{platform ? "Platform administration" : "Manufacturer portal"}</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-[-.05em] text-slate-950">{platform ? "Secure sign in" : "Welcome back"}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{platform ? "Use your authorized platform account to continue." : "Sign in to manage your products and production."}</p>

          {!databaseConfigured && <div role="status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>Database connection required.</b><p className="mt-1">Configure the Supabase PostgreSQL connection and application secrets before signing in.</p></div>}

          <ActionForm action={action} className="mt-8 space-y-5">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Email address</span><input ref={emailRef} name="email" type="email" required autoCapitalize="none" spellCheck={false} autoComplete="username" className={inputClass} placeholder={platform ? "name@platform.com" : "you@company.com"} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span><span className="relative block"><input ref={passwordRef} name="password" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="current-password" className={`${inputClass} pr-16`} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-brand-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span></label>
            <div className="flex items-center justify-between gap-3 text-sm"><label className="flex items-center gap-2 text-slate-600"><input name="remember" type="checkbox" className="size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600" />Keep me signed in</label><Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">Forgot password?</Link></div>
            <SubmitButton disabled={!databaseConfigured} className="min-h-12 w-full text-base" pendingText="Signing in securely…">Sign in</SubmitButton>
          </ActionForm>

          {demoAccounts.length > 0 && <details className="mt-7 rounded-2xl border border-[#e6e2d8] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-900">Try a demo account</summary><p className="mt-1 text-xs leading-5 text-slate-500">Select a role to fill the form, then sign in normally.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{demoAccounts.map((account) => <button key={account.email} type="button" onClick={() => fill(account)} className="rounded-xl bg-[#f5f3ed] px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800">{account.label}</button>)}</div></details>}

          {!platform && <div className="mt-7 rounded-2xl bg-[#eef7e5] p-4 text-sm text-[#29483c]"><b className="text-[#10261e]">New manufacturer?</b><p className="mt-1">Submit your organization details for platform review.</p><Link href="/manufacturer/onboarding" className="mt-3 inline-flex font-semibold text-brand-800 hover:underline">Start an application →</Link></div>}

          <div className="mt-8 border-t border-[#e6e2d8] pt-5 text-center text-sm text-slate-500">{platform ? <>Work for a manufacturer? <Link className="font-semibold text-brand-700" href="/manufacturer/login">Manufacturer sign in</Link></> : <>Platform team? <Link className="font-semibold text-brand-700" href="/platform/login">Administration sign in</Link></>}</div>
        </div>
      </section>
    </main>
  );
}
