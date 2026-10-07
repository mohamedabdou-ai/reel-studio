import { getLength, getPointAtLength, getSubpaths } from "@remotion/paths";
import { EASE, clamp01, mix } from "../../core/motion.ts";
import { SURFACE_INSET, insetRect, mainBottom, rectBottom, rectRight, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import {
  beatFrames,
  beatIssues,
  hashSeed,
  loopAngle,
  minDuration,
  mulberry32,
  seg,
  segBeat,
  type Beat,
  type BeatRules,
  type BeatSpec,
  type Beats,
} from "../timeline.ts";
import { CONCEPT_DEFAULT_FRAMES, type ConceptMode } from "../types.ts";
import { MAX_ASPECT, MIN_ASPECT, parseViewBox } from "./schema.ts";



type OnceKey = "gather" | "solid" | "name" | "tagline" | "hold";
type LoopKey = OnceKey | "textOut" | "solidOut" | "scatter";



const ONCE: BeatSpec<OnceKey> = {
  gather: [0.18, 0.5],
  solid: [0.46, 0.6],
  name: [0.56, 0.68],
  tagline: [0.62, 0.74],
  hold: [0.74, 1],
};



const LOOP: BeatSpec<LoopKey> = {
  gather: [0.1, 0.36],
  solid: [0.33, 0.44],
  name: [0.4, 0.49],
  tagline: [0.44, 0.53],
  hold: [0.53, 0.75],
  textOut: [0.75, 0.81],
  solidOut: [0.77, 0.85],
  scatter: [0.79, 0.95],
};

const ONCE_ORDER: readonly OnceKey[] = ["gather", "solid", "name", "tagline", "hold"];
const LOOP_ORDER: readonly LoopKey[] = ["gather", "solid", "name", "tagline", "hold", "textOut", "solidOut", "scatter"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ONCE_ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: LOOP_ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { textOut?: Beat; solidOut?: Beat; scatter?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;






export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop" && beats.scatter && beats.scatter.to >= duration) issues.push("scatter must end before the last frame so the seam has chaos on both sides");
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;




export const PARTICLE_COUNT = 120;

export const SEED = "chaos-to-brand/1";


export type Pt = { x: number; y: number; t: number };
export type MarkShape = { readonly points: readonly Pt[]; readonly aspect: number };

export type Subpath = { d: string; len: number; closed: boolean };
const SUBPATHS = new Map<string, readonly Subpath[]>();


export const subpathsOf = (d: string): readonly Subpath[] => {
  const hit = SUBPATHS.get(d);
  if (hit) return hit;
  const parts = getSubpaths(d)
    .map((s) => ({ d: s, len: getLength(s), closed: /[zZ]\s*$/.test(s.trim()) }))
    .filter((s) => s.len > 1e-6);
  SUBPATHS.set(d, parts);
  return parts;
};


export const allocate = (lengths: readonly number[], count: number): number[] => {
  const total = lengths.reduce((a, b) => a + b, 0);
  const raw = lengths.map((l) => (count * l) / total);
  const out = raw.map((r) => Math.max(2, Math.floor(r)));
  let sum = out.reduce((a, b) => a + b, 0);
  while (sum < count) {
    let k = 0;
    let best = -Infinity;
    raw.forEach((r, i) => {
      if (r - out[i] > best) {
        best = r - out[i];
        k = i;
      }
    });
    out[k] += 1;
    sum += 1;
  }
  while (sum > count) {
    let k = -1;
    let best = -Infinity;
    out.forEach((o, i) => {
      if (o > 2 && o - raw[i] > best) {
        best = o - raw[i];
        k = i;
      }
    });
    if (k < 0) break;
    out[k] -= 1;
    sum -= 1;
  }
  return out;
};

const PATH_SHAPES = new Map<string, MarkShape>();







export const pathShape = (d: string, viewBox: string, count = PARTICLE_COUNT): MarkShape => {
  const key = `${count}|${viewBox}|${d}`;
  const hit = PATH_SHAPES.get(key);
  if (hit) return hit;
  const vb = parseViewBox(viewBox);
  if (!vb) throw new RangeError(`chaos-to-brand: bad viewBox ${JSON.stringify(viewBox)}`);
  const aspect = vb.width / vb.height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) throw new RangeError(`chaos-to-brand: viewBox aspect ${aspect} is outside ${MIN_ASPECT}..${MAX_ASPECT}`);
  const subs = subpathsOf(d);
  if (subs.length === 0) throw new RangeError("chaos-to-brand: the path has no length");
  if (subs.length * 2 > count) throw new RangeError(`chaos-to-brand: ${subs.length} sub-paths need at least ${subs.length * 2} particles, there are ${count}`);
  const counts = allocate(subs.map((s) => s.len), count);
  const points: Pt[] = [];
  subs.forEach((s, k) => {
    const n = counts[k];
    for (let m = 0; m < n; m++) {
      const t = s.closed ? m / n : m / (n - 1);
      const at = getPointAtLength(s.d, Math.min(s.len, Math.max(0, t * s.len)));
      if (!at) throw new RangeError(`chaos-to-brand: no point at ${t} of ${s.d}`);
      points.push({ x: clamp01((at.x - vb.x) / vb.width), y: clamp01((at.y - vb.y) / vb.height), t });
    }
  });
  const shape: MarkShape = { points, aspect };
  PATH_SHAPES.set(key, shape);
  return shape;
};


export type Mask = { readonly width: number; readonly height: number; readonly alpha: ArrayLike<number> };

export const INK_THRESHOLD = 128;
const MAX_INK_CELLS = 6000;
const CANDIDATES = 10;

const checkMask = (mask: Mask): void => {
  if (!Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1) {
    throw new RangeError(`chaos-to-brand: mask must be whole pixels, got ${mask.width}x${mask.height}`);
  }
  if (mask.alpha.length !== mask.width * mask.height) throw new RangeError(`chaos-to-brand: mask has ${mask.alpha.length} pixels, expected ${mask.width * mask.height}`);
};


export const maskInk = (mask: Mask): Rect | null => {
  checkMask(mask);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -1;
  let y2 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.alpha[y * mask.width + x] >= INK_THRESHOLD) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 };
};






