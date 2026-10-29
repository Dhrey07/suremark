import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { NG_STATES } from "@/lib/geo";
import { reportAction } from "../actions";

export const metadata: Metadata = { title: "Report a suspected fake" };

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-sm font-semibold text-brand-700">Safe, private reporting</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-slate-950">Something doesn&apos;t look right?</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
        Tell the product&apos;s compliance team what you noticed. You do not need to share your name or phone number.
      </p>
      <ActionForm action={reportAction} resetOnSuccess className="mt-8 space-y-5 rounded-2xl border border-[#e6e2d8] bg-white p-5 shadow-[0_16px_50px_rgba(25,45,35,0.08)] sm:p-7">
        <Field label="16-digit code (if the pack has one)">
          <input name="code" inputMode="numeric" autoComplete="off" className={`${inputClass} font-mono`} placeholder="0000 0000 0000 0000" />
        </Field>
        <Field label="Where did you buy it?">
          <select name="region" className={inputClass} defaultValue="">
            <option value="">Prefer not to say</option>
            {Object.entries(NG_STATES).map(([code, s]) => (
              <option key={code} value={code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What looked wrong?">
          <textarea name="description" required minLength={5} maxLength={1000} rows={4} className={inputClass} placeholder="e.g. seal broken, spelling errors, tablets a different colour" />
        </Field>
        <SubmitButton className="w-full sm:w-auto" pendingText="Sending securely…">Send report securely</SubmitButton>
      </ActionForm>
    </div>
  );
}
