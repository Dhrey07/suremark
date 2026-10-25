import Link from "next/link";

export function Logo({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-700 text-white" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z" />
          <path d="M8.5 12.2l2.4 2.3 4.6-4.8" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-slate-900">Product Check</span>
        {subtitle && <span className="block text-xs text-slate-500">{subtitle}</span>}
      </span>
    </Link>
  );
}

export function PrototypeNotice() {
  return (
    <p className="text-xs text-slate-500">
      Pitch prototype. All companies, people, products and registration numbers shown are fictional. This is not an official regulatory service.
    </p>
  );
}