export const maskShape = (mask: Mask, count = PARTICLE_COUNT, seed: string | number = SEED): MarkShape => {
  const ink = maskInk(mask);
  if (!ink) throw new RangeError("chaos-to-brand: the text mark has no ink (blank text, or a glyph the font does not have)");
  const aspect = ink.width / ink.height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) throw new RangeError(`chaos-to-brand: text mark aspect ${aspect} is outside ${MIN_ASPECT}..${MAX_ASPECT}`);
  const cells: [number, number][] = [];
  for (let y = ink.y; y < ink.y + ink.height; y++) {
    for (let x = ink.x; x < ink.x + ink.width; x++) if (mask.alpha[y * mask.width + x] >= INK_THRESHOLD) cells.push([x, y]);
  }
  const stride = Math.max(1, Math.ceil(cells.length / MAX_INK_CELLS));
  const pool = stride === 1 ? cells : cells.filter((_, i) => i % stride === 0);
  const rnd = mulberry32(hashSeed(`${seed}|mask`));
  const pick = (): [number, number] => pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
  const chosen: [number, number][] = [pick()];
  while (chosen.length < count) {
    let best = pick();
    let bestD = -1;
    for (let k = 0; k < CANDIDATES; k++) {
      const c = pick();
      let d = Infinity;
      for (const o of chosen) d = Math.min(d, (c[0] - o[0]) ** 2 + (c[1] - o[1]) ** 2);
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    chosen.push(best);
  }
  const points = chosen.map(([x, y]) => {
    const u = clamp01((x + 0.5 - ink.x) / ink.width);
    return { x: u, y: clamp01((y + 0.5 - ink.y) / ink.height), t: u };
  });
  return { points, aspect };
};



