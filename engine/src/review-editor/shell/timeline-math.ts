import type { EditManifest, EditScene } from "../../prepared-edit/schema.ts";
import type { SelectionTarget } from "../types.ts";
import { formatSeconds, formatTimecode, segmentEditedRanges, totalFrames } from "../time.ts";



export type LaneId = "cuts" | "scenes" | "captions" | "sounds" | "camera" | "transitions";
export const LANE_ORDER: readonly LaneId[] = ["cuts", "scenes", "captions", "sounds", "camera", "transitions"];
export const LANE_TITLES: Record<LaneId, string> = {
  cuts: "القص", scenes: "المشاهد", captions: "الكابشن", sounds: "الصوت", camera: "الكاميرا", transitions: "الانتقالات",
};

export type TlItem = {

  key: string;
  lane: LaneId;

  from: number;
  to: number;
  label: string;

  target: SelectionTarget | null;

  tag?: string;

  row?: 0 | 1;

  count?: number;

  span?: readonly [number, number];

  index?: number;

  idx?: number;
};

export type Lane = { id: LaneId; items: TlItem[];                                                        maxSpan: number };
export type TimelineModel = { fps: number; duration: number; signoff: number | null; lanes: Record<LaneId, Lane> };


export type CaptionGroupLike = { fromFrame: number; toFrame: number; words: readonly { sourceIndex: number; text: string }[] };

const byStart = (a: TlItem, b: TlItem) => a.from - b.from || a.to - b.to;

function makeLane(id: LaneId, items: TlItem[]): Lane {
  items.sort(byStart);
  let maxSpan = 0;
  items.forEach((it, i) => {
    it.idx = i;
    if (it.to - it.from > maxSpan) maxSpan = it.to - it.from;
  });
  return { id, items, maxSpan };
}

export function buildTimelineModel(m: EditManifest, groups: readonly CaptionGroupLike[] | null): TimelineModel {
  const duration = totalFrames(m);
  const cuts: TlItem[] = segmentEditedRanges(m).map((s) => ({
    key: `segment:${s.index}`, lane: "cuts", from: s.fromFrame, to: s.toFrame, label: `قطعة ${s.index + 1}`,
    target: { kind: "segment", index: s.index }, tag: `src ${s.sourceFrom}-${s.sourceTo}`, index: s.index,
  }));
  const scenes: TlItem[] = m.scenes.map((s, i) => ({
    key: `scene:${s.id}`, lane: "scenes", from: s.fromFrame, to: s.fromFrame + s.durationInFrames, label: s.id,
    target: { kind: "scene", id: s.id }, tag: s.family, index: i,
  }));
  const captions: TlItem[] = (groups ?? []).map((g) => {
    const first = g.words[0].sourceIndex;
    let lo = first;
    let hi = first;
    for (const w of g.words) { if (w.sourceIndex < lo) lo = w.sourceIndex; if (w.sourceIndex > hi) hi = w.sourceIndex; }
    return {
      key: `caption:${first}`, lane: "captions" as const, from: g.fromFrame, to: g.toFrame, label: g.words.map((w) => w.text).join(" "),
      target: { kind: "word" as const, index: first }, span: [lo, hi] as const,
    };
  });
  const sounds: TlItem[] = m.sounds.map((s, i) => ({
    key: `sound:${i}`, lane: "sounds", from: s.atFrame, to: s.atFrame, label: s.recipe, target: { kind: "sound", index: i }, tag: `gain ${s.gain}`, index: i,
  }));
  const camera: TlItem[] = m.camera.map((c, i) => ({
    key: `camera:${i}`, lane: "camera", from: c.atFrame, to: c.atFrame, label: `×${c.scale.toFixed(2)}`, target: { kind: "camera", index: i },
    tag: `focus ${c.focusX.toFixed(2)},${c.focusY.toFixed(2)}`, index: i,
  }));
  const transitions: TlItem[] = [
    ...(m.transitions ?? []).map((t, i): TlItem => ({
      key: `transition:${i}`, lane: "transitions", from: t.atFrame, to: t.atFrame + t.durationInFrames, label: t.kind,
      target: { kind: "transition", index: i }, tag: t.kind, row: 0, index: i,
    })),
    ...(m.layoutTransitions ?? []).map((t, i): TlItem => ({
      key: `layoutTransition:${i}`, lane: "transitions", from: t.atFrame, to: t.atFrame + t.durationInFrames, label: `${t.kind} ${t.from}>${t.to}`,
      target: { kind: "layoutTransition", index: i }, tag: t.kind, row: 1, index: i,
    })),
  ];
  return {
    fps: m.source.fps,
    duration,
    signoff: typeof m.signoffFromFrame === "number" ? m.signoffFromFrame : null,
    lanes: {
      cuts: makeLane("cuts", cuts), scenes: makeLane("scenes", scenes), captions: makeLane("captions", captions),
      sounds: makeLane("sounds", sounds), camera: makeLane("camera", camera), transitions: makeLane("transitions", transitions),
    },
  };
}




