"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function CopyButton({ value, children, variant = "secondary" }: { value: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={buttonClass(variant)} onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? "Copied" : children}</button>;
}

export function PrintButton({ children = "Print preview" }: { children?: React.ReactNode }) {
  return <button type="button" className={buttonClass("secondary")} onClick={() => window.print()}>{children}</button>;
}
