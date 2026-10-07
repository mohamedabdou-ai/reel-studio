import type { CSSProperties } from "react";
import { noise2D } from "@remotion/noise";
import {
  interpolateStyles,
  makeTransform,
  perspective as cssPerspective,
  rotate as cssRotate,
  rotateX as cssRotateX,
  rotateY as cssRotateY,
  scale as cssScale,
  skewX as cssSkewX,
  skewY as cssSkewY,
  translateX as cssTranslateX,
  translateY as cssTranslateY,
  translateZ as cssTranslateZ,
} from "@remotion/animation-utils";
import { interpolate } from "remotion";
import type { ExtrapolateType } from "remotion";
import { toFrame, useClock } from "./motion";
import { FRAME } from "./safe";






const OCTAVE_LANE = 17.31;















const BASE_LANE = 53.29;



const JITTER_STRIDE = 1.618034;
const JITTER_LANE = 37.13;



const COVER_EPS = 0.002;












export const AXIS_LANE = 101.7;




export const LANE_SPAN = 3 * AXIS_LANE + 4 * OCTAVE_LANE;

export type DriftOptions = {


  periodSec?: number;


  amp?: number;


  octaves?: number;

  lacunarity?: number;

  gain?: number;




  lane?: number;
};



export const DRIFT = {
  breath: { periodSec: 4.5, octaves: 1, gain: 0.5, lacunarity: 2 },
  float: { periodSec: 2.4, octaves: 2, gain: 0.5, lacunarity: 2 },
  sway: { periodSec: 3.2, octaves: 2, gain: 0.42, lacunarity: 2.1 },
  texture: { periodSec: 1.1, octaves: 3, gain: 0.55, lacunarity: 2 },
} as const;



const fbm = (seed: string | number, u: number, lane: number, octaves: number, lacunarity: number, gain: number): number => {
  let sum = 0;
  let norm = 0;
  let freq = 1;
  let amp = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(seed, u * freq, lane + i * OCTAVE_LANE);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return norm === 0 ? 0 : sum / norm;
};










export const drift = (seed: string | number, frame: number, fps: number, opts: DriftOptions = {}): number => {
  const periodF = Math.max(1, toFrame(opts.periodSec ?? DRIFT.float.periodSec, fps));
  const octaves = Math.max(1, Math.round(opts.octaves ?? DRIFT.float.octaves));


  const lane = BASE_LANE + (opts.lane ?? 0);
  return (opts.amp ?? 1) * fbm(seed, frame / periodF, lane, octaves, opts.lacunarity ?? 2, opts.gain ?? 0.5);
};



export const useDrift = (seed: string | number, opts: DriftOptions = {}): number => {
  const { frame, fps } = useClock();
  return drift(seed, frame, fps, opts);
};

export type Drift2DOptions = DriftOptions & {

  ampX?: number;
  ampY?: number;
};






export const drift2D = (seed: string | number, frame: number, fps: number, opts: Drift2DOptions = {}): { x: number; y: number } => {
  const lane = opts.lane ?? 0;
  return {
    x: drift(seed, frame, fps, { ...opts, amp: opts.ampX ?? opts.amp ?? 1, lane }),
    y: drift(seed, frame, fps, { ...opts, amp: opts.ampY ?? opts.amp ?? 1, lane: lane + AXIS_LANE }),
  };
};


export const useDrift2D = (seed: string | number, opts: Drift2DOptions = {}): { x: number; y: number } => {
  const { frame, fps } = useClock();
  return drift2D(seed, frame, fps, opts);
};



export type HandheldOptions = {











  ampX?: number;



  ampY?: number;


  rotateDeg?: number;


  breath?: number;


  periodSec?: number;
  octaves?: number;


  width?: number;
  height?: number;

  lane?: number;
};



export type HandheldPose = { x: number; y: number; rotate: number; scale: number };


export const HANDHELD = {

  breath: { ampX: 3, ampY: 4, rotateDeg: 0.12, breath: 0.003, periodSec: 3.2, octaves: 2 },

  hand: { ampX: 8, ampY: 10, rotateDeg: 0.35, breath: 0.006, periodSec: 1.6, octaves: 3 },

  walk: { ampX: 18, ampY: 26, rotateDeg: 0.9, breath: 0.012, periodSec: 0.95, octaves: 3 },
} as const;


























