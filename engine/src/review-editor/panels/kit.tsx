import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { PanelProps } from "../panels.ts";
import { useEditorStore, type ApplyFn, type ApplyOptions } from "../store.ts";
import type { OpResult } from "../ops/index.ts";
import { parseNumberText } from "./form-schema.ts";
import { fieldStep, formatNumber, initialField, type FieldEvent, type FieldState } from "./input-state.ts";







export function runOp<T extends object>(apply: ApplyFn, label: string, fn: (m: EditManifest) => OpResult<T>, options?: ApplyOptions): OpResult<T> {
  let out: OpResult<T> = { ok: false, reason: "مفيش تغيير اتعمل." };
  apply((current) => {
    out = fn(current);
    return out.ok ? out.manifest : current;
  }, label, options);
  return out;
}

export type Notice = { kind: "error" | "note" | "ok"; text: string } | null;


export function useNotice(): { notice: Notice; show: (n: Notice) => void; clear: () => void } {
  const [notice, setNotice] = useState<Notice>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setNotice(null);
  }, []);
  const show = useCallback((n: Notice) => {
    clearTimeout(timer.current);
    setNotice(n);
    if (n && n.kind !== "error") timer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { notice, show, clear };
}

export const NoticeBar: React.FC<{ notice: Notice; onClose: () => void }> = ({ notice, onClose }) =>
  notice ? (
    <div className={`pk-notice sticky ${notice.kind}`} role="status">
      <span>{notice.text}</span>
      <button type="button" className="pk-x" onClick={onClose} aria-label="إغلاق">×</button>
    </div>
  ) : null;


export function useRunner(apply: ApplyFn, show: (n: Notice) => void) {
  return useCallback(
    <T extends object>(label: string, fn: (m: EditManifest) => OpResult<T>, options?: ApplyOptions): OpResult<T> => {
      const r = runOp(apply, label, fn, options);
      if (!r.ok) show({ kind: "error", text: r.reason });
      else if (r.notes.length) show({ kind: "note", text: r.notes.join(" · ") });
      return r;
    },
    [apply, show],
  );
}



type Outcome = "ok" | "reset" | "keep";








function useField(shown: string, fire: (text: string) => Outcome): { text: string; send: (event: FieldEvent) => void } {
  const [view, setView] = useState<FieldState>(() => initialField(shown));
  const [tick, setTick] = useState(0);
  const live = useRef(view);
  const latest = useRef(fire);
  useLayoutEffect(() => { latest.current = fire; });
  const send = useCallback(function send(event: FieldEvent): void {
    const r = fieldStep(live.current, event);
    if (r.state !== live.current) {
      live.current = r.state;
      setView(r.state);
    }
    if (r.commit !== null) {
      setTick((t) => t + 1);
      const out = latest.current(r.commit);
      if (out !== "ok") send({ type: out });
    }
  }, []);


  useEffect(() => { send({ type: "shown", shown }); }, [shown, tick, send]);
  return { text: view.text, send };
}






export const NumInput: React.FC<{
  value: number;
  onCommit: (n: number) => void | boolean;
  width?: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  disabled?: boolean;
  decimals?: number;

  parse?: (text: string) => number | null;
}> = ({ value, onCommit, width = 76, min, max, label, disabled, decimals, parse = parseNumberText }) => {
  const [bad, setBad] = useState(false);
  const { text, send } = useField(formatNumber(value, decimals), (typed) => {
    const n = parse(typed);
    if (n === null || (min !== undefined && n < min) || (max !== undefined && n > max)) {
      setBad(true);
      return "keep";
    }
    setBad(false);
    if (n === value) return "reset";
    return onCommit(n) === false ? "reset" : "ok";
  });
  return (
    <input
      className={`pk-num${bad ? " bad" : ""}`}
      dir="ltr"
      inputMode="decimal"
      style={{ width }}
      value={text}
      disabled={disabled}
      aria-label={label}
      aria-invalid={bad}
      title={bad ? `لازم رقم${min !== undefined ? ` من ${min}` : ""}${max !== undefined ? ` لـ ${max}` : ""}` : label}
      onFocus={(e) => { e.currentTarget.select(); send({ type: "focus" }); }}
      onChange={(e) => { send({ type: "type", text: e.target.value }); setBad(false); }}
      onBlur={() => send({ type: "blur" })}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); send({ type: "enter", blur: true }); e.currentTarget.blur(); }
        else if (e.key === "Escape") { send({ type: "escape" }); setBad(false); e.currentTarget.blur(); }
      }}
    />
  );
};






export const TextInput: React.FC<{
  value: string;
  onCommit: (text: string) => string | null | void;
  className?: string;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onFocus?: () => void;
  label?: string;
  id?: string;
}> = ({ value, onCommit, className, placeholder, inputRef, onFocus, label, id }) => {
  const [error, setError] = useState<string | null>(null);
  const { text, send } = useField(value, (typed) => {
    const err = onCommit(typed);
    if (typeof err === "string") {
      setError(err);
      return "keep";
    }
    setError(null);
    return "ok";
  });
  return (
    <span className="pk-text-wrap">
      <input
        id={id}
        ref={inputRef}
        className={`pk-text ${className ?? ""}${error ? " bad" : ""}`}
        dir="auto"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={error !== null}
        onFocus={() => { send({ type: "focus" }); onFocus?.(); }}
        onChange={(e) => { send({ type: "type", text: e.target.value }); setError(null); }}
        onBlur={() => send({ type: "blur" })}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); send({ type: "enter", blur: false }); }
          else if (e.key === "Escape") { send({ type: "escape" }); setError(null); e.currentTarget.blur(); }
        }}
      />
      {error ? <span className="pk-err" role="alert">{error}</span> : null}
    </span>
  );
};



export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="pk-empty">{children}</div>;

export const Section: React.FC<{ title: string; count?: number; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, count, actions, children }) => (
  <section className="pk-section">
    <header className="pk-section-head">
      <h3>{title}{count !== undefined ? <span className="pk-count">{count}</span> : null}</h3>
      <div className="pk-actions">{actions}</div>
    </header>
    {children}
  </section>
);


export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export const Badge: React.FC<{ text: string; hue?: number; title?: string; tone?: "warn" | "bad" }> = ({ text, hue, title, tone }) => (
  <span className={`pk-badge${tone ? ` ${tone}` : ""}`} title={title} style={hue !== undefined ? ({ "--h": hue } as React.CSSProperties) : undefined} dir="ltr">{text}</span>
);








export function usePlayheadGetter(): () => number {
  const store = useEditorStore();
  return useCallback(() => store.getSnapshot().playhead, [store]);
}

export function memoWithoutPlayhead(Component: React.FC<PanelProps>): React.FC<PanelProps> {
  return memo(Component, (a, b) =>
    a.manifest === b.manifest && a.selection === b.selection && a.issues === b.issues && a.project === b.project && a.apply === b.apply && a.seek === b.seek && a.select === b.select);
}
