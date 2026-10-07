import { EASE, mix } from "../../core/motion.ts";
import { SURFACE_INSET, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



export const COLUMNS = 6;
export const JOINS = COLUMNS - 1;
const COLS = [0, 1, 2, 3, 4, 5] as const;
const LINKS = [0, 1, 2, 3, 4] as const;
type Col = (typeof COLS)[number];
type Link = (typeof LINKS)[number];
const LAST: Col = 5;

type OnceKey = `grow${Col}` | `morph${Col}` | `line${Link}` | "hi" | "kpi" | "halo" | "tag" | "leader" | "hold";
type LoopKey = OnceKey | "unhi" | "unmorph" | "drop";
type Pair = readonly [from: number, to: number];


type Wave = { at: number; step: number; len: number };

type Plan = {
  grow: Wave;
  morph: Wave;

  line: { len: number; pull: number };
  hi: Pair;
  kpi: Pair;
  halo: Pair;
  tag: Pair;
  leader: Pair;
  hold: Pair;
  back?: { unhi: Pair; unmorph: Pair; drop: Pair };
};

const makeSpec = (p: Plan): Record<string, Pair> => {
  const out: Record<string, Pair> = {};
  for (const i of COLS) {
    out[`grow${i}`] = [p.grow.at + i * p.grow.step, p.grow.at + i * p.grow.step + p.grow.len];
    out[`morph${i}`] = [p.morph.at + i * p.morph.step, p.morph.at + i * p.morph.step + p.morph.len];
  }
  for (const k of LINKS) {
    const end = p.morph.at + (k + 1) * p.morph.step + p.line.pull * p.morph.len;
    out[`line${k}`] = [end - p.line.len, end];
  }
  Object.assign(out, { hi: p.hi, kpi: p.kpi, halo: p.halo, tag: p.tag, leader: p.leader, hold: p.hold });
  if (p.back) Object.assign(out, p.back);
  return out;
};

const ONCE_PLAN: Plan = {
  grow: { at: 0.02, step: 0.022, len: 0.1 },
  morph: { at: 0.3, step: 0.036, len: 0.09 },
  line: { len: 0.06, pull: 0.4 },
  hi: [0.56, 0.64],
  kpi: [0.57, 0.66],
  halo: [0.59, 0.67],
  tag: [0.62, 0.7],
  leader: [0.63, 0.7],
  hold: [0.74, 1],
};

const LOOP_PLAN: Plan = {
  grow: { at: 0.02, step: 0.018, len: 0.09 },
  morph: { at: 0.24, step: 0.028, len: 0.085 },
  line: { len: 0.05, pull: 0.4 },
  hi: [0.455, 0.53],
  kpi: [0.465, 0.545],
  halo: [0.485, 0.555],
  tag: [0.51, 0.575],
  leader: [0.52, 0.58],
  hold: [0.6, 0.83],
  back: { unhi: [0.83, 0.89], unmorph: [0.86, 0.93], drop: [0.92, 0.985] },
};

const ONCE = makeSpec(ONCE_PLAN) as unknown as BeatSpec<OnceKey>;
const LOOP = makeSpec(LOOP_PLAN) as unknown as BeatSpec<LoopKey>;

const ORDER: readonly OnceKey[] = [
  ...COLS.map((i) => `grow${i}` as const),
  ...COLS.map((i) => `morph${i}` as const),
  "hi",
  "kpi",
  "halo",
  "tag",
  "leader",
];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { unhi?: Beat; unmorph?: Beat; drop?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as unknown as BeatSet;






export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop" && beats.unhi && beats.unhi.from !== beats.hold.to) issues.push("unhi must start where the hold ends");
  if (mode === "loop" && beats.drop && beats.drop.from < (beats.unmorph?.from ?? Infinity)) issues.push("drop must not start before unmorph");
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;

export const barsFrame = (mode: ConceptMode, duration: number): number => {
  const b = beatsFor(mode, duration);
  return Math.floor((b.grow5.to + b.morph0.from) / 2);
};




export type Axis = "reading" | "ltr";

export type LayoutOpts = {

  rtl: boolean;

  axis?: Axis;

  pillK: number;

  windowRadius: number;

  values: readonly number[];
};

export type DataMorphParams = LayoutOpts & { mode: ConceptMode; box: ConceptBox };

export type Layout = {

  window: Rect;

  chartRtl: boolean;

  metric: Rect;
  chip: Rect;
  rule: Rect;
  kpi: Rect;
  tag: Rect;

  tagIcon: Rect;
  tagText: Rect;
  plot: Rect;
  baseline: number;

  grid: number[];

  cx: number[];
  h: number[];
  colW: number;
  bw: number;
  dot: number;
  dotFinal: number;
  barRadius: number;
  markerK: number;

  leaderX: number;
  leaderTop: number;
  leaderGap: number;

  tick: number;
};


const TAG_ICON = 28;
const TAG_PAD = 20;
const TAG_GAP = 12;

const assertValues = (values: readonly number[]): void => {
  if (!Array.isArray(values) || values.length !== COLUMNS) {
    throw new RangeError(`data-morph: values must be exactly ${COLUMNS} numbers, got ${Array.isArray(values) ? values.length : typeof values}`);
  }
  values.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new RangeError(`data-morph: values[${i}] must be a finite number >= 0, got ${String(v)}`);
  });
};


