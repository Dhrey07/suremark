"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function ProductBatchForm({
  action,
  product,
  packaging,
  lines,
  today,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  product: { id: string; name: string; alias: string; manufacturerPrefix: string };
  packaging: { id: string; unitsPerCarton: number; unitType: string; version: number };
  lines: { id: string; label: string }[];
  today: string;
}) {
  const [cartons, setCartons] = useState(10);
  const [loose, setLoose] = useState(0);
  const total = useMemo(() => Math.max(0, cartons) * packaging.unitsPerCarton + Math.max(0, loose), [cartons, loose, packaging.unitsPerCarton]);
  const expiry = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  return (
    <ActionForm action={action} className="grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="packagingVersionId" value={packaging.id} />
      <div className="sm:col-span-2 rounded-2xl bg-[#eef7e5] p-4">
        <div className="text-xs font-semibold uppercase tracking-[.14em] text-[#54705f]">Selected product</div>
        <div className="mt-1 text-lg font-semibold text-[#10261e]">{product.name}</div>
        <div className="mt-1 font-mono text-sm text-[#365448]">{product.manufacturerPrefix} / {product.alias} · packaging v{packaging.version}</div>
      </div>
      <div className="sm:col-span-2"><Field label="Factory & production line"><select name="lineId" required className={inputClass}>{lines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}</select></Field></div>
      <Field label="Batch reference (optional)" hint="Leave blank to generate a permanent collision-safe reference."><input name="lot" className={`${inputClass} font-mono uppercase`} placeholder={`${product.manufacturerPrefix}-${product.alias}-YYYYMMDD-001`} /></Field>
      <Field label="Packaging configuration"><input readOnly value={`${packaging.unitsPerCarton} ${packaging.unitType}s per carton`} className={`${inputClass} bg-slate-50`} /></Field>
      <Field label="Manufacturing date"><input name="manufactureDate" type="date" required defaultValue={today} className={inputClass} /></Field>
      <Field label="Expiry date"><input name="expiryDate" type="date" required defaultValue={expiry} className={inputClass} /></Field>
      <Field label="Number of cartons"><input name="cartonCount" type="number" min={0} max={10000} required value={cartons} onChange={(e) => setCartons(Number(e.target.value))} className={inputClass} /></Field>
      <Field label="Loose individual units"><input name="looseUnits" type="number" min={0} max={5000} required value={loose} onChange={(e) => setLoose(Number(e.target.value))} className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field label="Production notes"><textarea name="productionNotes" rows={3} className={inputClass} placeholder="Line clearance, planned controls, or production context" /></Field></div>
      <div className="sm:col-span-2">
        <Notice tone="blue" title="Confirm identity plan">
          {cartons.toLocaleString()} cartons × {packaging.unitsPerCarton.toLocaleString()} units + {loose.toLocaleString()} loose units = <strong>{total.toLocaleString()} individual identities</strong>. The batch will expect <strong>{Math.max(0, cartons).toLocaleString()} carton identities</strong> and <strong>{total.toLocaleString()} unique unit identities</strong> after maker-checker approval.
        </Notice>
      </div>
      <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-[#d9d5ca] bg-white p-4 text-sm text-slate-700">
        <input name="confirm" value="yes" type="checkbox" required className="mt-0.5 size-4 rounded border-slate-300" />
        I confirm the selected product, site, dates and quantities. Creating the batch is permanent; identities are generated only after a separate approval.
      </label>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton pendingText="Creating batch…">Create production batch</SubmitButton></div>
    </ActionForm>
  );
}
