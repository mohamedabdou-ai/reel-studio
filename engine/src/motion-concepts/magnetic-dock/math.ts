import { EASE, clamp01, mix } from "../../core/motion.ts";
import { SURFACE_INSET, mainBottom, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, seg, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";




export const COUNT = 6;

export const MAG = 0.86;

export const REACH = 2.1;

export const DWELL = 0.5;

export const ICON_DIM = 0.8;


export const kernel = (distance: number): number => {
  const a = Math.abs(distance);
  if (a >= REACH) return 0;
  const c = Math.cos((Math.PI / 2) * (a / REACH));
  return c * c;
};


export const KERNEL_SUM_MAX = (() => {
  let best = 0;
  for (let k = 0; k <= 1000; k++) {
    const u = (k / 1000) * (COUNT - 1);
    let sum = 0;
    for (let i = 0; i < COUNT; i++) sum += kernel(i - u);
    if (sum > best) best = sum;
  }
  return best;
})();


const PAD_X_K = 0.26;
const GAP_MIN_K = 0.12;
const PAD_TOP_K = 0.24;
const DOT_GAP_K = 0.13;
const DOT_K = 0.11;
const PAD_BOTTOM_K = 0.15;


export const LABEL_H = 96;
export const LABEL_PAD_X = 32;
export const LABEL_TEXT_H = 72;
export const LABEL_MIN_W = 150;
export const LABEL_MAX_W = 600;
export const LABEL_FONT = 44;
export const LABEL_MIN_FONT = 28;
export const CARET_W = 30;
export const CARET_H = 14;

export const LABEL_GAP = 12;

export const LABEL_FLOAT = 18;

export const CURSOR_W = 52;
export const CURSOR_H = 64;


export const baseSizeFor = (panelWidth: number): number => {
  const units = 2 * PAD_X_K + COUNT + MAG * KERNEL_SUM_MAX + (COUNT - 1) * GAP_MIN_K;
  return Math.max(48, Math.min(120, Math.floor(panelWidth / units)));
};



type OnceKey = "cursorIn" | "sweep" | "hold";
type LoopKey = OnceKey | "out";

const ONCE: BeatSpec<OnceKey> = {
  cursorIn: [0.05, 0.16],
  sweep: [0.16, 0.78],
  hold: [0.78, 1],
};

const LOOP: BeatSpec<LoopKey> = {
  cursorIn: [0.03, 0.11],
  sweep: [0.11, 0.68],
  hold: [0.68, 0.89],
  out: [0.89, 0.97],
};

const ORDER: readonly OnceKey[] = ["cursorIn", "sweep", "hold"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { out?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;






export const MIN_FRAMES = 210;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop" && beats.out && beats.out.from !== beats.hold.to) issues.push("out must start where the hold ends");
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;


const within = (beat: Beat, a: number, b: number): Beat => {
  const len = beat.to - beat.from;
  const from = beat.from + Math.round(a * len);
  return { from, to: Math.max(from + 1, beat.from + Math.round(b * len)) };
};



export type MagneticDockParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  labelWidths: readonly number[];
};

export type Layout = {

  panel: Rect;

  base: number;
  padX: number;

  inner: number;

  baseline: number;

  dotY: number;
  dotSize: number;

  tipY: number;
  hidden: { x: number; y: number };

  labelLeft: number;
  labelRight: number;

  clusterTop: number;
  clusterBottom: number;
};


export const layoutFor = (box: ConceptBox): Layout => {
  const left = box.left + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;
  const W = right - left;
  const base = baseSizeFor(W);
  const padX = Math.round(PAD_X_K * base);
  const padTop = Math.round(PAD_TOP_K * base);
  const dotGap = Math.round(DOT_GAP_K * base);
  const dotSize = Math.round(DOT_K * base);
  const padBottom = Math.round(PAD_BOTTOM_K * base);
  const panelH = padTop + base + dotGap + dotSize + padBottom;


  const regionTop = box.top + SURFACE_INSET;
  const regionBottom = mainBottom(box) - SURFACE_INSET;
  const above = Math.round(base * (1 + MAG)) + LABEL_GAP + CARET_H + LABEL_H;
  const below = panelH - padTop - base;
  const free = regionBottom - regionTop - (above + below);

  const clusterTop = Math.round(regionTop + free * 0.56);
  const baseline = clusterTop + above;

  const panel = roundRect({ x: left, y: baseline - base - padTop, width: W, height: panelH });
  const tipY = baseline - Math.round(0.4 * base);
  const hiddenY = Math.min(panel.y + panel.height + 170, box.bottom - CURSOR_H - 4);
  return {
    panel,
    base,
    padX,
    inner: W - 2 * padX,
    baseline,
    dotY: baseline + dotGap + Math.round(dotSize / 2),
    dotSize,
    tipY,
    hidden: { x: Math.round(left + W / 2), y: hiddenY },
    labelLeft: left,
    labelRight: right,
    clusterTop,
    clusterBottom: panel.y + panel.height,
  };
};



export type LabelState = {

  presence: number;

  rect: Rect;

  tipX: number;
};

export type IconState = {

  rect: Rect;

  weight: number;
  opacity: number;

  dot: number;
  label: LabelState;
};

export type MagneticDockState = {

  amp: number;
  panel: Rect;
  icons: IconState[];

  cursor: { x: number; y: number; opacity: number };

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`magnetic-dock stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

const LINEAR = (p: number): number => p;

export type SweepPhase = {

  u: number;

  slot: number;

  glide: number;
};







export const sweepPhase = (s: number): SweepPhase => {
  const t = clamp01(s) * COUNT;
  const slot = Math.min(COUNT - 1, Math.floor(t));
  if (slot === COUNT - 1) return { u: COUNT - 1, slot, glide: 0 };
  const glide = clamp01((t - slot - DWELL) / (1 - DWELL));
  return { u: glide <= 0 ? slot : slot + EASE.bezierMorph(glide), slot, glide };
};







export const labelLevel = (p: SweepPhase, k: number): number => {
  if (k === p.slot) return p.slot === COUNT - 1 ? 1 : 1 - seg(p.glide, 0.1, 0.5, EASE.inOut);
  if (k === p.slot + 1) return seg(p.glide, 0.5, 0.9, EASE.inOut);
  return 0;
};


export const dotLevel = (p: SweepPhase, k: number): number => {
  if (k <= p.slot) return 1;
  return k === p.slot + 1 ? seg(p.glide, 0.55, 1, EASE.inOut) : 0;
};

const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const stateAt = (frame: number, duration: number, params: MagneticDockParams): MagneticDockState => {
  finiteFrame(frame);
  const L = layoutFor(params.box);
  const B = beatsFor(params.mode, duration);



  const arrive = segBeat(frame, B.cursorIn, EASE.inOut);
  const depart = B.out ? segBeat(frame, B.out, EASE.inOut) : 0;
  const q = arrive * (1 - depart);
  const fadeIn = segBeat(frame, within(B.cursorIn, 0, 0.5), EASE.inOut);
  const fadeOut = B.out ? segBeat(frame, within(B.out, 0, 0.55), EASE.inOut) : 0;
  const ampIn = segBeat(frame, within(B.cursorIn, 0.55, 1), EASE.inOut);
  const ampOut = B.out ? segBeat(frame, within(B.out, 0, 0.8), EASE.inOut) : 0;
  const opacity = fadeIn * (1 - fadeOut);
  const amp = ampIn * (1 - ampOut);


  const phase = sweepPhase(seg(frame, B.sweep.from, B.sweep.to, LINEAR));
  const u = phase.u;


  const weights = Array.from({ length: COUNT }, (_, i) => amp * kernel(i - u));
  const sizes = weights.map((w) => L.base * (1 + MAG * w));
  const gap = (L.inner - sizes.reduce((a, s) => a + s, 0)) / (COUNT - 1);
  const centers: number[] = [];
  let run = 0;
  for (const s of sizes) {
    centers.push(run + s / 2);
    run += s + gap;
  }
  const cx = centers.map((c) => (params.rtl ? L.panel.x + L.panel.width - L.padX - c : L.panel.x + L.padX + c));


  const i0 = Math.min(COUNT - 2, Math.floor(u));
  const targetX = mix(cx[i0], cx[i0 + 1], u - i0);
  const cursor = {
    x: Math.round(mix(L.hidden.x, targetX, q)),
    y: Math.round(mix(L.hidden.y, L.tipY, q)),
    opacity,
  };

  const icons: IconState[] = sizes.map((s, i) => {
    const w = weights[i];
    const rect = roundRect({ x: cx[i] - s / 2, y: L.baseline - s, width: s, height: s });
    const presence = amp * labelLevel(phase, i);
    const lw = Math.round(clampTo(params.labelWidths[i] ?? LABEL_MAX_W, LABEL_MIN_W, LABEL_MAX_W));
    const pillX = clampTo(cx[i] - lw / 2, L.labelLeft, L.labelRight - lw);
    const pillBottom = rect.y - LABEL_GAP - CARET_H;
    const pill = roundRect({ x: pillX, y: pillBottom - LABEL_H + (1 - presence) * LABEL_FLOAT, width: lw, height: LABEL_H });
    const inset = CARET_W / 2 + 20;
    return {
      rect,
      weight: w,
      opacity: mix(ICON_DIM, 1, clamp01(w * 1.4)),
      dot: amp * dotLevel(phase, i),
      label: { presence, rect: pill, tipX: Math.round(clampTo(cx[i], pill.x + inset, pill.x + pill.width - inset)) },
    };
  });

  const rects: Rect[] = [L.panel, ...icons.map((ic) => ic.rect)];
  for (const ic of icons) {
    if (ic.label.presence > 0) rects.push({ ...ic.label.rect, height: ic.label.rect.height + CARET_H });
  }
  if (opacity > 0) rects.push({ x: cursor.x, y: cursor.y, width: CURSOR_W, height: CURSOR_H });

  return { amp, panel: L.panel, icons, cursor, rects };
};
