import React, { useCallback, useEffect, useRef, useState } from "react";
import { History, LoaderCircle } from "lucide-react";
import { describeError, getClient } from "./api-client.ts";
import { relativeAge, timeOfDay } from "./shell/format.ts";
import type { HistoryEntry } from "./types.ts";

type Load = { status: "idle" | "loading" | "ready" | "error"; entries: HistoryEntry[]; error: string | null };

export const HistoryMenu: React.FC<{ onRestore: (entry: HistoryEntry) => Promise<void> }> = ({ onRestore }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Load>({ status: "idle", entries: [], error: null });
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const entries = await getClient().history();
      setState({ status: "ready", entries: Array.isArray(entries) ? entries : [], error: null });
    } catch (error) {
      setState({ status: "error", entries: [], error: describeError(error) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setConfirm(null); } };

    const onKey = (e: KeyboardEvent) => { if (e.code === "Escape") { e.stopPropagation(); setOpen(false); setConfirm(null); } };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [open, load]);

  const restore = async (entry: HistoryEntry) => {
    setBusy(true);
    try { await onRestore(entry); setOpen(false); setConfirm(null); } finally { setBusy(false); }
  };
  const now = Date.now();

  return (
    <div className="rv-menu" ref={box}>
      <button type="button" className={`rv-btn${open ? " on" : ""}`} aria-expanded={open} aria-haspopup="menu" title="النسخ اللي اتسجّلت قبل كده" onClick={() => setOpen((v) => !v)}>
        <History size={16} /><span>السجل</span>
      </button>
      {open ? (
        <div className="rv-popover" role="menu" dir="rtl">
          <div className="rv-popover-head">النسخ السابقة <span className="rv-dim">(الأحدث فوق)</span></div>
          {state.status === "loading" ? <div className="rv-popover-note"><LoaderCircle size={14} className="rv-spin" /> بنجيب السجل…</div> : null}
          {state.status === "error" ? <div className="rv-popover-note bad">السجل مش متاح دلوقتي: {state.error}<button type="button" onClick={() => void load()}>حاول تاني</button></div> : null}
          {state.status === "ready" && state.entries.length === 0 ? <div className="rv-popover-note">مفيش نسخ سابقة لسه. أول ما تسجّل تاني هتظهر هنا.</div> : null}
          <ul>
            {state.entries.map((entry) => {
              const at = Date.parse(entry.savedAt);
              const asking = confirm?.file === entry.file;
              return (
                <li key={entry.file} className={asking ? "asking" : ""}>
                  <button type="button" role="menuitem" disabled={busy} onClick={() => setConfirm(asking ? null : entry)}>
                    <span dir="ltr" className="rv-hist-time">{Number.isFinite(at) ? `${new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })} ${timeOfDay(at)}` : entry.savedAt}</span>
                    <span className="rv-dim">{Number.isFinite(at) ? relativeAge(at, now) : ""}</span>
                    {entry.label ? <span className="rv-hist-label">{entry.label}</span> : null}
                  </button>
                  {asking ? (
                    <div className="rv-hist-confirm">
                      هنحمّل النسخة دي مكان اللي قدامك. تقدر تتراجع عنها بـ Ctrl+Z، ومفيش حاجة بتتسجّل على الديسك غير لما تضغط حفظ.
                      <div>
                        <button type="button" className="primary" disabled={busy} onClick={() => void restore(entry)}>{busy ? "بيحمّل…" : "استرجع النسخة دي"}</button>
                        <button type="button" onClick={() => setConfirm(null)}>لأ</button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
