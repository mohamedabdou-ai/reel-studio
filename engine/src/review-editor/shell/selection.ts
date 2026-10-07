import type { EditManifest } from "../../prepared-edit/schema.ts";
import type { Selection, SelectionTarget } from "../types.ts";
import { segmentEditedRanges, wordEditedRange } from "../time.ts";
import type { TimelineModel } from "./timeline-math.ts";


export function selectionKey(sel: Selection, model?: TimelineModel): string | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "scene": return `scene:${sel.id}`;
    case "segment": return `segment:${sel.index}`;
    case "sound": return `sound:${sel.index}`;
    case "camera": return `camera:${sel.index}`;
    case "transition": return `transition:${sel.index}`;
    case "layoutTransition": return `layoutTransition:${sel.index}`;
    case "word": {
      if (!model) return null;
      for (const it of model.lanes.captions.items) if (it.span && sel.index >= it.span[0] && sel.index <= it.span[1]) return it.key;
      return null;
    }
  }
}


export function selectionRange(m: EditManifest, sel: Selection): { from: number; to: number } | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "scene": {
      const s = m.scenes.find((x) => x.id === sel.id);
      return s ? { from: s.fromFrame, to: s.fromFrame + s.durationInFrames } : null;
    }
    case "segment": {
      const s = segmentEditedRanges(m)[sel.index];
      return s ? { from: s.fromFrame, to: s.toFrame } : null;
    }
    case "word": {
      const r = wordEditedRange(m, sel.index);
      return r ? { from: r.fromFrame, to: r.toFrame } : null;
    }
    case "transition": {
      const t = m.transitions?.[sel.index];
      return t ? { from: t.atFrame, to: t.atFrame + t.durationInFrames } : null;
    }
    case "layoutTransition": {
      const t = m.layoutTransitions?.[sel.index];
      return t ? { from: t.atFrame, to: t.atFrame + t.durationInFrames } : null;
    }
    case "sound": case "camera": return null;
  }
}


export function selectionStart(m: EditManifest, sel: Selection): number | null {
  if (!sel) return null;
  if (sel.kind === "sound") return m.sounds[sel.index]?.atFrame ?? null;
  if (sel.kind === "camera") return m.camera[sel.index]?.atFrame ?? null;
  return selectionRange(m, sel)?.from ?? null;
}






export function issueTarget(path: string, m: EditManifest): { selection: SelectionTarget | null; frame: number | null } | null {
  const p = path.split(".");
  const at = (i: number) => (p[i] !== undefined && /^\d+$/.test(p[i]) ? Number(p[i]) : null);
  switch (p[0]) {
    case "scenes": {
      const i = at(1);
      const s = i === null ? undefined : m.scenes[i];
      return s ? { selection: { kind: "scene", id: s.id }, frame: s.fromFrame } : null;
    }
    case "captions": {
      if (p[1] !== "words") return null;
      const i = at(2);
      if (i === null || i >= m.captions.words.length) return null;
      const r = wordEditedRange(m, i);
      return { selection: { kind: "word", index: i }, frame: r ? r.fromFrame : null };
    }
    case "sounds": {
      const i = at(1);
      const s = i === null ? undefined : m.sounds[i];
      return s ? { selection: { kind: "sound", index: i as number }, frame: s.atFrame } : null;
    }
    case "camera": {
      const i = at(1);
      const c = i === null ? undefined : m.camera[i];
      return c ? { selection: { kind: "camera", index: i as number }, frame: c.atFrame } : null;
    }
    case "transitions": {
      const i = at(1);
      const t = i === null ? undefined : m.transitions?.[i];
      return t ? { selection: { kind: "transition", index: i as number }, frame: t.atFrame } : null;
    }
    case "layoutTransitions": {
      const i = at(1);
      const t = i === null ? undefined : m.layoutTransitions?.[i];
      return t ? { selection: { kind: "layoutTransition", index: i as number }, frame: t.atFrame } : null;
    }
    case "segments": {
      const i = at(1);
      const s = i === null ? undefined : segmentEditedRanges(m)[i];
      return s ? { selection: { kind: "segment", index: i as number }, frame: s.fromFrame } : null;
    }
    case "signoffFromFrame":
      return typeof m.signoffFromFrame === "number" ? { selection: null, frame: m.signoffFromFrame } : null;
    default:
      return null;
  }
}
