import Link from "next/link";
import { formatDate } from "@/lib/dates";
import type { VerifyResult } from "@/lib/verify";
import { cx } from "./ui";

const LOOK: Record<VerifyResult["status"], { box: string; icon: string; iconBox: string }> = {
  issued_no_known_alerts: { box: "border-emerald-300 bg-emerald-50", icon: "✓", iconBox: "bg-emerald-600 text-white" },
  suspicious: { box: "border-amber-300 bg-amber-50", icon: "!", iconBox: "bg-amber-500 text-white" },
  not_released: { box: "border-amber-300 bg-amber-50", icon: "!", iconBox: "bg-amber-500 text-white" },
  expired: { box: "border-red-300 bg-red-50", icon: "✕", iconBox: "bg-red-600 text-white" },
  recalled: { box: "border-red-300 bg-red-50", icon: "✕", iconBox: "bg-red-600 text-white" },
  unable_to_verify: { box: "border-slate-300 bg-slate-50", icon: "?", iconBox: "bg-slate-500 text-white" },
  invalid_code: { box: "border-slate-300 bg-slate-50", icon: "?", iconBox: "bg-slate-500 text-white" },
  rate_limited: { box: "border-slate-300 bg-slate-50", icon: "…", iconBox: "bg-slate-500 text-white" },
  unavailable: { box: "border-slate-300 bg-slate-50", icon: "…", iconBox: "bg-slate-500 text-white" },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function VerifyResultView({ result }: { result: VerifyResult }) {
  const look = LOOK[result.status];
  const showReport = ["suspicious", "not_released", "unable_to_verify", "recalled", "expired"].includes(result.status);
  return (
    <div className="space-y-4" aria-live="polite">
      <div className={cx("rounded-2xl border-2 p-5", look.box)}>
        <div className="flex items-start gap-4">
          <div className={cx("flex size-11 shrink-0 items-center justify-center rounded-full text-xl font-bold", look.iconBox)} aria-hidden>
            {look.icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{result.headline}</h2>
            <p className="mt-1 text-sm text-slate-700">{result.message}</p>
          </div>
        </div>
        {result.recall && (
          <div className="mt-4 rounded-xl bg-white/70 p-4 text-sm">
            <div className="font-semibold text-red-800">What to do</div>
            <p className="mt-1 text-slate-800">{result.recall.advice}</p>
            <p className="mt-2 text-xs text-slate-600">
              Reason: {result.recall.reason} · Effective {formatDate(result.recall.effectiveAt)} · Source: {result.recall.source}
            </p>
          </div>
        )}
      </div>

      {result.product && result.batch && result.manufacturer && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {result.manufacturer.alias} / {result.product.alias}
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900">
            {result.product.name} {result.product.strength}
          </div>
          <dl className="mt-3 divide-y divide-slate-100">
            <Row label="Manufacturer">{result.manufacturer.name}</Row>
            <Row label="Form / pack">
              {result.product.dosageForm} · {result.product.packSize}
            </Row>
            {result.product.nafdacRegNo && <Row label="Registration no. (declared by manufacturer)">{result.product.nafdacRegNo}</Row>}
            <Row label="Batch / lot">{result.batch.lot}</Row>
            <Row label="Manufactured">{formatDate(result.batch.manufactureDate)}</Row>
            <Row label="Expires">{formatDate(result.batch.expiryDate)}</Row>
          </dl>
          {result.codeHint && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
              The 16-digit code printed on this pack should end in <span className="font-mono font-semibold">{result.codeHint}</span>. If it does not, do
              not use the product.
            </p>
          )}
          {result.history && result.history.previousChecks > 0 && (
            <p className="mt-3 text-slate-600">
              This code has been checked {result.history.previousChecks} time{result.history.previousChecks === 1 ? "" : "s"} before
              {result.history.firstCheckedAt && <>, first on {formatDate(result.history.firstCheckedAt)}</>}
              {result.history.firstRegion && result.history.firstRegion !== "Unknown" && <> in {result.history.firstRegion}</>}. If you have just bought
              this pack and did not check it earlier, be cautious.
            </p>
          )}
          {result.history && result.history.previousChecks === 0 && result.status === "issued_no_known_alerts" && (
            <p className="mt-3 text-slate-600">This is the first time this code has been checked.</p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Assurance level: issued identity only. A matching code shows the identity was issued and released; it cannot prove that this physical pack is
        genuine. Checked {formatDate(result.checkedAt)}.
      </p>
      {showReport && (
        <Link href="/report" className="inline-flex text-sm font-medium text-brand-700 underline underline-offset-4">
          Report a suspected fake
        </Link>
      )}
    </div>
  );
}
