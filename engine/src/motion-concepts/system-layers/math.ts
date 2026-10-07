import { EASE, mix } from "../../core/motion.ts";
import { mixColor, parseColor } from "../color.ts";
import { SURFACE_INSET, mainBottom, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, pulse, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



export type Vec3 = readonly [x: number, y: number, z: number];
export type Pt = { x: number; y: number };







export type Camera = { yaw: number; pitch: number; distance: number; focal: number; cx: number; cy: number };

const basis = (cam: Camera) => ({ cy: Math.cos(cam.yaw), sy: Math.sin(cam.yaw), cp: Math.cos(cam.pitch), sp: Math.sin(cam.pitch) });


export const toCamera = (p: Vec3, cam: Camera): Vec3 => {
  const { cy, sy, cp, sp } = basis(cam);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  return [x1, p[1] * cp + z1 * sp, cam.distance - p[1] * sp + z1 * cp];
};


export const project = (p: Vec3, cam: Camera): Pt & { depth: number } => {
  const [xc, yc, zc] = toCamera(p, cam);
  if (!(zc > 1e-6)) throw new RangeError(`system-layers project: point ${JSON.stringify(p)} is at or behind the camera (depth ${zc})`);
  return { x: cam.cx + (cam.focal * xc) / zc, y: cam.cy - (cam.focal * yc) / zc, depth: zc };
};





export const vanishingPoint = (d: Vec3, cam: Camera): Pt | null => {
  const { cy, sy, cp, sp } = basis(cam);
  const x1 = d[0] * cy + d[2] * sy;
  const z1 = -d[0] * sy + d[2] * cy;
  const zc = -d[1] * sp + z1 * cp;
  if (Math.abs(zc) < 1e-9) return null;
  return { x: cam.cx + (cam.focal * x1) / zc, y: cam.cy - (cam.focal * (d[1] * cp + z1 * sp)) / zc };
};


export const polygonArea2 = (pts: readonly Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
};


export const insideConvex = (pts: readonly Pt[], p: Pt, eps = 1e-6): boolean => {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) <= eps) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};




export type SlabDims = { hw: number; hd: number; t: number };


export const WORLD = { hw: 500, hd: 220, t: 40, gap: 220 } as const;
export const LAYER_COUNT = 5;

export const CAMERA = { yaw: 0, pitch: (32 * Math.PI) / 180, distance: 2600 } as const;


export const NL = 0;
export const NR = 1;
export const FR = 2;
export const FL = 3;

export type SlabQuads = {

  top: Pt[];

  front: Pt[];
};


export const slabQuads = (y: number, dims: SlabDims, cam: Camera): SlabQuads => {
  const { hw, hd, t } = dims;
  const P = (x: number, yy: number, z: number): Pt => {
    const q = project([x, yy, z], cam);
    return { x: q.x, y: q.y };
  };
  const yt = y + t / 2;
  const yb = y - t / 2;
  return {
    top: [P(-hw, yt, -hd), P(hw, yt, -hd), P(hw, yt, hd), P(-hw, yt, hd)],
    front: [P(-hw, yt, -hd), P(hw, yt, -hd), P(hw, yb, -hd), P(-hw, yb, -hd)],
  };
};






export const layerYs = (gaps: readonly number[], dims: SlabDims = WORLD, gapMax: number = WORLD.gap): number[] => {
  const step = (k: number) => dims.t + gapMax * gaps[k];
  const y2 = 0;
  const y1 = y2 + step(1);
  const y0 = y1 + step(0);
  const y3 = y2 - step(2);
  const y4 = y3 - step(3);
  return [y0, y1, y2, y3, y4];
};


export const RAILS: readonly (readonly [x: number, z: number])[] = [
  [-WORLD.hw, -WORLD.hd],
  [WORLD.hw, -WORLD.hd],
  [-WORLD.hw, WORLD.hd],
  [WORLD.hw, WORLD.hd],
];



type LayerBeatKey = "label0" | "label1" | "label2" | "label3" | "label4" | "read0" | "read1" | "read2" | "read3" | "read4";
type OnceKey = "open1" | "open2" | LayerBeatKey | "hold";
type LoopKey = OnceKey | "labelsOut" | "close1" | "close2";


const layerBeats = (start: number, step: number, len: number, tail: number): Record<LayerBeatKey, readonly [number, number]> => {
  const out = {} as Record<LayerBeatKey, readonly [number, number]>;
  for (let i = 0; i < LAYER_COUNT; i++) {
    const a = start + i * step;
    out[`label${i}` as LayerBeatKey] = [a, a + len];
    out[`read${i}` as LayerBeatKey] = [a, a + len + tail];
  }
  return out;
};




const ONCE: BeatSpec<OnceKey> = {
  open1: [0.08, 0.3],
  open2: [0.1, 0.32],
  ...layerBeats(0.34, 0.045, 0.09, 0.06),
  hold: [0.7, 1],
};