export const layoutFor = (box: ConceptBox, opts: LayoutOpts): Layout => {
  assertValues(opts.values);
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const win: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = win.width;
  const H = win.height;


  const chartRtl = opts.rtl && opts.axis !== "ltr";
  const at = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, W) : r);
  const atChart = (r: Rect): Rect => roundRect(chartRtl ? mirrorX(r, W) : r);
  const fy = (f: number): number => Math.round(H * f);

  const pad = Math.round(W * 0.05);
  const iw = W - 2 * pad;
  const gap = 20;


  const headerY = fy(0.046);
  const headerH = fy(0.072);
  const chipW = Math.round(W * 0.225);
  const chipH = fy(0.057);
  const metric = at({ x: pad, y: headerY, width: iw - chipW - gap, height: headerH });
  const chip = at({ x: W - pad - chipW, y: headerY + Math.round((headerH - chipH) / 2), width: chipW, height: chipH });
  const ruleY = headerY + headerH + fy(0.02);
  const rule = at({ x: pad, y: ruleY, width: iw, height: 2 });


  const kpiY = ruleY + fy(0.02);
  const kpiH = fy(0.168);
  const kpi = atChart({ x: pad, y: kpiY, width: iw, height: kpiH });
  const tagH = fy(0.066);
  const tagW = Math.round(W * 0.58);
  const tagY = kpiY + kpiH + fy(0.008);
  const tag = atChart({ x: W - pad - tagW, y: tagY, width: tagW, height: tagH });
  const iconLtr: Rect = { x: TAG_PAD, y: Math.round((tagH - TAG_ICON) / 2), width: TAG_ICON, height: TAG_ICON };
  const tagIcon = opts.rtl ? mirrorX(iconLtr, tagW) : iconLtr;
  const textInset = TAG_PAD + TAG_ICON + TAG_GAP;

  const tagText: Rect = { x: textInset, y: 2, width: tagW - 2 * textInset, height: tagH - 4 };


  const plotTop = tagY + tagH + fy(0.072);
  const baseline = fy(0.905);
  const plotH = baseline - plotTop;
  const plot: Rect = { x: pad, y: plotTop, width: iw, height: plotH };
  const colW = iw / COLUMNS;


  const cxLtr = COLS.map((i) => Math.round(pad + colW * (i + 0.5)));
  const cx = chartRtl ? cxLtr.map((x) => W - x) : cxLtr;
  const maxV = Math.max(...opts.values);
  const h = opts.values.map((v) => (maxV > 0 ? (v / maxV) * plotH : 0));
  const grid = [1, 2, 3].map((k) => Math.round(baseline - (plotH * k) / 3));
  const dotFinal = 2 * Math.round(colW * 0.16);

  return {
    window: win,
    chartRtl,
    metric,
    chip,
    rule,
    kpi,
    tag,
    tagIcon,
    tagText,
    plot,
    baseline,
    grid,
    cx,
    h,
    colW,
    bw: 2 * Math.round(colW * 0.28),
    dot: 2 * Math.round(colW * 0.105),
    dotFinal,
    barRadius: Math.round(opts.windowRadius * 0.3),
    markerK: opts.pillK,
    leaderX: cx[LAST],
    leaderTop: tagY + tagH + 6,
    leaderGap: 8,
    tick: 12,
  };
};



export type Trend = "up" | "down" | "flat";


export const trendOf = (values: readonly number[]): Trend => {
  assertValues(values);
  const max = Math.max(...values);
  if (!(max > 0)) return "flat";
  const rel = (values[COLUMNS - 1] - values[0]) / max;
  return rel > 0.005 ? "up" : rel < -0.005 ? "down" : "flat";
};


export type BarState = { x: number; y: number; width: number; height: number; radius: number; cx: number; cy: number };

