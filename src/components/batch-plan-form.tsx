"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action";

type Option = { productId: string; packagingId: string; label: string; unitsPerCarton: number };

export function BatchPlanForm({ action, options, lines, today, lotSuggestion }: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  options: Option[];
  lines: { id: string; label: string }[];
  today: string;
  lotSuggestion: string;
}) {
  const [selected, setSelected] = useState(options[0]?.packagingId ?? "");
  const [batchCount, setBatchCount] = useState(2);
  const [cartonCount, setCartonCount] = useState(10);
  const packaging = options.find((o) => o.packagingId === selected) ?? options[0];
  const totals = useMemo(() => {
    const unitsPerBatch = (packaging?.unitsPerCarton ?? 0) * cartonCount;
    return { unitsPerBatch, cartons: cartonCount * batchCount, units: unitsPerBatch * batchCount };
  }, [packaging, cartonCount, batchCount]);

  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Approved product & packaging" hint="Packaging is versioned and copied into every batch record.">
          <select name="productPackaging" required className={inputClass} value={packaging ? `${packaging.productId}|${packaging.packagingId}` : ""} onChange={(e) => setSelected(e.target.value.split("|")[1] ?? "") }>
            {options.map((o) => <option key={o.packagingId} value={`${o.productId}|${o.packagingId}`}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Production line"><select name="lineId" required className={inputClass}>{lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></Field>
      </div>
      <Field label="Lot prefix" hint="Each batch receives -01, -02, and so on."><input name="lotPrefix" required defaultValue={lotSuggestion} className={`${inputClass} font-mono uppercase`} /></Field>
      <Field label="Number of batches"><input name="batchCount" type="number" min={1} max={20} required value={batchCount} onChange={(e) => setBatchCount(Number(e.target.value))} className={inputClass} /></Field>
      <Field label="Cartons per batch"><input name="cartonCount" type="number" min={1} max={10000} required value={cartonCount} onChange={(e) => setCartonCount(Number(e.target.value))} className={inputClass} /></Field>
      <Field label="Units per carton"><input readOnly value={packaging?.unitsPerCarton ?? 0} className={`${inputClass} bg-slate-50`} /></Field>
      <Field label="Manufacturing date"><input name="manufactureDate" type="date" required defaultValue={today} className={inputClass} /></Field>
      <Field label="Expiry date"><input name="expiryDate" type="date" required defaultValue={`${Number(today.slice(0, 4)) + 1}${today.slice(4)}`} className={inputClass} /></Field>
      <div className="sm:col-span-2"><Field label="Production notes"><textarea name="productionNotes" className={`${inputClass} min-h-20`} defaultValue="Scheduled PET bottling run; standard line clearance and in-process controls apply." /></Field></div>
      <div className="sm:col-span-2">
        <Notice tone="blue" title="Production plan calculated from packaging">
          {batchCount.toLocaleString()} batches × {cartonCount.toLocaleString()} cartons × {(packaging?.unitsPerCarton ?? 0).toLocaleString()} units = <strong>{totals.units.toLocaleString()} unit identities</strong> across <strong>{totals.cartons.toLocaleString()} carton identities</strong>. Each batch contains {totals.unitsPerBatch.toLocaleString()} units.
        </Notice>
      </div>
      <div className="sm:col-span-2"><SubmitButton pendingText="Creating production plan…">Create batches</SubmitButton></div>
    </ActionForm>
  );
}
