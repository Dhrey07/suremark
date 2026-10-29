import { signOutAction } from "@/app/login/actions";
import type { Actor } from "@/lib/authz";
import { Logo } from "./brand";
import { SideNav, type NavItem } from "./nav";

export function Shell({ actor, items, context, children }: { actor: Actor; items: NavItem[]; context: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f5ef] lg:grid lg:grid-cols-[17.5rem_1fr]">
      <aside className="border-b border-[#e6e2d8] bg-[#fbfaf6] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <Logo href="/" subtitle={context} />
        </div>
        <div className="px-3 pb-3 lg:flex-1 lg:overflow-y-auto lg:px-4">
          <SideNav items={items} />
        </div>
        <div className="hidden border-t border-[#e6e2d8] px-5 py-5 lg:block">
          <div className="truncate text-sm font-medium text-slate-900">{actor.name}</div>
          <div className="truncate text-xs text-slate-500">{actor.title ?? actor.email}</div>
          <form action={signOutAction} className="mt-3">
            <button className="text-xs font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 border-b border-[#e6e2d8] bg-white/90 px-4 py-2 backdrop-blur lg:hidden">
          <span className="truncate text-sm text-slate-700">{actor.name}</span>
          <form action={signOutAction}>
            <button className="text-xs font-medium text-slate-600 underline underline-offset-4">Sign out</button>
          </form>
        </div>
        <main className="mx-auto max-w-[82rem] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