export const coverScale = (tx: number, ty: number, rotateDeg: number, W: number, H: number): number => {
  const r = (Math.abs(rotateDeg) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const ax = Math.abs(tx);
  const ay = Math.abs(ty);
  const needW = c + (H / W) * s + (2 * (ax * c + ay * s)) / W;
  const needH = c + (W / H) * s + (2 * (ax * s + ay * c)) / H;
  return Math.max(1, needW, needH) + COVER_EPS;
};



const handheldResolved = (opts: HandheldOptions) => ({
  ampX: opts.ampX ?? HANDHELD.hand.ampX,
  ampY: opts.ampY ?? HANDHELD.hand.ampY,
  rotateDeg: opts.rotateDeg ?? HANDHELD.hand.rotateDeg,
  breath: opts.breath ?? HANDHELD.hand.breath,
  periodSec: opts.periodSec ?? HANDHELD.hand.periodSec,
  octaves: opts.octaves ?? HANDHELD.hand.octaves,
  width: opts.width ?? FRAME.width,
  height: opts.height ?? FRAME.height,
  lane: opts.lane ?? 0,
});
















export const handheld = (seed: string | number, frame: number, fps: number, opts: HandheldOptions = {}): HandheldPose => {
  const o = handheldResolved(opts);
  const base: DriftOptions = { periodSec: o.periodSec, octaves: o.octaves, lacunarity: 2, gain: 0.5 };
  const x = drift(seed, frame, fps, { ...base, amp: o.ampX, lane: o.lane });
  const y = drift(seed, frame, fps, { ...base, amp: o.ampY, lane: o.lane + AXIS_LANE });
  const rotate = drift(seed, frame, fps, { ...base, amp: o.rotateDeg, lane: o.lane + 2 * AXIS_LANE });









  const cover = coverScale(o.ampX, o.ampY, o.rotateDeg, o.width, o.height);



  const swell = 0.5 + 0.5 * drift(seed, frame, fps, { ...base, periodSec: o.periodSec * 2.4, amp: 1, lane: o.lane + 3 * AXIS_LANE });
  return { x, y, rotate, scale: cover + o.breath * swell };
};


export const useHandheld = (seed: string | number, opts: HandheldOptions = {}): HandheldPose => {
  const { frame, fps } = useClock();
  return handheld(seed, frame, fps, opts);
};












export const handheldBounds = (opts: HandheldOptions = {}): HandheldPose => {
  const o = handheldResolved(opts);
  return {
    x: o.ampX,
    y: o.ampY,
    rotate: o.rotateDeg,
    scale: coverScale(o.ampX, o.ampY, o.rotateDeg, o.width, o.height) + o.breath,
  };
};



export type JitterOptions = {

  amp?: number;

  lane?: number;
};











export const jitter = (seed: string | number, frame: number, steps: number, opts: JitterOptions = {}): number => {
  const stepF = Math.max(1, Math.round(steps));
  const index = Math.floor(frame / stepF);
  return (opts.amp ?? 1) * noise2D(seed, index * JITTER_STRIDE, JITTER_LANE + (opts.lane ?? 0));
};


export const jitter2D = (
  seed: string | number,
  frame: number,
  steps: number,
  opts: JitterOptions & { ampX?: number; ampY?: number } = {},
): { x: number; y: number } => {
  const lane = opts.lane ?? 0;
  return {
    x: jitter(seed, frame, steps, { amp: opts.ampX ?? opts.amp ?? 1, lane }),
    y: jitter(seed, frame, steps, { amp: opts.ampY ?? opts.amp ?? 1, lane: lane + AXIS_LANE }),
  };
};



export type StopOptions = {





  easing?: (p: number) => number;



  extrapolateLeft?: ExtrapolateType;
  extrapolateRight?: ExtrapolateType;
};






const snapStops = <T,>(stops: readonly number[], values: readonly T[], api: string): { frames: number[]; values: T[] } => {
  if (stops.length !== values.length) {
    throw new Error(`${api}: stops (${stops.length}) and values (${values.length}) must be the same length`);
  }
  if (stops.length === 0) throw new Error(`${api}: needs at least one stop`);
  const byFrame = new Map<number, T>();
  for (let i = 0; i < stops.length; i++) {





    if (!Number.isInteger(stops[i])) {
      throw new Error(`${api}: stop ${i} is ${stops[i]} — stops are WHOLE FRAMES (use toFrame(sec, fps) from core/motion.ts)`);
    }
    byFrame.set(stops[i], values[i]);
  }
  const entries = [...byFrame.entries()].sort((a, b) => a[0] - b[0]);
  return { frames: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
};

const rangeOptions = (opts: StopOptions) => ({
  extrapolateLeft: opts.extrapolateLeft ?? ("clamp" as ExtrapolateType),
  extrapolateRight: opts.extrapolateRight ?? ("clamp" as ExtrapolateType),
  ...(opts.easing ? { easing: opts.easing } : null),
});















export const styleAt = (
  frame: number,
  stops: readonly number[],
  styles: readonly CSSProperties[],
  opts: StopOptions = {},
): CSSProperties => {
  const snapped = snapStops(stops, styles, "styleAt");
  if (snapped.frames.length === 1) return snapped.values[0];
  return interpolateStyles(frame, snapped.frames, snapped.values, rangeOptions(opts));
};


export const useStyleAt = (stops: readonly number[], styles: readonly CSSProperties[], opts: StopOptions = {}): CSSProperties => {
  const { frame } = useClock();
  return styleAt(frame, stops, styles, opts);
};













export type Transform = {

  perspective?: number;

  x?: number;

  y?: number;

  z?: number;

  rotate?: number;

  rotateX?: number;

  rotateY?: number;

  skewX?: number;

  skewY?: number;

  scale?: number;

  scaleX?: number;

  scaleY?: number;
};

export type TransformChannel = keyof Transform;









const IDENTITY: Record<TransformChannel, number> = {
  perspective: 0,
  x: 0,
  y: 0,
  z: 0,
  rotate: 0,
  rotateX: 0,
  rotateY: 0,
  skewX: 0,
  skewY: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
};





const TRANSFORM_CHANNELS = Object.keys(IDENTITY) as TransformChannel[];












export const transformString = (t: Transform): string => {
  const parts: string[] = [];
  if (t.perspective !== undefined) parts.push(cssPerspective(t.perspective));
  if (t.x !== undefined) parts.push(cssTranslateX(t.x));
  if (t.y !== undefined) parts.push(cssTranslateY(t.y));
  if (t.z !== undefined) parts.push(cssTranslateZ(t.z));
  if (t.rotateX !== undefined) parts.push(cssRotateX(t.rotateX));
  if (t.rotateY !== undefined) parts.push(cssRotateY(t.rotateY));
  if (t.rotate !== undefined) parts.push(cssRotate(t.rotate));
  if (t.skewX !== undefined) parts.push(cssSkewX(t.skewX));
  if (t.skewY !== undefined) parts.push(cssSkewY(t.skewY));
  if (t.scale !== undefined || t.scaleX !== undefined || t.scaleY !== undefined) {
    const u = t.scale ?? 1;
    parts.push(cssScale(u * (t.scaleX ?? 1), u * (t.scaleY ?? 1)));
  }
  return makeTransform(parts);
};




const holdFill = (raw: readonly (number | undefined)[]): number[] => {
  const out: (number | undefined)[] = raw.slice();
  let prev: number | undefined;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === undefined) out[i] = prev;
    else prev = out[i];
  }
  let next: number | undefined;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === undefined) out[i] = next;
    else next = out[i];
  }
  return out.map((v) => v ?? 0);
};













export const transformAt = (
  frame: number,
  stops: readonly number[],
  transforms: readonly Transform[],
  opts: StopOptions = {},
): string => {
  const snapped = snapStops(stops, transforms, "transformAt");
  if (snapped.frames.length === 1) return transformString(snapped.values[0]);
  const range = rangeOptions(opts);
  const resolved: Transform = {};
  for (const ch of TRANSFORM_CHANNELS) {
    const raw = snapped.values.map((t) => t[ch]);
    if (raw.every((v) => v === undefined)) continue;
    const outputs = ch === "perspective" ? holdFill(raw) : raw.map((v) => v ?? IDENTITY[ch]);
    resolved[ch] = interpolate(frame, snapped.frames, outputs, range);
  }
  return transformString(resolved);
};


export const useTransformAt = (stops: readonly number[], transforms: readonly Transform[], opts: StopOptions = {}): string => {
  const { frame } = useClock();
  return transformAt(frame, stops, transforms, opts);
};
