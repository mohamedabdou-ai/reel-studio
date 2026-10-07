import React from "react";
import {
  evolvePath,
  getLength,
  getPointAtLength,
  getSubpaths,
  getTangentAtLength,
  interpolatePath,
  parsePath,
  reduceInstructions,
} from "@remotion/paths";
import { makeCallout, makeCircle, makeRect } from "@remotion/shapes";
import type { MakeCalloutProps } from "@remotion/shapes";
import { EASE, clamp01, px, toFrame, useClock, useEnterF, useRamp } from "./motion";
import type { SpringLike } from "./motion";
import { FRAME, useProbe } from "./safe";








export type ProbeRole = "content" | "decoration" | "ground";


const DEFAULT_DRAW_SEC = 0.6;










export const VectorLayer: React.FC<{
  width?: number;
  height?: number;



  x?: number;
  y?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ width = FRAME.width, height = FRAME.height, x = 0, y = 0, style, children }) => {
  const w = px(width);
  const h = px(height);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: "absolute",
        left: px(x),
        top: px(y),


        display: "block",
        overflow: "visible",
        pointerEvents: "none",
        ...style,
      }}
    >
      {children}
    </svg>
  );
};



export type DrawPathProps = Omit<
  React.SVGProps<SVGPathElement>,


  "d" | "strokeDasharray" | "strokeDashoffset" | "key"
> & {

  d: string;




  progress?: number;


  probeRole?: ProbeRole;
};



















export const DrawPath: React.FC<DrawPathProps> = ({
  d,
  progress = 1,
  probeRole = "content",
  fill = "none",
  stroke = "currentColor",
  strokeLinecap = "round",
  strokeLinejoin = "round",
  ...rest
}) => {
  const probe = useProbe();
  if (probe && probeRole === "decoration") return null;


  const painted = probe && probeRole === "ground" ? { fill: probe, stroke: "none" } : { fill, stroke };





  const p = Number.isFinite(progress) ? clamp01(progress) : 0;
  let dash: { strokeDasharray: string; strokeDashoffset: number };
  try {
    dash = evolvePath(p, d);
  } catch (err) {
    throw new Error(`core/draw DrawPath: "${d.slice(0, 72)}" is not a usable path (${reason(err)})`, {cause: err});
  }
  return (
    <path
      d={d}
      {...painted}
      strokeLinecap={strokeLinecap}
      strokeLinejoin={strokeLinejoin}
      strokeDasharray={dash.strokeDasharray}
      strokeDashoffset={dash.strokeDashoffset}
      {...rest}
    />
  );
};

export type DrawTiming = {


  dur?: number;




  ease?: (p: number) => number;

  spring?: SpringLike;
};

















export const useDrawProgress = (atSec: number, timing: DrawTiming = {}): number => {
  const { frame, fps } = useClock();
  const atF = toFrame(atSec, fps);
  const durF = Math.max(1, toFrame(timing.dur ?? DEFAULT_DRAW_SEC, fps));
  const ramp = useRamp(atSec, durF, timing.ease ?? EASE.land);





  const sprung = useEnterF(timing.spring ? atF : frame, timing.spring ?? "land");
  if (frame < atF) return 0;
  return clamp01(timing.spring ? sprung : ramp);
};






export const DrawnFrom: React.FC<Omit<DrawPathProps, "progress"> & { at: number } & DrawTiming> = ({
  at,
  dur,
  ease,
  spring,
  ...rest
}) => {
  const progress = useDrawProgress(at, { dur, ease, spring });
  return <DrawPath progress={progress} {...rest} />;
};






const CACHE_LIMIT = 64;







const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const LENGTHS = new Map<string, number>();






export const pathLength = (d: string): number => {
  const hit = LENGTHS.get(d);
  if (hit !== undefined) return hit;
  let len: number;
  try {
    len = getLength(d);
  } catch (err) {
    throw new Error(`core/draw pathLength: "${d.slice(0, 72)}" is not a usable path (${reason(err)})`, {cause: err});
  }
  if (LENGTHS.size >= CACHE_LIMIT) LENGTHS.clear();
  LENGTHS.set(d, len);
  return len;
};

const MORPH_CHECKS = new Map<string, string | null>();









const morphKey = (a: string, b: string): string =>
  `${a.length}:${b.length}:${a.slice(0, 24)}|${a.slice(-24)}|${b.slice(0, 24)}|${b.slice(-24)}`;


const morphProblem = (a: string, b: string): string | null => {
  const key = morphKey(a, b);
  const hit = MORPH_CHECKS.get(key);
  if (hit !== undefined) return hit;
  let problem: string | null = null;
  try {
    const ai = reduceInstructions(parsePath(a));
    const bi = reduceInstructions(parsePath(b));
    const aSub = getSubpaths(a).length;
    const bSub = getSubpaths(b).length;
    if (aSub !== bSub) {
      problem = `subpath counts differ (${aSub} vs ${bSub}) — an in-between frame would fold one subpath into another`;
    } else if (ai.length !== bi.length) {
      problem = `instruction counts differ (${ai.length} vs ${bi.length}) after reduceInstructions`;
    }
  } catch (err) {

    problem = `one of the paths does not parse (${reason(err)})`;
  }
  if (MORPH_CHECKS.size >= CACHE_LIMIT) MORPH_CHECKS.clear();
  MORPH_CHECKS.set(key, problem);
  return problem;
};


