export type Layout = {

  field: Rect;

  region: Rect;

  mark: Rect;
  name: Rect;
  tagline: Rect;
};


export const DOT_R = 6;
export const STROKE_PX = 12;

export const NAME_RISE = 28;
export const TAGLINE_RISE = 22;


export const layoutFor = (box: ConceptBox, opts: { aspect: number }): Layout => {
  const a = opts.aspect;
  if (!(a >= MIN_ASPECT && a <= MAX_ASPECT)) throw new RangeError(`chaos-to-brand layoutFor: aspect ${a} is outside ${MIN_ASPECT}..${MAX_ASPECT}`);
  const top = box.top + SURFACE_INSET;

  const field: Rect = { x: box.left + SURFACE_INSET, y: top, width: box.width - 2 * SURFACE_INSET, height: mainBottom(box) - SURFACE_INSET - top };
  const W = field.width;
  const H = field.height;
  const regionW = Math.round(W * 0.74);
  const regionH = Math.round(H * 0.5);
  const gap1 = Math.round(H * 0.07);
  const nameH = Math.round(H * 0.135);
  const gap2 = Math.round(H * 0.03);
  const tagH = Math.round(H * 0.165);
  const y0 = field.y + Math.round((H - (regionH + gap1 + nameH + gap2 + tagH)) / 2);
  const region: Rect = { x: field.x + Math.round((W - regionW) / 2), y: y0, width: regionW, height: regionH };
  let mw = regionH * a;
  let mh = regionH;
  if (mw > regionW) {
    mw = regionW;
    mh = regionW / a;
  }
  const mark = roundRect({ x: region.x + (regionW - mw) / 2, y: region.y + (regionH - mh) / 2, width: mw, height: mh });
  const nameW = Math.round(W * 0.92);
  const tagW = Math.round(W * 0.86);
  const name: Rect = { x: field.x + Math.round((W - nameW) / 2), y: y0 + regionH + gap1, width: nameW, height: nameH };
  const tagline: Rect = { x: field.x + Math.round((W - tagW) / 2), y: name.y + nameH + gap2, width: tagW, height: tagH };
  return { field, region, mark, name, tagline };
};



const R0_MIN = 4.5;
const R0_MAX = 12.5;
const AMP_MIN = 18;
const AMP_MAX = 88;

const BOW = 0.22;

export type Particle = {

  hx: number;
  hy: number;
  amp: number;

  r0: number;
  o0: number;

  cycles: readonly [number, number, number, number];
  phase: readonly [number, number, number, number];

  delay: number;
  wait: number;

  bow: number;

  tx: number;
  ty: number;
  along: number;
};

export type Plan = { readonly particles: readonly Particle[] };

const PLANS = new WeakMap<MarkShape, Map<string, Plan>>();