const LOOP: BeatSpec<LoopKey> = {
  open1: [0.06, 0.24],
  open2: [0.08, 0.26],
  ...layerBeats(0.28, 0.035, 0.08, 0.05),
  hold: [0.56, 0.78],
  labelsOut: [0.78, 0.83],
  close2: [0.83, 0.94],
  close1: [0.85, 0.96],
};

const ORDER: readonly OnceKey[] = ["open1", "open2", "label0", "label1", "label2", "label3", "label4"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { labelsOut?: Beat; close1?: Beat; close2?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;







export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  const lastGapOpen = Math.max(beats.open1.to, beats.open2.to);
  for (let i = 0; i < LAYER_COUNT; i++) {
    const b = beats[`label${i}` as LayerBeatKey];
    if (b.from < lastGapOpen) issues.push(`label${i} starts (${b.from}) before the gaps have opened (${lastGapOpen})`);
    if (beats[`read${i}` as LayerBeatKey].to > beats.hold.from) issues.push(`read${i} runs into the hold`);
  }
  if (mode === "loop") {
    const { labelsOut, close1, close2 } = beats;
    if (!labelsOut || !close1 || !close2) issues.push("loop beats labelsOut, close1 and close2 are missing");
    else {
      if (labelsOut.from !== beats.hold.to) issues.push("labelsOut must start where the hold ends");
      if (Math.min(close1.from, close2.from) < labelsOut.to) issues.push("the plates close before the labels have left");
      if (Math.max(close1.to, close2.to) > duration) issues.push("the plates close after the last frame");
    }
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;



export type SystemLayersParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;
};


export const TITLE_H = 52;
export const DETAIL_H = 34;
export const TEXT_GAP = 4;

const PAD_X = 28;
const PAD_Y = 12;

const CHIP_GAP = 20;

const BLOCK_MAX = 96;

export type LayerLayout = {

  top: Pt[];
  front: Pt[];

  band: { top: number; bottom: number };

  block: Rect;
  chip: Rect;
  title: Rect;
  titleSolo: Rect;
  detail: Rect;
};

export type Layout = {

  zone: Rect;

  camera: Camera;

  scale: number;

  vanishing: Pt;
  layers: LayerLayout[];
};

const bounds = (pts: readonly Pt[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
};


const leftAt = (top: readonly Pt[], y: number): number => top[FL].x + ((top[NL].x - top[FL].x) * (y - top[FL].y)) / (top[NL].y - top[FL].y);
const rightAt = (top: readonly Pt[], y: number): number => top[FR].x + ((top[NR].x - top[FR].x) * (y - top[FR].y)) / (top[NR].y - top[FR].y);


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean }): Layout => {
  const zone: Rect = {
    x: box.left + SURFACE_INSET,
    y: box.top + SURFACE_INSET,

    width: box.right - SURFACE_INSET - (box.left + SURFACE_INSET),
    height: mainBottom(box) - SURFACE_INSET - (box.top + SURFACE_INSET),
  };


  const design: Camera = { yaw: CAMERA.yaw, pitch: CAMERA.pitch, distance: CAMERA.distance, focal: CAMERA.distance, cx: 0, cy: 0 };
  const spread = layerYs([1, 1, 1, 1]);
  const spreadQuads = spread.map((y) => slabQuads(y, WORLD, design));
  const b = bounds(spreadQuads.flatMap((q) => [...q.top, ...q.front]));
  const scale = Math.min(zone.width / (b.maxX - b.minX), zone.height / (b.maxY - b.minY));
  const camera: Camera = {
    ...design,
    focal: design.focal * scale,
    cx: zone.x + zone.width / 2 - (scale * (b.minX + b.maxX)) / 2,
    cy: zone.y + zone.height / 2 - (scale * (b.minY + b.maxY)) / 2,
  };
  const vp = vanishingPoint([0, 1, 0], camera);
  if (!vp) throw new RangeError("system-layers layoutFor: the vertical axis has no vanishing point (pitch 0)");

  const quads = spread.map((y) => slabQuads(y, WORLD, camera));
  const layers: LayerLayout[] = quads.map((q, i) => {
    const farY = q.top[FL].y;
    const nearY = q.top[NL].y;

    const coverBottom = i === 0 ? -Infinity : quads[i - 1].front[2].y;
    const band = { top: Math.max(farY, coverBottom), bottom: nearY };

    const yTop = band.top + PAD_Y;
    const yBot = band.bottom - PAD_Y;
    const blockH = Math.min(BLOCK_MAX, yBot - yTop);
    const by = yTop + (yBot - yTop - blockH) / 2;

    const left = Math.max(leftAt(q.top, by), leftAt(q.top, by + blockH)) + PAD_X;
    const right = Math.min(rightAt(q.top, by), rightAt(q.top, by + blockH)) - PAD_X;
    const chipS = Math.round(Math.min(64, blockH * 0.7));
    const chipY = by + (blockH - chipS) / 2;
    const stack = TITLE_H + TEXT_GAP + DETAIL_H;
    const tx0 = opts.rtl ? left : left + chipS + CHIP_GAP;
    const tx1 = opts.rtl ? right - chipS - CHIP_GAP : right;
    const chipX = opts.rtl ? right - chipS : left;
    const ty = by + (blockH - stack) / 2;
    return {
      top: q.top,
      front: q.front,
      band,
      block: roundRect({ x: left, y: by, width: right - left, height: blockH }),
      chip: roundRect({ x: chipX, y: chipY, width: chipS, height: chipS }),
      title: roundRect({ x: tx0, y: ty, width: tx1 - tx0, height: TITLE_H }),
      titleSolo: roundRect({ x: tx0, y: by + (blockH - TITLE_H) / 2, width: tx1 - tx0, height: TITLE_H }),
      detail: roundRect({ x: tx0, y: ty + TITLE_H + TEXT_GAP, width: tx1 - tx0, height: DETAIL_H }),
    };
  });

  return { zone, camera, scale, vanishing: vp, layers };
};



const num = (v: number): string => String(Math.round(v * 100) / 100);





export const roundedPath = (pts: readonly Pt[], r: number): string => {
  const n = pts.length;
  if (r <= 0) return `M${pts.map((p) => `${num(p.x)} ${num(p.y)}`).join(" L")} Z`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i + n - 1) % n];
    const next = pts[(i + 1) % n];
    const d1 = Math.hypot(prev.x - p.x, prev.y - p.y);
    const d2 = Math.hypot(next.x - p.x, next.y - p.y);
    const t1 = d1 > 0 ? Math.min(r, d1 / 2) / d1 : 0;
    const t2 = d2 > 0 ? Math.min(r, d2 / 2) / d2 : 0;
    const a = { x: p.x + (prev.x - p.x) * t1, y: p.y + (prev.y - p.y) * t1 };
    const c = { x: p.x + (next.x - p.x) * t2, y: p.y + (next.y - p.y) * t2 };
    d += `${i === 0 ? "M" : " L"}${num(a.x)} ${num(a.y)} Q${num(p.x)} ${num(p.y)} ${num(c.x)} ${num(c.y)}`;
  }
  return `${d} Z`;
};






