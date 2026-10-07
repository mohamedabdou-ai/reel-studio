import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ApiClient, ConnectionState } from "../api-client.ts";
import type { EditorStore } from "../store.ts";

const PANEL_THROTTLE_MS = 100;


export function useThrottledPlayhead(store: EditorStore, ms = PANEL_THROTTLE_MS): number {
  const [value, setValue] = useState(() => store.getSnapshot().playhead);
  useEffect(() => {
    let lastAt = 0;
    let lastNonce = store.getSnapshot().seekNonce;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      lastAt = performance.now();
      setValue(store.getSnapshot().playhead);
    };
    const off = store.subscribe(() => {
      const s = store.getSnapshot();
      if (s.seekNonce !== lastNonce) { lastNonce = s.seekNonce; clearTimeout(timer); timer = undefined; flush(); return; }
      if (timer === undefined && performance.now() - lastAt >= ms) flush();
      else if (timer === undefined) timer = setTimeout(flush, ms - (performance.now() - lastAt));
    });
    return () => { off(); clearTimeout(timer); };
  }, [store, ms]);
  return value;
}


export function useConnection(client: ApiClient): ConnectionState {
  return useSyncExternalStore(client.connection.subscribe, client.connection.get, client.connection.get);
}





export function useHeartbeat(client: ApiClient, online: boolean, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (document.visibilityState === "visible") void client.ping(); };
    const id = setInterval(tick, online ? 20_000 : 3_000);
    return () => clearInterval(id);
  }, [client, online, enabled]);
}

export type ToastKind = "ok" | "info" | "warn" | "error";
export type Toast = { id: number; kind: ToastKind; text: string };


export function useToasts(): { toasts: Toast[]; push: (kind: ToastKind, text: string) => void; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = next.current++;
    setToasts((all) => [...all.slice(-3), { id, kind, text }]);
    timers.current.set(id, setTimeout(() => dismiss(id), kind === "error" ? 9000 : kind === "warn" ? 6000 : 3500));
  }, [dismiss]);
  useEffect(() => { const t = timers.current; return () => { for (const h of t.values()) clearTimeout(h); t.clear(); }; }, []);
  return { toasts, push, dismiss };
}


export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
