import { EASE, clamp01, mix } from "../../core/motion.ts";
import {
  SURFACE_INSET,
  centerRect,
  mainBottom,
  mirrorX,
  roundRect,
  type ConceptBox,
  type Rect,
} from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, seg, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



type OnceKey = "lensIn" | "scan" | "lock" | "hold";
type LoopKey = OnceKey | "back" | "lensOut";




const ONCE: BeatSpec<OnceKey> = {
  lensIn: [0.03, 0.11],
  scan: [0.1, 0.68],
  lock: [0.66, 0.78],
  hold: [0.78, 1],
};

const LOOP: BeatSpec<LoopKey> = {
  lensIn: [0.03, 0.1],
  scan: [0.09, 0.52],
  lock: [0.5, 0.58],
  hold: [0.58, 0.8],
  back: [0.8, 0.95],
  lensOut: [0.88, 0.95],
};

const ORDER: readonly OnceKey[] = ["lensIn", "scan", "lock"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { back?: Beat; lensOut?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;







export const MIN_FRAMES = 150;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop") {
    if (!beats.back || !beats.lensOut) issues.push("loop mode needs back and lensOut");
    else {
      if (beats.back.from !== beats.hold.to) issues.push("back must start where the hold ends");
      if (beats.lensOut.to !== beats.back.to) issues.push("the lens must be gone exactly when the return ends");
    }
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;



export const ROW_COUNT = 5;








export const LENS_OVER = 0;

export const LENS_PAD = 12;

export const MAGNIFY = 0.045;

export const BLUR_SOFT = 4;

export const BLUR_EXTRA = 1.6;

export const RECEDE_OPACITY = 0.26;

const HOP_RATIO = 0.9;






const HOP_EASE = (p: number): number => mix(p, EASE.inOut(p), 0.5);

const LENS_IN_SCALE = { w: 0.97, h: 0.94 };

const LENS_LOCK_SQUEEZE = 0.05;

const linear = (p: number): number => p;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4 + 0;
const round2 = (n: number): number => Math.round(n * 1e2) / 1e2 + 0;



export type RowLayout = {

  rect: Rect;

  bar: Rect;
  label: Rect;
  value: Rect;
};

export type Layout = {

  card: Rect;

  header: { title: Rect; chip: Rect; rule: Rect };
  rows: RowLayout[];

  pitch: number;
  rowH: number;

  lens: { x: number; width: number; height: number };

  firstRowCy: number;
};


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean }): Layout => {
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const lensW = right - left;
  const H = bottom - top;
  const card: Rect = { x: left + LENS_OVER, y: top, width: lensW - 2 * LENS_OVER, height: H };
  const W = card.width;

  const pad = 28;
  const hdr = Math.round(H * 0.09);
  const topGap = Math.round(H * 0.02);
  const bottomPad = Math.round(H * 0.034);
  const gap = Math.round(H * 0.017);
  const rowH = Math.floor((H - hdr - topGap - bottomPad - (ROW_COUNT - 1) * gap) / ROW_COUNT);
  const rowW = W - 2 * pad;
  const rowsTop = card.y + hdr + topGap;


  const startPad = 44;
  const endPad = 34;
  const between = 24;
  const valueW = Math.round(rowW * 0.31);
  const labelW = rowW - startPad - endPad - valueW - between;
  const boxH = rowH - 28;
  const local = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, rowW) : r);
  const bar = local({ x: 14, y: 22, width: 8, height: rowH - 44 });
  const label = local({ x: startPad, y: 14, width: labelW, height: boxH });
  const value = local({ x: rowW - endPad - valueW, y: 14, width: valueW, height: boxH });

  const rows: RowLayout[] = Array.from({ length: ROW_COUNT }, (_, i) => ({
    rect: { x: card.x + pad, y: rowsTop + i * (rowH + gap), width: rowW, height: rowH },
    bar,
    label,
    value,
  }));


  const barH = 14;
  const chipH = 26;
  const skeleton = (r: Rect): Rect => {
    const m = roundRect(opts.rtl ? mirrorX(r, W) : r);
    return { ...m, x: card.x + m.x, y: card.y + m.y };
  };
  const header = {
    title: skeleton({ x: pad, y: (hdr - barH) / 2, width: Math.round(W * 0.32), height: barH }),
    chip: skeleton({ x: W - pad - Math.round(W * 0.14), y: (hdr - chipH) / 2, width: Math.round(W * 0.14), height: chipH }),
    rule: { x: card.x + pad, y: card.y + hdr, width: rowW, height: 2 },
  };

  return {
    card,
    header,
    rows,
    pitch: rowH + gap,
    rowH,
    lens: { x: left, width: lensW, height: rowH + 2 * LENS_PAD },
    firstRowCy: rowsTop + rowH / 2,
  };
};


