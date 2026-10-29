"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; badge?: number; section?: string };

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
      {items.map((item, index) => {
        const active = item.href === path || (item.href !== "/app" && item.href !== "/platform" && path.startsWith(item.href));
        return (
          <div key={item.href} className="contents lg:block">
            {item.section && (index === 0 || items[index - 1].section !== item.section) && <div className="hidden px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 first:pt-1 lg:block">{item.section}</div>}
            <Link href={item.href} aria-current={active ? "page" : undefined} className={cx(
                "flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                active ? "bg-[#10261e] text-white shadow-sm" : "text-slate-600 hover:bg-[#eeece5] hover:text-slate-950",
              )}>
              {item.label}
              {!!item.badge && <span className={cx("min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold", active ? "bg-[#b8f06a] text-[#10261e]" : "bg-amber-100 text-amber-800")}>{item.badge}</span>}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