export function queryLane(lane: Lane, from: number, to: number): TlItem[] {
  const items = lane.items;
  const key = from - lane.maxSpan;
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].from < key) lo = mid + 1;
    else hi = mid;
  }
  const out: TlItem[] = [];
  for (let i = lo; i < items.length; i++) {
    const it = items[i];
    if (it.from > to) break;
    if (it.to >= from) out.push(it);
  }
  return out;
}






export function coalesceItems(items: readonly TlItem[], minFrames: number): TlItem[] {
  if (!(minFrames > 1) || items.length < 2) return items.slice();
  const out: TlItem[] = [];
  let bucket: TlItem[] = [];
  const flush = () => {
    if (bucket.length === 1) out.push(bucket[0]);
    else if (bucket.length > 1) {
      const first = bucket[0];
      let to = first.to;
      for (const b of bucket) if (b.to > to) to = b.to;
      out.push({
        key: `${first.key}+${bucket.length}`, lane: first.lane, from: first.from, to, label: String(bucket.length), target: null,
        count: bucket.length, ...(first.idx !== undefined ? { idx: first.idx } : {}), ...(first.row !== undefined ? { row: first.row } : {}),
      });
    }
    bucket = [];
  };
  for (const it of items) {
    if (it.to - it.from >= minFrames) { flush(); out.push(it); continue; }
    if (bucket.length && it.from - bucket[0].from >= minFrames) flush();
    bucket.push(it);
  }
  flush();
  return out;
}




export function snapTargets(model: TimelineModel, opts: { playhead?: number; excludeKeys?: ReadonlySet<string> } = {}): number[] {
  const set = new Set<number>([0, model.duration]);
  if (model.signoff !== null) set.add(model.signoff);
  if (opts.playhead !== undefined) set.add(Math.round(opts.playhead));
  const skip = opts.excludeKeys;
  for (const id of ["cuts", "scenes", "captions", "sounds", "camera", "transitions"] as const) {
    for (const it of model.lanes[id].items) {
      if (skip?.has(it.key)) continue;
      set.add(it.from);
      if (id === "cuts" || id === "scenes") set.add(it.to);
    }
  }
  return [...set].sort((a, b) => a - b);
}


export function nearestSnap(sorted: readonly number[], frame: number, threshold: number): { frame: number; snappedTo: number | null } {
  const f = Math.round(frame);
  if (!sorted.length || threshold < 1) return { frame: f, snappedTo: null };
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < f) lo = mid + 1;
    else hi = mid;
  }
  let best: number | null = null;
  for (const i of [lo - 1, lo]) {
    if (i < 0 || i >= sorted.length) continue;
    if (best === null || Math.abs(sorted[i] - f) < Math.abs(best - f)) best = sorted[i];
  }
  return best !== null && Math.abs(best - f) <= threshold ? { frame: best, snappedTo: best } : { frame: f, snappedTo: null };
}

export type Snapper = (frame: number) => { frame: number; snappedTo: number | null };



export type ClampCode = "prev" | "next" | "start" | "end" | "signoff" | "min-duration" | "transition" | "neighbour" | "range";
export type Clamp = { code: ClampCode; reason: string };
export type SceneRect = { from: number; duration: number };
export type DragMode = "move" | "start" | "end";
export type DragResult = { rect: SceneRect; changed: boolean; clamp: Clamp | null; snappedTo: number | null };

type SceneLike = { id: string; fromFrame: number; durationInFrames: number };


