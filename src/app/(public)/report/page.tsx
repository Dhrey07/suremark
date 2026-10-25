import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { NG_STATES } from "@/lib/geo";
import { reportAction } from "../actions";

export const metadata: Metadata = { title: "Report a suspected fake" };

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Report a suspected fake</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your report goes to the manufacturer&apos;s compliance team and appears in the regulator&apos;s surveillance view. We do not ask for your name
        or phone number.
      </p>
      <ActionForm action={reportAction} resetOnSuccess className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
        <SubmitButton pendingText="Sending…">Send report</SubmitButton>
      </ActionForm>
    </div>
  );
}