export const flatten = (fg: string, bg: string): string => {
  const [r, g, b, a] = parseColor(fg);
  return a >= 1 ? fg : mixColor(bg, `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`, a);
};



export type LayerState = {

  y: number;

  top: Pt[];
  front: Pt[];

  label: number;
  dy: number;

  active: number;
};

export type SystemLayersState = {

  gaps: number[];
  layers: LayerState[];

  rails: { a: Pt; b: Pt }[];

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`system-layers stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};





export const LABEL_RISE = 10;

export const stateAt = (frame: number, duration: number, params: SystemLayersParams): SystemLayersState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const openness = (open: Beat, close?: Beat): number =>
    segBeat(frame, open, EASE.bezierMorph) * (close ? 1 - segBeat(frame, close, EASE.bezierMorph) : 1);
  const inner = openness(B.open1, B.close1);
  const outer = openness(B.open2, B.close2);
  const gaps = [outer, inner, inner, outer];
  const ys = layerYs(gaps);

  const leave = B.labelsOut ? segBeat(frame, B.labelsOut, EASE.inOut) : 0;
  const layers: LayerState[] = ys.map((y, i) => {
    const q = slabQuads(y, WORLD, L.camera);
    const label = segBeat(frame, B[`label${i}` as LayerBeatKey], EASE.land) * (1 - leave);
    return {
      y,
      top: q.top,
      front: q.front,
      label,
      dy: mix(LABEL_RISE, 0, label),
      active: pulse(frame, B[`read${i}` as LayerBeatKey]),
    };
  });

  const yTop = ys[0] + WORLD.t / 2;
  const yBottom = ys[LAYER_COUNT - 1] - WORLD.t / 2;
  const rails = RAILS.map(([x, z]) => {
    const a = project([x, yTop, z], L.camera);
    const c = project([x, yBottom, z], L.camera);
    return { a: { x: a.x, y: a.y }, b: { x: c.x, y: c.y } };
  });

  const rects: Rect[] = [];
  layers.forEach((layer, i) => {
    const bb = bounds([...layer.top, ...layer.front]);
    rects.push({ x: bb.minX, y: bb.minY, width: bb.maxX - bb.minX, height: bb.maxY - bb.minY });
    if (layer.label <= 0) return;
    const l = L.layers[i];
    for (const r of [l.chip, l.title, l.detail]) rects.push({ x: r.x, y: r.y + layer.dy, width: r.width, height: r.height });
  });

  return { gaps, layers, rails, rects };
};