export type LinkState = { s: number; x1: number; y1: number; x2: number; y2: number };

export type DataMorphState = {

  g: number[];
  m: number[];
  bars: BarState[];
  links: LinkState[];

  hi: number;

  kpi: number;
  kpiDy: number;
  tag: number;
  tagDy: number;

  leader: { p: number; x: number; y1: number; y2: number };

  halo: { p: number; opacity: number; r: number; cx: number; cy: number };
  trend: Trend;

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`data-morph stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

export const stateAt = (frame: number, duration: number, params: DataMorphParams): DataMorphState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);


  const unhi = B.unhi ? segBeat(frame, B.unhi, EASE.inOut) : 0;
  const unmorph = B.unmorph ? segBeat(frame, B.unmorph, EASE.bezierMorph) : 0;
  const drop = B.drop ? segBeat(frame, B.drop, EASE.inOut) : 0;

  const hi = segBeat(frame, B.hi, EASE.land) * (1 - unhi);
  const g = COLS.map((i) => segBeat(frame, B[`grow${i}` as const], EASE.land) * (1 - drop));
  const m = COLS.map((i) => segBeat(frame, B[`morph${i}` as const], EASE.bezierMorph) * (1 - unmorph));

  const bars: BarState[] = COLS.map((i) => {
    const cx = L.cx[i];

    const cy = L.baseline - g[i] * L.h[i];
    const D = i === LAST ? mix(L.dot, L.dotFinal, hi) : L.dot;
    const width = mix(L.bw, D, m[i]);


    const top = mix(cy, cy - D / 2, m[i]);
    const bottom = mix(L.baseline, cy + D / 2, m[i]);
    const height = bottom - top;
    const radius = Math.min(mix(L.barRadius, (L.markerK * D) / 2, m[i]), width / 2, height / 2);
    return { x: cx - width / 2, y: top, width, height, radius, cx, cy };
  });

  const links: LinkState[] = LINKS.map((k) => {
    const s = segBeat(frame, B[`line${k}` as const], EASE.inOut) * (1 - unmorph);
    const a = bars[k];
    const b = bars[k + 1];
    return { s, x1: a.cx, y1: a.cy, x2: mix(a.cx, b.cx, s), y2: mix(a.cy, b.cy, s) };
  });

  const kpi = segBeat(frame, B.kpi, EASE.land) * (1 - unhi);
  const tag = segBeat(frame, B.tag, EASE.land) * (1 - unhi);
  const leaderP = segBeat(frame, B.leader, EASE.inOut) * (1 - unhi);
  const last = bars[LAST];
  const leaderEnd = last.cy - L.dotFinal / 2 - L.leaderGap;

  const haloT = frame > B.halo.from && frame < B.halo.to ? (frame - B.halo.from) / (B.halo.to - B.halo.from) : -1;
  const haloP = haloT < 0 ? 0 : EASE.land(haloT);
  const haloOpacity = haloT < 0 ? 0 : 0.7 * (1 - haloT);

  const haloR = L.dotFinal / 2 + 6 + 30 * haloP;

  const kpiDy = mix(16, 0, kpi);
  const tagDy = mix(16, 0, tag);

  const abs = (r: Rect): Rect => ({ x: L.window.x + r.x, y: L.window.y + r.y, width: r.width, height: r.height });
  const rects: Rect[] = [L.window, abs(L.metric), abs(L.chip), abs(L.rule)];
  bars.forEach((b) => {
    if (b.width > 0 && b.height > 0) rects.push(abs({ x: b.x, y: b.y, width: b.width, height: b.height }));
  });
  if (kpi > 0) rects.push(abs({ ...L.kpi, y: L.kpi.y + kpiDy }));
  if (tag > 0) rects.push(abs({ ...L.tag, y: L.tag.y + tagDy }));
  if (leaderP > 0) rects.push(abs({ x: L.leaderX - 1.5, y: L.leaderTop, width: 3, height: mix(L.leaderTop, leaderEnd, leaderP) - L.leaderTop }));
  if (haloOpacity > 0) rects.push(abs({ x: last.cx - haloR, y: last.cy - haloR, width: 2 * haloR, height: 2 * haloR }));

  return {
    g,
    m,
    bars,
    links,
    hi,
    kpi,
    kpiDy,
    tag,
    tagDy,
    leader: { p: leaderP, x: L.leaderX, y1: L.leaderTop, y2: mix(L.leaderTop, leaderEnd, leaderP) },
    halo: { p: haloP, opacity: haloOpacity, r: haloR, cx: last.cx, cy: last.cy },
    trend: trendOf(params.values),
    rects,
  };
};
