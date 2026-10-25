"use client";

import { useActionState } from "react";
import { checkCodeAction } from "@/app/(public)/actions";
import { SubmitButton } from "./action-form";
import { VerifyResultView } from "./verify-result";

export function CodeCheck() {
  const [state, action] = useActionState(checkCodeAction, {});
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-3">
        <label htmlFor="code" className="block text-sm font-medium text-slate-700">
          16-digit code printed under the QR
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0000 0000 0000 0000"
          maxLength={24}
          required
          className="block w-full rounded-xl border-0 bg-white px-4 py-3.5 text-center font-mono text-xl tracking-widest text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-300 focus:ring-2 focus:ring-brand-600"
        />
        <SubmitButton className="w-full py-3 text-base" pendingText="Checking…">
          Check code
        </SubmitButton>
      </form>
      {state.result && <VerifyResultView result={state.result} />}
    </div>
  );
}
