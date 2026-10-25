"use client";

import { useEffect, useRef, useState } from "react";
import { VerifyResultView } from "@/components/verify-result";
import type { VerifyResult } from "@/lib/verify";
import { checkQrAction } from "../../actions";

/**
 * The check runs from the browser after load, never on the GET itself, so link previews and
 * crawlers that open the URL do not register as consumer scans.
 */
export function QrCheck({ payload }: { payload: string }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    checkQrAction(payload).then(setResult, () =>
      setResult({
        status: "unavailable",
        assurance: "identity_only",
        headline: "Verification temporarily unavailable",
        message: "We cannot check codes right now. This is not a confirmation either way — please try again shortly.",
        checkedAt: new Date().toISOString(),
      }),
    );
  }, [payload]);

  if (!result) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm" role="status">
        <span className="size-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
        Checking this pack&apos;s code…
      </div>
    );
  }
  return <VerifyResultView result={result} />;
}
