import { EASE, mix, px } from "../../core/motion.ts";
import { SURFACE_INSET, mainBottom, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, hashSeed, minDuration, mulberry32, seg, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



type OnceKey = "rise" | "sub" | "hold";
type LoopKey = OnceKey | "subOut" | "back";





const ONCE: BeatSpec<OnceKey> = {
  rise: [0.06, 0.44],
  sub: [0.36, 0.52],
  hold: [0.56, 1],
};



const LOOP: BeatSpec<LoopKey> = {
  rise: [0.05, 0.35],
  sub: [0.27, 0.41],
  hold: [0.45, 0.74],
  subOut: [0.74, 0.82],
  back: [0.74, 0.92],
};

const ORDER: readonly OnceKey[] = ["rise", "sub"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { subOut?: Beat; back?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;





export const MIN_FRAMES = 150;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop") {
    if (!beats.back || beats.back.from !== beats.hold.to) issues.push("back must start where the hold ends");
    if (!beats.subOut || beats.subOut.from !== beats.hold.to) issues.push("subOut must start where the hold ends");
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;




export const KEYWORD_MAX_SIZE = 340;

export const KEYWORD_MIN_SIZE = 56;

export const KEYWORD_PAD = 24;

export const SUB_H = 150;

export const SUB_GAP = 64;

export const SUB_SLIDE = 28;

export const EDGE_MARGIN = 48;

export const MAX_INK_H = 500;





export type KeywordMetrics = {

  lines: number;

  fontSize: number;

  width: number;

  ascent: number;

  descent: number;
};


const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDCF\uFDF0-\uFDFD\uFE70-\uFEFE]/;

const ARABIC_DEEP = /[جحخعغقصضنيىمورزةلكطظهإ]/;
const LATIN_DEEP = /[gjpqyQ,;]/;


const up = (n: number): number => Math.ceil(n - 1e-9);







export const inkGuess = (text: string, fontSize: number): { ascent: number; descent: number } => {
  if (!(fontSize > 0) || !Number.isFinite(fontSize)) throw new RangeError(`keyword-reveal inkGuess: fontSize must be > 0, got ${String(fontSize)}`);
  if (ARABIC.test(text)) return { ascent: up(0.86 * fontSize), descent: up((ARABIC_DEEP.test(text) ? 0.44 : 0.14) * fontSize) };
  return { ascent: up(0.76 * fontSize), descent: up((LATIN_DEEP.test(text) ? 0.24 : 0.02) * fontSize) };
};

const asc = (m: KeywordMetrics): number => up(m.ascent);
const desc = (m: KeywordMetrics): number => up(m.descent);


export const pitchFor = (m: KeywordMetrics): number => Math.max(up(m.fontSize * 0.96), asc(m) + desc(m) + up(m.fontSize * 0.08));


export const blockHeight = (m: KeywordMetrics): number => asc(m) + (m.lines - 1) * pitchFor(m) + desc(m);


export const ringFor = (fontSize: number): number => Math.max(3, Math.min(8, Math.round(fontSize * 0.022)));


export const fillMarginFor = (fontSize: number): number => Math.max(4, Math.round(fontSize * 0.04));


export const regionFor = (box: ConceptBox): Rect => {
  const x = box.left + SURFACE_INSET;
  const y = box.top + SURFACE_INSET;
  return { x, y, width: box.width - 2 * SURFACE_INSET, height: mainBottom(box) - SURFACE_INSET - y };
};


export const keywordMaxWidth = (box: ConceptBox): number => regionFor(box).width - 2 * KEYWORD_PAD;


export const maxInkHeight = (box: ConceptBox): number => Math.min(MAX_INK_H, regionFor(box).height - SUB_H - SUB_GAP - 2 * EDGE_MARGIN);


export const metricsIssues = (m: KeywordMetrics, box: ConceptBox): string[] => {
  const issues: string[] = [];
  const nums = [m.lines, m.fontSize, m.width, m.ascent, m.descent];
  if (!nums.every(Number.isFinite)) return ["metrics contain a non-finite number"];
  if (m.lines !== 1 && m.lines !== 2) issues.push(`lines must be 1 or 2, got ${m.lines}`);
  if (m.fontSize < 1) issues.push(`fontSize ${m.fontSize} < 1`);
  if (m.width <= 0) issues.push(`width ${m.width} <= 0`);
  if (m.ascent <= 0) issues.push(`ascent ${m.ascent} <= 0`);
  if (m.descent < 0) issues.push(`descent ${m.descent} < 0`);
  if (issues.length > 0) return issues;
  if (m.width > keywordMaxWidth(box)) issues.push(`keyword is ${m.width} px wide, the column holds ${keywordMaxWidth(box)}`);
  if (blockHeight(m) > maxInkHeight(box)) issues.push(`keyword block is ${blockHeight(m)} px tall, at most ${maxInkHeight(box)} fit`);
  return issues;
};



export type KeywordLayout = {
  region: Rect;

  cx: number;
  pitch: number;

  ring: number;

  baselines: number[];

  ink: Rect;

  paint: Rect;

  visual: Rect;

  fillBottom: number;
  fillTop: number;

  sub: Rect;
};


export const layoutFor = (box: ConceptBox, m: KeywordMetrics): KeywordLayout => {
  const problems = metricsIssues(m, box);
  if (problems.length > 0) throw new RangeError(`keyword-reveal layoutFor: ${problems.join("; ")}`);
  const region = regionFor(box);
  const cx = region.x + region.width / 2;
  const ring = ringFor(m.fontSize);
  const pitch = pitchFor(m);
  const inkH = blockHeight(m);
  const total = inkH + SUB_GAP + SUB_H;

  const lift = Math.round(region.height * 0.04);
  const top = Math.max(region.y + EDGE_MARGIN, Math.round(region.y + (region.height - total) / 2 - lift));
  const inkX = px(cx - m.width / 2);
  const margin = fillMarginFor(m.fontSize);
  const fillTop = top - margin;
  const fillBottom = top + inkH + margin;
  return {
    region,
    cx,
    pitch,
    ring,
    baselines: Array.from({ length: m.lines }, (_, i) => top + asc(m) + i * pitch),
    ink: { x: inkX, y: top, width: m.width, height: inkH },
    paint: { x: inkX - ring, y: top - ring, width: m.width + 2 * ring, height: inkH + 2 * ring },
    visual: { x: inkX - KEYWORD_PAD, y: fillTop, width: m.width + 2 * KEYWORD_PAD, height: fillBottom - fillTop },
    fillBottom,
    fillTop,
    sub: { x: region.x, y: top + inkH + SUB_GAP, width: region.width, height: SUB_H },
  };
};



export type KeywordRevealParams = {
  mode: ConceptMode;
  box: ConceptBox;
  metrics: KeywordMetrics;
};

export type KeywordRevealState = {

  level: number;

  edgeY: number;

  edge: number;

  phase: number;

  zoom: number;

  detail: number;

  sub: { presence: number; dy: number };

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`keyword-reveal stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

export const stateAt = (frame: number, duration: number, params: KeywordRevealParams): KeywordRevealState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params.metrics);
  const B = beatsFor(params.mode, duration);

  const rise = segBeat(frame, B.rise, EASE.bezierCam);
  const back = B.back ? segBeat(frame, B.back, EASE.inOut) : 0;
  const level = rise * (1 - back);


  const edge = seg(level, 0, 0.12, EASE.inOut) * (1 - seg(level, 0.86, 1, EASE.inOut));

  const subIn = segBeat(frame, B.sub, EASE.land);
  const subOut = B.subOut ? segBeat(frame, B.subOut, EASE.inOut) : 0;
  const presence = subIn * (1 - subOut);
  const dy = mix(SUB_SLIDE, 0, presence);

  return {
    level,
    edgeY: px(mix(L.fillBottom, L.fillTop, level)),
    edge,
    phase: level,
    zoom: mix(1.1, 1, level),
    detail: seg(level, 0.1, 0.92, EASE.inOut),
    sub: { presence, dy },
    rects: [L.paint, { ...L.sub, y: L.sub.y + dy }],
  };
};




export const WAVE_COUNT = 18;

export const WAVE_STEPS = 44;

export const RING_COUNT = 3;

export const ROT_TURNS = 0.32;

export type Wave = {

  y: number;

  amp: number;

  k: number;

  ph: number;

  jit: number;

  w: number;

  a: number;
};

export type Ring = {
  r: number;

  w: number;

  a: number;
  dash: number;
  gap: number;

  a0: number;

  sweep: number;

  arcW: number;
};

export type Visual = {
  w: number;
  h: number;
  waves: Wave[];
  rings: Ring[];

  focus: { x: number; y: number };

  glow: number;
};

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;







export const visualFor = (seed: string, w: number, h: number): Visual => {
  if (!(w > 0 && h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) throw new RangeError(`keyword-reveal visualFor: size must be positive and finite, got ${w}x${h}`);
  const rnd = mulberry32(hashSeed(`keyword-reveal|${seed}`));
  const span = (lo: number, hi: number): number => lo + (hi - lo) * rnd();
  const humpCycles = span(0.8, 1.6);
  const humpPhase = rnd();
  const step = span(0.05, 0.11);
  const k0 = span(1.8, 3.2);
  const spacing = h / (WAVE_COUNT - 1);
  const waves: Wave[] = Array.from({ length: WAVE_COUNT }, (_, i) => {
    const t = i / (WAVE_COUNT - 1);

    const hump = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t * humpCycles + humpPhase));
    const lead = i % 6 === 2;
    return {
      y: r1(h * (0.03 + 0.94 * t)),
      amp: r1(spacing * (0.7 + 1.9 * hump)),
      k: r3(k0 + 0.9 * hump + span(-0.08, 0.08)),
      ph: r3(i * step),
      jit: r3(span(-1, 1)),
      w: lead ? 4 : 2.5,
      a: lead ? 0.9 : r3(span(0.34, 0.5)),
    };
  });
  const focus = { x: r1(w * span(0.28, 0.72)), y: r1(h * span(0.32, 0.68)) };
  const rings: Ring[] = Array.from({ length: RING_COUNT }, (_, j) => ({
    r: r1(h * (0.55 + 0.5 * j) * span(0.9, 1.1)),
    w: j === RING_COUNT - 1 ? 3 : 2,
    a: [0.5, 0.38, 0.3][j],
    dash: r1(span(10, 18)),
    gap: r1(span(8, 14)),
    a0: r3(span(0, 2 * Math.PI)),
    sweep: r3(span(0.7, 1.3) + 0.25 * j),
    arcW: 5 - j,
  }));
  return { w, h, waves, rings, focus, glow: r1(Math.max(w, h) * 0.55) };
};







export const wavePath = (wv: Wave, w: number, phase: number, ampScale: number, disorder: number): string => {
  let d = "";
  for (let i = 0; i <= WAVE_STEPS; i++) {
    const u = i / WAVE_STEPS;
    const env = 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * u), 1.2);
    const a = 2 * Math.PI * (wv.k * u + wv.ph + phase * 0.6 + disorder * wv.jit * 0.35);
    const b = 2 * Math.PI * (2.3 * wv.k * u - 0.7 * wv.ph - phase * 1.1);
    const y = wv.y + (wv.amp * ampScale * env * (Math.sin(a) + 0.35 * Math.sin(b))) / 1.35;
    d += `${i === 0 ? "M" : "L"}${r1(u * w)} ${r1(y)}`;
  }
  return d;
};


export const ringPoint = (cx: number, cy: number, r: number, angle: number): { x: number; y: number } => ({
  x: r1(cx + r * Math.cos(angle)),
  y: r1(cy + r * Math.sin(angle)),
});


export const ringArc = (ring: Ring, index: number, phase: number): { start: number; end: number } => {
  const dir = index % 2 === 0 ? 1 : -1;
  const start = ring.a0 + dir * phase * ROT_TURNS * 2 * Math.PI * (1 + 0.35 * index);
  return { start, end: start + ring.sweep };
};


export const arcPath = (cx: number, cy: number, r: number, start: number, end: number): string => {
  const a = ringPoint(cx, cy, r, start);
  const b = ringPoint(cx, cy, r, end);
  return `M${a.x} ${a.y}A${r1(r)} ${r1(r)} 0 ${end - start > Math.PI ? 1 : 0} 1 ${b.x} ${b.y}`;
};