export function sceneMinDuration(m: Pick<EditManifest, "transitions" | "scenes">, index: number): number {
  const s = m.scenes[index];
  let min = 1;
  for (const t of m.transitions ?? []) {
    if (t.atFrame === s.fromFrame && !["whiteout", "leak", "bloom", "burn"].includes(t.kind)) min = Math.max(min, t.durationInFrames);
  }
  return min;
}






export function sceneMaxStart(m: Pick<EditManifest, "transitions" | "scenes" | "signoffFromFrame" | "segments">, index: number): number {
  const s = m.scenes[index];
  const cap = Math.min(totalFrames(m), m.signoffFromFrame ?? Infinity);
  let max = Infinity;
  for (const t of m.transitions ?? []) {
    if (t.atFrame !== s.fromFrame) continue;
    const tail = t.kind === "whiteout" ? t.durationInFrames / 2 : t.durationInFrames;
    max = Math.min(max, Math.floor(cap - tail), totalFrames(m) - 1);
  }
  return max;
}







export function dragScene(opts: {
  scenes: readonly SceneLike[];
  index: number;
  mode: DragMode;
  deltaFrames: number;
  total: number;
  signoff?: number | null;
  minDuration?: number;

  maxStart?: number;
  snap?: Snapper;
}): DragResult {
  const { scenes, index, mode, total } = opts;
  const s = scenes[index];
  const prev = index > 0 ? scenes[index - 1] : null;
  const next = index < scenes.length - 1 ? scenes[index + 1] : null;
  const end0 = s.fromFrame + s.durationInFrames;
  const minDur = Math.max(1, opts.minDuration ?? 1);
  const lowerBound = prev ? prev.fromFrame + prev.durationInFrames : 0;
  const lowerBy: Clamp = prev
    ? { code: "prev", reason: `وقف عند «${prev.id}»: المشاهد مينفعش تتداخل.` }
    : { code: "start", reason: "وقف عند بداية الفيديو." };
  let upperBound = total;
  let upperBy: Clamp = { code: "end", reason: "وقف عند نهاية الفيديو." };
  if (next && next.fromFrame <= total) { upperBound = next.fromFrame; upperBy = { code: "next", reason: `وقف عند «${next.id}»: المشاهد مينفعش تتداخل.` }; }

  if (typeof opts.signoff === "number" && end0 <= opts.signoff && opts.signoff < upperBound) {
    upperBound = opts.signoff;
    upperBy = { code: "signoff", reason: "وقف قبل الـ signoff: «التوقيع» لازم تفضل من غير جرافيكس." };
  }
  const minReason: Clamp = minDur > 1
    ? { code: "transition", reason: `الـ transition المربوط بالمشهد محتاج ${minDur} فريم على الأقل.` }
    : { code: "min-duration", reason: "أقل مدة للمشهد فريم واحد." };
  const maxStart = opts.maxStart ?? Infinity;
  const maxStartBy: Clamp = { code: "transition", reason: "الـ transition المربوط ببداية المشهد لازم يخلص قبل نهاية الفيديو والـ signoff." };
  const snap = opts.snap;
  let clamp: Clamp | null = null;
  let snappedTo: number | null = null;
  const put = (v: number, lo: number, hi: number, loBy: Clamp, hiBy: Clamp): number => {
    if (v < lo) { clamp = loBy; return lo; }
    if (v > hi) { clamp = hiBy; return hi; }
    return v;
  };
  let rect: SceneRect;
  if (mode === "move") {
    let from = s.fromFrame + opts.deltaFrames;
    if (snap) {
      const a = snap(from);
      const b = snap(from + s.durationInFrames);
      const da = a.snappedTo === null ? Infinity : Math.abs(a.frame - from);
      const db = b.snappedTo === null ? Infinity : Math.abs(b.frame - (from + s.durationInFrames));
      if (da <= db && da !== Infinity) { from = a.frame; snappedTo = a.snappedTo; }
      else if (db !== Infinity) { from = b.frame - s.durationInFrames; snappedTo = b.snappedTo; }
    }
    const room = Math.max(lowerBound, upperBound - s.durationInFrames);
    from = put(Math.round(from), lowerBound, Math.max(lowerBound, Math.min(room, maxStart)), lowerBy, maxStart < room ? maxStartBy : upperBy);
    rect = { from, duration: s.durationInFrames };
  } else if (mode === "start") {
    let from = s.fromFrame + opts.deltaFrames;
    if (snap) { const a = snap(from); if (a.snappedTo !== null) { from = a.frame; snappedTo = a.snappedTo; } }
    const room = end0 - minDur;
    from = put(Math.round(from), lowerBound, Math.max(lowerBound, Math.min(room, maxStart)), lowerBy, maxStart < room ? maxStartBy : minReason);
    rect = { from, duration: end0 - from };
  } else {
    let end = end0 + opts.deltaFrames;
    if (snap) { const a = snap(end); if (a.snappedTo !== null) { end = a.frame; snappedTo = a.snappedTo; } }
    end = put(Math.round(end), s.fromFrame + minDur, Math.max(s.fromFrame + minDur, upperBound), minReason, upperBy);
    rect = { from: s.fromFrame, duration: end - s.fromFrame };
  }
  const changed = rect.from !== s.fromFrame || rect.duration !== s.durationInFrames;
  return { rect, changed, clamp, snappedTo };
}