export const planFor = (L: Layout, shape: MarkShape, seed: string | number = SEED): Plan => {
  const key = `${seed}|${L.field.x},${L.field.y},${L.field.width},${L.field.height}|${L.mark.x},${L.mark.y},${L.mark.width},${L.mark.height}`;
  let byKey = PLANS.get(shape);
  if (!byKey) PLANS.set(shape, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;

  const n = shape.points.length;
  const rnd = mulberry32(hashSeed(`${seed}|plan`));
  const inner = insetRect(L.field, R0_MAX + 4 + AMP_MIN);
  const cols = Math.max(1, Math.round(Math.sqrt((n * inner.width) / inner.height)));
  const rows = Math.ceil(n / cols);
  const cw = inner.width / cols;
  const ch = inner.height / rows;
  const cellOrder = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = cellOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cellOrder[i], cellOrder[j]] = [cellOrder[j], cellOrder[i]];
  }
  const homes = cellOrder.slice(0, n).map((ci) => ({
    x: inner.x + ((ci % cols) + 0.08 + 0.84 * rnd()) * cw,
    y: inner.y + (Math.floor(ci / cols) + 0.08 + 0.84 * rnd()) * ch,
  }));

  const base = homes.map((h) => {
    const depth = rnd();
    const r0 = R0_MIN + (R0_MAX - R0_MIN) * Math.pow(depth, 1.6);
    const room = Math.min(h.x - L.field.x, rectRight(L.field) - h.x, h.y - L.field.y, rectBottom(L.field) - h.y) - r0 - 2;
    return {
      hx: h.x,
      hy: h.y,
      r0,
      o0: 0.28 + 0.6 * depth,

      amp: Math.max(0, Math.min(AMP_MAX * (0.55 + 0.45 * depth), room)),
      cycles: [1 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 3)] as const,
      phase: [rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI] as const,
      delay: rnd(),
      wait: rnd(),
      bow: rnd() * 2 - 1,
    };
  });

  const targets = shape.points.map((p) => ({ x: L.mark.x + p.x * L.mark.width, y: L.mark.y + p.y * L.mark.height, t: p.t }));
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const cx = L.field.x + L.field.width / 2;
  const cy = L.field.y + L.field.height / 2;
  const taken = new Array<boolean>(n).fill(false);
  const particles = new Array<Particle>(n);
  for (const j of order) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      const d = (base[i].hx - targets[j].x) ** 2 + (base[i].hy - targets[j].y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    taken[best] = true;
    const b = base[best];
    const { x: tx, y: ty, t } = targets[j];


    const toward = -(ty - b.hy) * (cx - (b.hx + tx) / 2) + (tx - b.hx) * (cy - (b.hy + ty) / 2);

    particles[best] = { ...b, delay: clamp01(0.75 * b.delay + 0.25 * t), bow: (toward >= 0 ? 1 : -1) * (0.35 + 0.65 * Math.abs(b.bow)), tx, ty, along: t };
  }
  const plan: Plan = { particles };
  byKey.set(key, plan);
  return plan;
};











const DRAW_END = 0.85;

const HANDOVER = 0.15;


export const markDraw = (solid: number): number => clamp01(solid / DRAW_END);


export const dotGone = (solid: number, t: number): number => seg(solid, DRAW_END * t, DRAW_END * t + HANDOVER, EASE.inOut);


export const GLYPH_CLIP_PAD = 24;






export const glyphClip = (mark: Rect, draw: number): Rect => {
  const d = clamp01(draw);
  return { x: mark.x - GLYPH_CLIP_PAD, y: mark.y - GLYPH_CLIP_PAD, width: GLYPH_CLIP_PAD + mark.width * d + (d >= 1 ? GLYPH_CLIP_PAD : 0), height: mark.height + 2 * GLYPH_CLIP_PAD };
};


const hasPoint = (r: Rect, x: number, y: number, slack = 1e-9): boolean =>
  x >= r.x - slack && x <= r.x + r.width + slack && y >= r.y - slack && y <= r.y + r.height + slack;

export type MarkKind = "path" | "text";


const UNIT: Rect = { x: 0, y: 0, width: 1, height: 1 };







export const handoverCoverage = (t: number, solid: number, kind: MarkKind): number => {
  const dot = 1 - dotGone(solid, t);
  const draw = markDraw(solid);
  const ink = kind === "text" ? (hasPoint(glyphClip(UNIT, draw), t, 0.5) ? 1 : 0) : draw >= t ? 1 : 0;
  return 1 - (1 - dot) * (1 - ink);
};



export type ChaosToBrandParams = {
  mode: ConceptMode;
  box: ConceptBox;
  shape: MarkShape;
  seed?: string | number;
};

export type ParticleState = {
  x: number;
  y: number;

  r: number;
  opacity: number;

  tone: number;
};

