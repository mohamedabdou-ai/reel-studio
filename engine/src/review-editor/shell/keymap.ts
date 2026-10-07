export type Command =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "save" }
  | { type: "togglePlay" }
  | { type: "step"; frames: number }
  | { type: "seekEdge"; to: "start" | "end" }
  | { type: "scene"; dir: 1 | -1 }
  | { type: "delete" }
  | { type: "escape" };

export type KeyInfo = { key?: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; repeat?: boolean };

export type KeyContext = { editable: boolean; modal: boolean };

const STEP = 1;
const BIG_STEP = 10;

export function resolveKey(e: KeyInfo, ctx: KeyContext): Command | null {
  const mod = Boolean(e.ctrlKey || e.metaKey);
  const code = e.code ?? "";
  if (mod && !e.altKey) {

    if (code === "KeyS") return ctx.modal ? null : { type: "save" };
    if (ctx.editable || ctx.modal) return null;
    if (code === "KeyZ") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (code === "KeyY") return { type: "redo" };
    return null;
  }
  if (e.altKey || mod) return null;
  if (code === "Escape") return { type: "escape" };
  if (ctx.editable || ctx.modal) return null;
  switch (code) {
    case "Space": return e.repeat ? null : { type: "togglePlay" };
    case "ArrowLeft": return { type: "step", frames: -(e.shiftKey ? BIG_STEP : STEP) };
    case "ArrowRight": return { type: "step", frames: e.shiftKey ? BIG_STEP : STEP };
    case "Home": return { type: "seekEdge", to: "start" };
    case "End": return { type: "seekEdge", to: "end" };
    case "BracketLeft": return { type: "scene", dir: -1 };
    case "BracketRight": return { type: "scene", dir: 1 };
    case "Delete": case "Backspace": return e.repeat ? null : { type: "delete" };
    default: return null;
  }
}


export function isEditableElement(el: { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !["range", "checkbox", "radio", "button", "submit", "reset", "file", "color", "image"].includes(String(el.type ?? "text").toLowerCase());
  return false;
}
