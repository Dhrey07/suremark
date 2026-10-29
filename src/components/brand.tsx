import Link from "next/link";

export function Logo({ href = "/", subtitle, inverse = false }: { href?: string; subtitle?: string; inverse?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600">
      <span className="flex size-9 items-center justify-center rounded-[11px] bg-[#10261e] text-[#b8f06a] shadow-sm transition group-hover:rotate-[-3deg]" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 6.5 12 4l5 2.5v5.7c0 3-2 5.7-5 6.8-3-1.1-5-3.8-5-6.8V6.5Z" />
          <path d="m9.4 11.8 1.7 1.7 3.7-4" />
          <path d="M5 8.5 3.5 10M19 8.5l1.5 1.5" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className={`block text-[15px] font-semibold tracking-[-0.02em] ${inverse ? "text-white" : "text-slate-950"}`}>Suremark</span>
        {subtitle && <span className={`block max-w-40 truncate text-[11px] ${inverse ? "text-white/55" : "text-slate-500"}`}>{subtitle}</span>}
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