export function soundBounds(m: Pick<EditManifest, "signoffFromFrame" | "segments">): { min: number; max: number } {
  const total = totalFrames(m);
  return { min: 0, max: Math.max(0, Math.min(total, m.signoffFromFrame ?? total) - 1) };
}


export function cameraBounds(m: Pick<EditManifest, "camera" | "segments">, index: number): { min: number; max: number } {
  const total = totalFrames(m);
  const prev = m.camera[index - 1];
  const next = m.camera[index + 1];
  return { min: prev ? prev.atFrame + 1 : 0, max: Math.max(0, (next ? next.atFrame - 1 : total - 1)) };
}


export function dragMarker(opts: { frame: number; min: number; max: number; kind: "sound" | "camera"; snap?: Snapper }): { frame: number; clamp: Clamp | null; snappedTo: number | null } {
  let f = Math.round(opts.frame);
  let snappedTo: number | null = null;
  if (opts.snap) { const s = opts.snap(f); if (s.snappedTo !== null) { f = s.frame; snappedTo = s.snappedTo; } }
  if (f < opts.min) return { frame: opts.min, snappedTo, clamp: { code: opts.kind === "camera" ? "neighbour" : "start", reason: opts.kind === "camera" ? "مفاتيح الكاميرا لازم تفضل مترتبة: وقف عند المفتاح اللي قبله." : "وقف عند بداية الفيديو." } };
  if (f > opts.max) return { frame: opts.max, snappedTo, clamp: { code: opts.kind === "camera" ? "neighbour" : "signoff", reason: opts.kind === "camera" ? "مفاتيح الكاميرا لازم تفضل مترتبة: وقف عند المفتاح اللي بعده." : "الصوت لازم يبدأ قبل الـ signoff ونهاية الفيديو." } };
  return { frame: f, snappedTo, clamp: null };
}




export function withSceneRect(m: EditManifest, id: string, rect: SceneRect): EditManifest {
  const i = m.scenes.findIndex((s) => s.id === id);
  if (i < 0) return m;
  const old = m.scenes[i];
  if (old.fromFrame === rect.from && old.durationInFrames === rect.duration) return m;
  const scenes = m.scenes.slice();
  scenes[i] = { ...old, fromFrame: rect.from, durationInFrames: rect.duration } as EditScene;
  const next: EditManifest = { ...m, scenes };
  if (m.transitions && old.fromFrame !== rect.from) {
    next.transitions = m.transitions.map((t) => (t.atFrame === old.fromFrame ? { ...t, atFrame: rect.from } : t));
  }
  return next;
}

export function withSoundFrame(m: EditManifest, index: number, frame: number): EditManifest {
  const s = m.sounds[index];
  if (!s || s.atFrame === frame) return m;
  const sounds = m.sounds.slice();
  sounds[index] = { ...s, atFrame: frame };
  return { ...m, sounds };
}

export function withCameraFrame(m: EditManifest, index: number, frame: number): EditManifest {
  const c = m.camera[index];
  if (!c || c.atFrame === frame) return m;
  const camera = m.camera.slice();
  camera[index] = { ...c, atFrame: frame };
  return { ...m, camera };
}




