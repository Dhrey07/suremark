"use client";

import { useState } from "react";

const BLUE = "#2a78d6";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const MUTED = "#898781";

type Tip = { x: number; y: number; title: string; value: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <div className="font-semibold text-slate-900">{tip.value}</div>
      <div className="text-slate-500">{tip.title}</div>
    </div>
  );
}

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n);
}

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Single-series daily columns with a per-column hover/focus tooltip and a table fallback. */
export function DailyColumns({ data, label }: { data: { date: string; label: string; value: number }[]; label: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const W = 640;
  const H = 180;
  const pad = { l: 32, r: 8, t: 8, b: 22 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const band = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(24, Math.max(4, band - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label} onPointerLeave={() => setTip(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED} className="tabular">
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * band + (band - bw) / 2;
          const top = y(d.value);
          const h = y(0) - top;
          const r = Math.min(4, h);
          const show = (e: { currentTarget: SVGGElement }) => {
            const svg = e.currentTarget.ownerSVGElement!;
            const box = svg.getBoundingClientRect();
            const scale = box.width / W;
            setTip({ x: (x + bw / 2) * scale, y: top * scale, title: d.label, value: `${d.value.toLocaleString()} checks` });
          };
          return (
            <g key={d.date} tabIndex={0} onPointerEnter={show} onFocus={show} onBlur={() => setTip(null)} className="outline-none">
              <rect x={pad.l + i * band} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`}
                  fill={BLUE}
                  opacity={tip && tip.title !== d.label ? 0.55 : 1}
                />
              )}
              {(i === 0 || i === data.length - 1 || (i % 7 === 0 && data.length - 1 - i >= 4)) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="tabular mt-2 w-full max-w-xs">
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-b border-slate-100">
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right">{d.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Horizontal bars with the value at the tip; optional per-row color for status breakdowns. */
export function BarList({ rows, unit }: { rows: { key: string; label: string; value: number; color?: string; tag?: string }[]; unit: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2" onPointerLeave={() => setHover(null)}>
      {rows.map((r) => (
        <li
          key={r.key}
          tabIndex={0}
          onPointerEnter={() => setHover(r.key)}
          onFocus={() => setHover(r.key)}
          onBlur={() => setHover(null)}
          title={`${r.label}: ${r.value.toLocaleString()} ${unit}`}
          className="grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3 rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <span className="truncate text-sm text-slate-700">
            {r.tag && <span className="mr-1.5 font-semibold">{r.tag}</span>}
            {r.label}
          </span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px] transition-opacity"
              style={{
                width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 85)}%`,
                background: r.color ?? BLUE,
                opacity: hover && hover !== r.key ? 0.5 : 1,
              }}
            />
            <span className="tabular text-xs font-medium text-slate-700">{r.value.toLocaleString()}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
