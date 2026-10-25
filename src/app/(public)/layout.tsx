import Link from "next/link";
import { Logo, PrototypeNotice } from "@/components/brand";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <Link href="/" className="hover:text-slate-900">Check</Link>
            <Link href="/ussd" className="hover:text-slate-900">USSD</Link>
            <Link href="/report" className="hover:text-slate-900">Report</Link>
            {env.demoMode && (
              <Link href="/demo" className="hover:text-slate-900">Sample packs</Link>
            )}
            <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-6">
          <PrototypeNotice />
          <p className="text-xs text-slate-500">
            Independent verification: public signing keys at <Link href="/api/v1/keys" className="underline">/api/v1/keys</Link>.
          </p>
        </div>
      </footer>
    </div>
  );
}