export const lensCenterY = (L: Layout, u: number): number => L.firstRowCy + u * L.pitch;








export const dwellPath = (s: number, n: number, k: number): number => {
  if (!Number.isFinite(s)) throw new RangeError(`glass-lens dwellPath: s must be finite, got ${String(s)}`);
  if (!Number.isInteger(n) || n < 2) throw new RangeError(`glass-lens dwellPath: n must be a whole number >= 2, got ${String(n)}`);
  const rest = 1 / (n + (n - 1) * k);
  const hop = k * rest;
  const cycle = rest + hop;
  const x = clamp01(s);
  const i = Math.min(n - 1, Math.floor(x / cycle + 1e-12));
  const local = x - i * cycle;
  if (i >= n - 1 || local <= rest) return i;
  return i + HOP_EASE((local - rest) / hop);
};







export const focusAt = (d: number): number => clamp01(1 - Math.abs(d));



export type GlassLensParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  keyIndex: number;
};

export type RowState = {

  focus: number;

  scale: number;

  blur: number;

  recede: number;

  key: number;

  drawn: Rect;
};

export type GlassLensState = {

  u: number;

  presence: number;

  lock: number;
  lens: { rect: Rect; opacity: number };
  rows: RowState[];

  rects: Rect[];
};

const assertKey = (k: number): void => {
  if (!Number.isInteger(k) || k < 0 || k >= ROW_COUNT) throw new RangeError(`glass-lens: keyIndex must be a whole number 0..${ROW_COUNT - 1}, got ${String(k)}`);
};

export const stateAt = (frame: number, duration: number, params: GlassLensParams): GlassLensState => {
  if (!Number.isFinite(frame)) throw new RangeError(`glass-lens stateAt: frame must be finite, got ${String(frame)}`);
  assertKey(params.keyIndex);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const back = B.back ? segBeat(frame, B.back, HOP_EASE) : 0;


  const stops = params.keyIndex + 1;
  const scanU = stops >= 2 ? dwellPath(seg(frame, B.scan.from, B.scan.to, linear), stops, HOP_RATIO) : 0;

  const u = mix(scanU, 0, back);

  const lensIn = segBeat(frame, B.lensIn, EASE.land);
  const presence = B.lensOut ? lensIn * (1 - segBeat(frame, B.lensOut, EASE.inOut)) : lensIn;
  const lock = segBeat(frame, B.lock, EASE.inOut) * (1 - back);

  const lensW = L.lens.width * mix(LENS_IN_SCALE.w, 1, presence);
  const lensH = L.lens.height * mix(LENS_IN_SCALE.h, 1, presence) * (1 - LENS_LOCK_SQUEEZE * lock);
  const lensRect = roundRect(centerRect(L.lens.x + L.lens.width / 2, lensCenterY(L, u), lensW, lensH));

  const rows: RowState[] = L.rows.map((R, i) => {

    const focus = round4(focusAt(u - i) * presence);
    const scale = round4(1 + MAGNIFY * focus);
    return {
      focus,
      scale,
      blur: round2((BLUR_SOFT + BLUR_EXTRA * lock) * (1 - focus)),
      recede: round4(lock * (1 - focus)),
      key: i === params.keyIndex ? round4(lock) : 0,
      drawn: roundRect(centerRect(R.rect.x + R.rect.width / 2, R.rect.y + R.rect.height / 2, R.rect.width * scale, R.rect.height * scale)),
    };
  });

  return {
    u: round4(u),
    presence: round4(presence),
    lock: round4(lock),
    lens: { rect: lensRect, opacity: round4(presence) },
    rows,
    rects: [L.card, lensRect, ...rows.map((r) => r.drawn)],
  };
};
