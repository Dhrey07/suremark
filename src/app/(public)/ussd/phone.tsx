"use client";

import { useState, useTransition } from "react";
import { ussdSimulateAction } from "../actions";

export function Phone({ serviceCode }: { serviceCode: string }) {
  const [phone, setPhone] = useState("+2348031234567");
  const [session, setSession] = useState<{ id: string; text: string } | null>(null);
  const [screen, setScreen] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();

  const ended = screen?.startsWith("END") ?? false;
  const display = screen?.replace(/^(CON|END) /, "") ?? "";

  function send(text: string, id: string) {
    start(async () => {
      const reply = await ussdSimulateAction(id, phone, text);
      setScreen(reply);
      setSession({ id, text });
      setInput("");
    });
  }

  function dial() {
    send("", crypto.randomUUID());
  }

  function reply() {
    if (!session || !input.trim()) return;
    const describing = session.text.startsWith("2*") && session.text.split("*").length === 2;
    const value = input.trim().replace(/\*/g, "").replace(/\s+/g, describing ? " " : "");
    send(session.text ? `${session.text}*${value}` : value, session.id);
  }

  function hangUp() {
    setSession(null);
    setScreen(null);
    setInput("");
  }

  return (
    <div className="mx-auto w-72 rounded-[2.5rem] border-[10px] border-slate-800 bg-slate-800 shadow-xl">
      <div className="rounded-[1.8rem] bg-slate-100 p-4">
        <div className="mb-3 text-center text-[10px] font-medium uppercase tracking-widest text-slate-500">Basic phone · demo</div>
        <div className="min-h-56 rounded-lg bg-[#c9d8b6] p-3 font-mono text-[13px] leading-snug text-slate-900 shadow-inner">
          {screen === null ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-700">Number</div>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded bg-white/60 px-2 py-1 text-sm"
                aria-label="Phone number"
              />
              <div className="pt-6 text-center text-lg">{serviceCode}</div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{pending ? "Please wait…" : display}</div>
          )}
          {screen !== null && !ended && !pending && (
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && reply()}
              className="mt-3 w-full rounded bg-white/70 px-2 py-1"
              aria-label="Reply"
              inputMode="text"
            />
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {screen === null ? (
            <button onClick={dial} disabled={pending} className="col-span-2 rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {pending ? "Dialling…" : `Dial ${serviceCode}`}
            </button>
          ) : ended ? (
            <button onClick={hangUp} className="col-span-2 rounded-full bg-slate-700 py-2.5 text-sm font-semibold text-white">
              Dismiss
            </button>
          ) : (
            <>
              <button onClick={hangUp} className="rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white">
                Cancel
              </button>
              <button onClick={reply} disabled={pending} className="rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                Send
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