export const morphPath = (a: string, b: string, p: number, opts: { resample?: boolean } = {}): string => {
  if (!opts.resample) {
    const problem = morphProblem(a, b);
    if (problem) {
      throw new Error(
        `core/draw morphPath: ${problem}. Author both paths with the same command sequence, ` +
          `or pass { resample: true } to accept @remotion/paths' segment splitting. ` +
          `a="${a.slice(0, 72)}" b="${b.slice(0, 72)}"`,
      );
    }
  }
  return interpolatePath(clamp01(p), a, b);
};




export type PathPoint = { x: number; y: number };
















const sample = <T extends PathPoint>(what: string, d: string, p: number, get: (path: string, length: number) => T | null): T => {
  const value = get(d, pathLength(d) * clamp01(p));
  if (value === null || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error(`core/draw ${what}: no usable sample at p=${p} on "${d.slice(0, 72)}" (got ${JSON.stringify(value)})`);
  }
  return value;
};






export const pathAt = (d: string, p: number): PathPoint => sample("pathAt", d, p, getPointAtLength);


const unit = (x: number, y: number): PathPoint | null => {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len < 1e-12) return null;
  return { x: x / len, y: y / len };
};






const differenceTangent = (d: string, total: number, at: number): PathPoint | null => {
  const step = Math.min(total, Math.max(total * 1e-4, 1e-4));
  const a = Math.max(0, Math.min(total - step, at - step / 2));
  const b = Math.min(total, a + step);
  if (!(b > a)) return null;
  const p0 = getPointAtLength(d, a);
  const p1 = getPointAtLength(d, b);
  if (p0 === null || p1 === null) return null;
  return unit(p1.x - p0.x, p1.y - p0.y);
};






















export const tangentAt = (d: string, p: number): PathPoint => {
  const total = pathLength(d);
  if (!(total > 0)) {
    throw new Error(`core/draw tangentAt: "${d.slice(0, 72)}" has zero length — there is no direction to sample`);
  }
  const at = total * clamp01(p);
  const fallback = differenceTangent(d, total, at);
  const lib = getTangentAtLength(d, at);
  if (lib === null || !Number.isFinite(lib.x) || !Number.isFinite(lib.y)) {
    if (fallback === null) {
      throw new Error(`core/draw tangentAt: no usable sample at p=${p} on "${d.slice(0, 72)}"`);
    }
    return fallback;
  }

  if (fallback !== null && lib.x * fallback.x + lib.y * fallback.y < 0) return { x: -lib.x, y: -lib.y };
  return lib;
};






export const angleAt = (d: string, p: number): number => {
  const t = tangentAt(d, p);
  return (Math.atan2(t.y, t.x) * 180) / Math.PI;
};


















export type ShapePath = { d: string; width: number; height: number };


const clampRadius = (radius: number, w: number, h: number): number => Math.max(0, Math.min(radius, w / 2, h / 2));







export const rectPath = ({ width, height, radius = 0 }: { width: number; height: number; radius?: number }): ShapePath => {
  const w = Math.max(1, px(width));
  const h = Math.max(1, px(height));
  const shape = makeRect({ width: w, height: h, cornerRadius: clampRadius(radius, w, h) });
  return { d: shape.path, width: shape.width, height: shape.height };
};



export const pillPath = ({ width, height }: { width: number; height: number }): ShapePath => {
  const w = Math.max(1, px(width));
  const h = Math.max(1, px(height));
  return rectPath({ width: w, height: h, radius: Math.min(w, h) / 2 });
};



export const circlePath = ({ radius }: { radius: number }): ShapePath => {
  const shape = makeCircle({ radius: Math.max(1, px(radius)) });
  return { d: shape.path, width: shape.width, height: shape.height };
};

export type CalloutOptions = {
  width: number;
  height: number;

  pointerLength?: number;

  pointerBaseWidth?: number;

  pointerPosition?: number;
  pointerDirection?: NonNullable<MakeCalloutProps["pointerDirection"]>;
  radius?: number;
};









export const calloutPath = ({
  width,
  height,
  pointerLength = 40,
  pointerBaseWidth = 60,
  pointerPosition = 0.5,
  pointerDirection = "down",
  radius = 0,
}: CalloutOptions): ShapePath => {
  const w = Math.max(1, px(width));
  const h = Math.max(1, px(height));
  const shape = makeCallout({
    width: w,
    height: h,
    pointerLength: Math.max(1, px(pointerLength)),
    pointerBaseWidth: Math.max(1, px(pointerBaseWidth)),
    pointerPosition: clamp01(pointerPosition),
    pointerDirection,
    cornerRadius: clampRadius(radius, w, h),
  });
  return { d: shape.path, width: shape.width, height: shape.height };
};









export const underlinePath = ({ width, sag = 14, lift = 0 }: { width: number; sag?: number; lift?: number }): ShapePath => {
  const w = Math.max(1, px(width));
  const s = px(sag);
  const l = px(lift);

  const lo = Math.min(0, 2 * s, -l);
  const hi = Math.max(0, 2 * s, -l);
  const y0 = -lo;
  return {
    d: `M 0 ${y0} Q ${px(w / 2)} ${y0 + 2 * s} ${w} ${y0 - l}`,
    width: w,
    height: Math.max(1, hi - lo),
  };
};
