"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";
import { buttonClass, cx, type ButtonVariant } from "./ui";

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingText,
  disabled,
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  pendingText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button type="submit" disabled={pending || disabled} className={cx(buttonClass(variant, size), className)}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

/**
 * Form bound to a server action; shows the returned error or success message inline.
 * Submits via onSubmit so typed values survive a failed attempt (a bare `action` prop resets the form).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
        <fieldset disabled={pending} className="contents">
          {children}
        </fieldset>
      </PendingContext.Provider>
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.message}
        </p>
      )}
    </form>
  );
}
