"use client";

import { useTransition } from "react";
import { setDemoRegionAction } from "@/app/(public)/actions";
import { NG_STATES } from "@/lib/geo";

/** Demo-only: lets the presenter simulate where a check happens (normally derived from network location). */
export function DemoRegion({ current }: { current: string | null }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
      <span className="font-semibold">Demo · simulate check location</span>
      <select
        defaultValue={current ?? ""}
        disabled={pending}
        onChange={(e) => start(() => setDemoRegionAction(e.target.value))}
        className="rounded-md border-0 bg-white py-1 pl-2 pr-7 text-xs ring-1 ring-violet-200"
      >
        <option value="">Use network location</option>
        {Object.entries(NG_STATES).map(([code, s]) => (
          <option key={code} value={code}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
