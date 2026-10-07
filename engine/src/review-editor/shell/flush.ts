import { isEditableElement } from "./keymap.ts";

export type FocusedLike = {
  blur?: () => void;
  focus?: (options?: { preventScroll?: boolean }) => void;
  setSelectionRange?: (start: number, end: number) => void;
  selectionStart?: number | null;
  selectionEnd?: number | null;

  isConnected?: boolean;
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  getAttribute?: (name: string) => string | null;
} | null;
export type FocusDoc = { activeElement?: FocusedLike };
export type Caret = { start: number; end: number };





export function flushActiveField(doc?: FocusDoc | null): FocusedLike {
  const el = doc?.activeElement ?? null;
  if (!el || typeof el.blur !== "function" || !isEditableElement(el)) return null;
  el.blur();
  return el;
}





export function restoreField(el: FocusedLike, caret: Caret | null): boolean {
  if (!el || el.isConnected === false || typeof el.focus !== "function") return false;
  el.focus({ preventScroll: true });
  if (caret) { try { el.setSelectionRange?.(caret.start, caret.end); } catch {                                         } }
  return true;
}

const caretOf = (el: FocusedLike): Caret | null => (el && typeof el.selectionStart === "number" && typeof el.selectionEnd === "number" ? { start: el.selectionStart, end: el.selectionEnd } : null);

export type SaveCommandDeps = {
  doc?: FocusDoc | null;

  settle?: (fn: () => void) => void;
  isDirty: () => boolean;
  save: () => void;
  notify: (kind: "info" | "warn", text: string) => void;
};
export type SaveOutcome = "saving" | "clean" | "refused-field";






export function runSaveCommand(deps: SaveCommandDeps): SaveOutcome {
  const focused = deps.doc?.activeElement ?? null;
  const caret = caretOf(focused);
  const flushed: { el: FocusedLike } = { el: null };
  (deps.settle ?? ((fn: () => void) => fn()))(() => { flushed.el = flushActiveField(deps.doc); });
  const refused = flushed.el?.getAttribute?.("aria-invalid") === "true";
  restoreField(flushed.el, caret);
  if (refused) deps.notify("warn", "الخانة اللي كنت بتكتب فيها قيمتها غلط فالتعديل ده ما اتسجّلش. صلّحها وجرّب تاني.");
  if (deps.isDirty()) {
    deps.save();
    return "saving";
  }
  if (refused) return "refused-field";
  deps.notify("info", "مفيش تعديلات جديدة، كله متسجّل.");
  return "clean";
}
