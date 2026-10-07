import type { EditManifest } from "../../prepared-edit/schema.ts";

export const DRAFT_VERSION = 1;
export type Draft = { v: number; base: string; savedAt: number; manifest: EditManifest };
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

export const draftKey = (manifestPath: string): string => `review-editor:draft:${manifestPath}`;


export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = (Math.imul(b, 33) + c) | 0;
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}${text.length.toString(16)}`;
}


export function saveDraft(storage: StorageLike | null | undefined, key: string, draft: Draft): boolean {
  if (!storage) return false;
  try { storage.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
}

export function clearDraft(storage: StorageLike | null | undefined, key: string): void {
  try { storage?.removeItem(key); } catch {              }
}


export function loadDraft(storage: StorageLike | null | undefined, key: string, baseFingerprint: string, options: {allowStale?: boolean} = {}): Draft | null {
  let raw: string | null;
  try { raw = storage?.getItem(key) ?? null; } catch { return null; }
  if (!raw) return null;
  let d: Draft;
  try { d = JSON.parse(raw) as Draft; } catch { return null; }
  if (!d || d.v !== DRAFT_VERSION || typeof d.base !== "string" || (!options.allowStale && d.base !== baseFingerprint) || typeof d.savedAt !== "number" || typeof d.manifest !== "object" || d.manifest === null) return null;
  if (fingerprint(d.manifest) === baseFingerprint) return null;
  return d;
}

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };






export function createDraftWriter(opts: { storage: StorageLike | null | undefined; key: string; getBase: () => string; delayMs?: number; now?: () => number; timers?: Timers }) {
  const timers = opts.timers ?? realTimers;
  const now = opts.now ?? (() => Date.now());
  let pending: EditManifest | null = null;
  let handle: unknown = null;
  let paused = false;
  const write = () => {
    handle = null;
    if (!pending || paused) return;
    saveDraft(opts.storage, opts.key, { v: DRAFT_VERSION, base: opts.getBase(), savedAt: now(), manifest: pending });
    pending = null;
  };
  return {
    schedule(manifest: EditManifest) {
      pending = manifest;
      if (handle === null) handle = timers.set(write, opts.delayMs ?? 800);
    },
    flush() {
      if (handle !== null) { timers.clear(handle); handle = null; }
      write();
    },
    clear() {
      if (handle !== null) { timers.clear(handle); handle = null; }
      pending = null;

      if (!paused) clearDraft(opts.storage, opts.key);
    },
    pause(value: boolean) { paused = value; },
  };
}
