import Link from "next/link";
import { Logo, PrototypeNotice } from "@/components/brand";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative z-20 border-b border-[#e6e2d8] bg-[#fbfaf6]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Logo />
          <nav aria-label="Public navigation" className="flex items-center gap-2 text-sm text-slate-600 sm:gap-5">
            <Link href="/ussd" className="hidden hover:text-slate-950 sm:block">Use USSD</Link>
            <Link href="/report" className="hidden hover:text-slate-950 sm:block">Report a product</Link>
            {env.demoMode && (
              <Link href="/demo" className="hidden hover:text-slate-950 md:block">Try a sample</Link>
            )}
            <Link href="/manufacturer/login" className="rounded-xl bg-[#10261e] px-3.5 py-2 font-medium text-white transition hover:bg-[#1b3b30]">Business sign in</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[#e6e2d8] bg-[#fbfaf6]">
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-700">
            <Link href="/manufacturer/login">Manufacturer Portal</Link>
            <Link href="/platform/login">Platform Administration</Link>
          </div>
          <PrototypeNotice />
        </div>
      </footer>
    </div>
  );
}