export type ChaosToBrandState = {

  order: number;
  particles: ParticleState[];

  solid: number;




  mark: { draw: number; fill: number; clip: Rect };
  name: { presence: number; dy: number };
  tagline: { presence: number; dy: number };

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`chaos-to-brand stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

export const stateAt = (frame: number, duration: number, params: ChaosToBrandParams): ChaosToBrandState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, { aspect: params.shape.aspect });
  const plan = planFor(L, params.shape, params.seed);
  const B = beatsFor(params.mode, duration);



  const A = loopAngle(frame, duration, 1);
  const cyc = (base: number): number => Math.max(1, Math.round((base * duration) / CONCEPT_DEFAULT_FRAMES));
  const gLen = B.gather.to - B.gather.from;
  const sLen = B.scatter ? B.scatter.to - B.scatter.from : 0;

  const solidIn = segBeat(frame, B.solid, EASE.inOut);
  const solid = B.solidOut ? solidIn * (1 - segBeat(frame, B.solidOut, EASE.inOut)) : solidIn;

  const rects: Rect[] = [];
  let sum = 0;
  const particles = plan.particles.map((q): ParticleState => {
    const gs = B.gather.from + q.delay * 0.4 * gLen;
    let e = seg(frame, gs, gs + 0.6 * gLen, EASE.inOut);
    if (B.scatter) {
      const ss = B.scatter.from + q.wait * 0.4 * sLen;
      e *= 1 - seg(frame, ss, ss + 0.6 * sLen, EASE.inOut);
    }
    const wx = q.hx + q.amp * (0.65 * Math.sin(cyc(q.cycles[0]) * A + q.phase[0]) + 0.35 * Math.sin(cyc(q.cycles[1]) * A + q.phase[1]));
    const wy = q.hy + q.amp * (0.65 * Math.sin(cyc(q.cycles[2]) * A + q.phase[2]) + 0.35 * Math.sin(cyc(q.cycles[3]) * A + q.phase[3]));
    const bow = 4 * e * (1 - e) * q.bow * BOW;
    const r = mix(q.r0, DOT_R, e);
    const x = Math.min(Math.max(q.tx * e + wx * (1 - e) - (q.ty - wy) * bow, L.field.x + r), rectRight(L.field) - r);
    const y = Math.min(Math.max(q.ty * e + wy * (1 - e) + (q.tx - wx) * bow, L.field.y + r), rectBottom(L.field) - r);

    const gone = dotGone(solid, q.along);
    sum += e;
    rects.push({ x: x - r, y: y - r, width: 2 * r, height: 2 * r });
    return { x, y, r, opacity: mix(q.o0, 1, e) * (1 - gone), tone: e };
  });

  const out = B.textOut ? segBeat(frame, B.textOut, EASE.inOut) : 0;
  const nameP = segBeat(frame, B.name, EASE.land) * (1 - out);
  const tagP = segBeat(frame, B.tagline, EASE.land) * (1 - out);
  const name = { presence: nameP, dy: mix(NAME_RISE, 0, nameP) };
  const tagline = { presence: tagP, dy: mix(TAGLINE_RISE, 0, tagP) };

  if (solid > 0) {
    const pad = STROKE_PX / 2 + 2;
    rects.push({ x: L.mark.x - pad, y: L.mark.y - pad, width: L.mark.width + 2 * pad, height: L.mark.height + 2 * pad });
  }
  if (nameP > 0) rects.push({ x: L.name.x, y: L.name.y + name.dy, width: L.name.width, height: L.name.height });
  if (tagP > 0) rects.push({ x: L.tagline.x, y: L.tagline.y + tagline.dy, width: L.tagline.width, height: L.tagline.height });

  const draw = markDraw(solid);
  return {
    order: sum / plan.particles.length,
    particles,
    solid,
    mark: { draw, fill: seg(solid, 0.5, 1, EASE.inOut), clip: glyphClip(L.mark, draw) },
    name,
    tagline,
    rects,
  };
};
