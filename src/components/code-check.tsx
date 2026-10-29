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
          16-digit product code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0000 0000 0000 0000"
          maxLength={19}
          required
          onInput={(event) => {
            const input = event.currentTarget;
            input.value = input.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
          }}
          aria-describedby="code-hint"
          className="block min-h-16 w-full rounded-2xl border-0 bg-[#f8f7f2] px-4 py-4 text-center font-mono text-xl tracking-[0.14em] text-slate-950 ring-1 ring-inset ring-[#d9d5ca] placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-brand-600 sm:text-2xl"
        />
        <p id="code-hint" className="text-xs text-slate-500">Spaces are added automatically. You can paste the full number.</p>
        <SubmitButton className="w-full py-3.5 text-base" pendingText="Checking product…">
          Verify product
        </SubmitButton>
      </form>
      {state.result && <VerifyResultView result={state.result} />}
    </div>
  );
}
