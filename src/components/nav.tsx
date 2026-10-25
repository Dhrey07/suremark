"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; badge?: number };

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {items.map((item) => {
        const active = item.href === path || (item.href !== "/app" && item.href !== "/platform" && path.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {item.label}
            {!!item.badge && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