export function adjacentSceneIndex(scenes: readonly { fromFrame: number }[], playhead: number, dir: 1 | -1): number {
  let best = -1;
  for (let i = 0; i < scenes.length; i++) {
    const f = scenes[i].fromFrame;
    if (dir === 1 && f > playhead && (best < 0 || f < scenes[best].fromFrame)) best = i;
    if (dir === -1 && f < playhead && (best < 0 || f > scenes[best].fromFrame)) best = i;
  }
  return best;
}



export const MAX_PX_PER_FRAME = 48;
export const MIN_ZOOM = 1;


export const fitPxPerFrame = (viewWidth: number, duration: number): number => Math.max(0.005, viewWidth / Math.max(1, duration));


export const clampZoom = (zoom: number, fitPpf: number): number => Math.min(Math.max(MIN_ZOOM, zoom), Math.max(MIN_ZOOM, MAX_PX_PER_FRAME / fitPpf));


export function zoomAround(opts: { zoom: number; factor: number; fitPpf: number; anchorFrame: number; anchorX: number; viewWidth: number; duration: number }): { zoom: number; scrollLeft: number } {
  const zoom = clampZoom(opts.zoom * opts.factor, opts.fitPpf);
  const ppf = opts.fitPpf * zoom;
  const max = Math.max(0, opts.duration * ppf - opts.viewWidth);
  return { zoom, scrollLeft: Math.min(max, Math.max(0, opts.anchorFrame * ppf - opts.anchorX)) };
}


export const frameAtX = (x: number, scrollLeft: number, ppf: number): number => (x + scrollLeft) / ppf;


export function visibleFrames(scrollLeft: number, viewWidth: number, ppf: number, bufferPx = 240): { from: number; to: number } {
  return { from: Math.max(0, Math.floor((scrollLeft - bufferPx) / ppf)), to: Math.ceil((scrollLeft + viewWidth + bufferPx) / ppf) };
}


export function quantiseWindow(win: { from: number; to: number }, chunkFrames: number): { from: number; to: number } {
  const c = Math.max(1, Math.round(chunkFrames));
  return { from: Math.max(0, Math.floor(win.from / c) * c), to: Math.ceil(win.to / c) * c };
}


export function followScroll(opts: { scrollLeft: number; viewWidth: number; playheadFrame: number; ppf: number; contentWidth: number }): number | null {
  const x = opts.playheadFrame * opts.ppf;
  if (x >= opts.scrollLeft + 12 && x <= opts.scrollLeft + opts.viewWidth - 24) return null;
  const target = x - opts.viewWidth * 0.15;
  return Math.min(Math.max(0, target), Math.max(0, opts.contentWidth - opts.viewWidth));
}



export type Tick = { frame: number; major: boolean; label: string | null };

const SECOND_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const FRAME_STEPS = [1, 2, 5, 10];


export function rulerLabel(frame: number, fps: number, stepFrames: number): string {
  const rate = Math.max(1, Math.round(fps));
  if (stepFrames % rate === 0) {
    const s = Math.round(frame / rate);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  return stepFrames >= rate / 10 ? formatSeconds(frame, fps) : formatTimecode(frame, fps);
}


export function rulerTicks(opts: { fps: number; ppf: number; from: number; to: number; minLabelPx?: number }): Tick[] {
  const rate = Math.max(1, Math.round(opts.fps));
  const minPx = opts.minLabelPx ?? 72;
  const candidates = [...FRAME_STEPS.filter((f) => f < rate), ...SECOND_STEPS.map((s) => Math.round(s * rate))];
  const step = candidates.find((c) => c * opts.ppf >= minPx) ?? candidates[candidates.length - 1];
  const subdiv = step % 5 === 0 ? 5 : step % 2 === 0 ? 2 : 1;
  const minor = subdiv > 1 && (step / subdiv) * opts.ppf >= 7 ? step / subdiv : null;
  const unit = minor ?? step;
  const out: Tick[] = [];
  const first = Math.max(0, Math.floor(opts.from / unit) * unit);
  for (let f = first; f <= opts.to; f += unit) {
    const major = f % step === 0;
    out.push({ frame: f, major, label: major ? rulerLabel(f, opts.fps, step) : null });
  }
  return out;
}


export function hueOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % 360;
}
