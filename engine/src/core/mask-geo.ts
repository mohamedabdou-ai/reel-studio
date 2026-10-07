import { EASE, clamp01, envF, mix } from "./motion.ts";



export type Dir = "rtl" | "ltr" | "up" | "down";
export type MaskShape = "inset" | "circle" | "polygon";
export type MaskMode = "in" | "out";

export type Rect = { x: number; y: number; width: number; height: number };

export type MorphRect = Rect & { radius?: number };

export type Ease = (p: number) => number;
export type CardFit = "scale" | "crop";
export type PresentationName = "slide" | "wipe" | "flip" | "clockWipe" | "iris" | "fade";
export type PresentationPhase = "entering" | "exiting";
export type RemotionDirection = "from-left" | "from-right" | "from-top" | "from-bottom";


export type ClipSpec = {
  dir: Dir;
  shape: MaskShape;

  p: number;
  width: number;
  height: number;
  mode?: MaskMode;

  slantDeg?: number;

  origin?: { x: number; y: number };
};

export const DIRS: readonly Dir[] = ["rtl", "ltr", "up", "down"];
export const MASK_SHAPES: readonly MaskShape[] = ["inset", "circle", "polygon"];
export const PRESENTATION_NAMES: readonly PresentationName[] = ["slide", "wipe", "flip", "clockWipe", "iris", "fade"];


export const DEFAULT_SLANT_DEG = 12;


export const START_EDGE: Readonly<Record<Dir, { x: number; y: number }>> = {
  rtl: { x: 1, y: 0.5 },
  ltr: { x: 0, y: 0.5 },
  up: { x: 0.5, y: 1 },
  down: { x: 0.5, y: 0 },
};



const n3 = (v: number): number => Math.round(v * 1000) / 1000;
const pct = (v: number): string => `${n3(v)}%`;
const pxs = (v: number): string => `${n3(v)}px`;

export const assertDir = (dir: string): Dir => {
  if (!(DIRS as readonly string[]).includes(dir)) {
    throw new Error(`core/mask-geo: unknown dir ${JSON.stringify(dir)} — use ${DIRS.join(" | ")}`);
  }
  return dir as Dir;
};

export const assertPresentation = (name: string): PresentationName => {
  if (!(PRESENTATION_NAMES as readonly string[]).includes(name)) {
    throw new Error(`core/mask-geo: unknown presentation ${JSON.stringify(name)} — use ${PRESENTATION_NAMES.join(" | ")}`);
  }
  return name as PresentationName;
};

const VEC: Readonly<Record<Dir, { x: number; y: number }>> = {
  rtl: { x: -1, y: 0 },
  ltr: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};


export const dirVector = (dir: Dir): { x: number; y: number } => VEC[assertDir(dir)];

export const isHorizontal = (dir: Dir): boolean => dir === "rtl" || dir === "ltr";











export const windowProgress = (frame: number, at: number, durF: number, ease: Ease = EASE.inOut): number => {
  const a = Math.round(at);
  const d = Math.max(1, Math.round(durF));
  if (!(frame >= a)) return 0;
  if (frame >= a + d - 1) return 1;
  return clamp01(ease((frame - a + 1) / d));
};




const START_SIDE: Readonly<Record<Dir, number>> = { down: 0, rtl: 1, up: 2, ltr: 3 };
const FAR_SIDE: Readonly<Record<Dir, number>> = { down: 2, rtl: 3, up: 0, ltr: 1 };


export const insetClip = (spec: ClipSpec): string => {
  const dir = assertDir(spec.dir);
  const q = clamp01(spec.p);
  const sides = [0, 0, 0, 0];
  if ((spec.mode ?? "in") === "out") sides[START_SIDE[dir]] = q * 100;
  else sides[FAR_SIDE[dir]] = (1 - q) * 100;
  return `inset(${sides.map((v) => pct(v)).join(" ")})`;
};



export const coverRadius = (cx: number, cy: number, width: number, height: number): number =>
  Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)) + 1;


export const circleClip = (spec: ClipSpec): string => {
  const dir = assertDir(spec.dir);
  const q = clamp01(spec.p);
  const o = spec.origin ?? START_EDGE[dir];
  const cx = clamp01(o.x) * spec.width;
  const cy = clamp01(o.y) * spec.height;
  const R = coverRadius(cx, cy, spec.width, spec.height);
  const r = (spec.mode ?? "in") === "out" ? (1 - q) * R : q * R;
  return `circle(${pxs(r)} at ${pxs(cx)} ${pxs(cy)})`;
};

type Pt = [number, number];


const POLY: Readonly<Record<Dir, (A: number, S: number, out: boolean) => Pt[]>> = {
  ltr: (A, S, out) =>
    out
      ? [[A, 0], [100, 0], [100, 100], [A - S, 100]]
      : [[0, 0], [A, 0], [A - S, 100], [0, 100]],
  rtl: (A, S, out) =>
    out
      ? [[0, 0], [100 - A, 0], [100 - A + S, 100], [0, 100]]
      : [[100 - A, 0], [100, 0], [100, 100], [100 - A + S, 100]],
  down: (A, S, out) =>
    out
      ? [[0, A], [100, A - S], [100, 100], [0, 100]]
      : [[0, 0], [100, 0], [100, A - S], [0, A]],
  up: (A, S, out) =>
    out
      ? [[0, 0], [100, 0], [100, 100 - A + S], [0, 100 - A]]
      : [[0, 100 - A], [100, 100 - A + S], [100, 100], [0, 100]],
};






export const polygonClip = (spec: ClipSpec): string => {
  const dir = assertDir(spec.dir);
  const q = clamp01(spec.p);
  const deg = Math.min(60, Math.max(0, spec.slantDeg ?? DEFAULT_SLANT_DEG));
  const horizontal = isHorizontal(dir);
  const travel = Math.max(1, horizontal ? spec.width : spec.height);
  const cross = Math.max(1, horizontal ? spec.height : spec.width);
  const s = Math.tan((deg * Math.PI) / 180) * (cross / travel);
  const pts = POLY[dir](q * (1 + s) * 100, s * 100, (spec.mode ?? "in") === "out");
  return `polygon(${pts.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(", ")})`;
};

export const clipPathAt = (spec: ClipSpec): string => {
  switch (spec.shape) {
    case "inset":
      return insetClip(spec);
    case "circle":
      return circleClip(spec);
    case "polygon":
      return polygonClip(spec);
    default:
      throw new Error(`core/mask-geo: unknown shape ${JSON.stringify(spec.shape)} — use ${MASK_SHAPES.join(" | ")}`);
  }
};



const EDGE: Readonly<Record<Dir, (q: number, b: Rect) => number>> = {
  rtl: (q, b) => b.x + b.width * (1 - q),
  ltr: (q, b) => b.x + b.width * q,
  up: (q, b) => b.y + b.height * (1 - q),
  down: (q, b) => b.y + b.height * q,
};



export const sweepEdge = (dir: Dir, p: number, bounds: Rect): number => EDGE[assertDir(dir)](clamp01(p), bounds);


export const lightBand = (dir: Dir, p: number, bounds: Rect, thickness: number): Rect & { gradientDeg: 90 | 180 } => {
  const edge = sweepEdge(dir, p, bounds);
  const t = Math.max(1, thickness);
  return isHorizontal(dir)
    ? { x: edge - t / 2, y: bounds.y, width: t, height: bounds.height, gradientDeg: 90 }
    : { x: bounds.x, y: edge - t / 2, width: bounds.width, height: t, gradientDeg: 180 };
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;


export const scanGradient = (deg: number, color: string, core: string = color): string => {
  if (!HEX6.test(color)) {
    throw new Error(`core/mask-geo: LightScan color must be #RRGGBB (got ${JSON.stringify(color)}) — the glow appends a hex alpha`);
  }
  return `linear-gradient(${deg}deg, transparent, ${color}77 38%, ${core} 51%, ${color}77 64%, transparent)`;
};



export const scanOpacity = (frame: number, at: number, durF: number): number => {
  const a = Math.round(at);
  const d = Math.max(1, Math.round(durF));
  if (!(frame >= a) || frame >= a + d) return 0;
  return EASE.bell((frame - a + 0.5) / d);
};




export const rectMorph = (a: MorphRect, b: MorphRect, p: number): Required<MorphRect> => ({
  x: mix(a.x, b.x, p),
  y: mix(a.y, b.y, p),
  width: mix(a.width, b.width, p),
  height: mix(a.height, b.height, p),
  radius: mix(a.radius ?? 0, b.radius ?? 0, p),
});







export const cardFit = (
  width: number,
  height: number,
  to: { width: number; height: number },
  fit: CardFit,
): { scale: number; dx: number; dy: number } => {
  const scale = fit === "scale" ? Math.max(width / Math.max(1, to.width), height / Math.max(1, to.height)) : 1;
  return { scale, dx: (width - to.width * scale) / 2, dy: (height - to.height * scale) / 2 };
};








export const whipOffset = (dir: Dir, distance: number, p: number, mode: MaskMode = "in"): { x: number; y: number } => {
  const v = dirVector(dir);
  const q = clamp01(p);
  const k = mode === "out" ? q * distance : -(1 - q) * distance;
  return { x: v.x * k + 0, y: v.y * k + 0 };
};


export const whipProgress = (frame: number, at: number, durF: number, mode: MaskMode): number =>
  windowProgress(frame, at, durF, mode === "out" ? EASE.out : EASE.land);



export const whipPeakSpeed = (distance: number, durF: number, mode: MaskMode): number =>
  ((mode === "out" ? 2 : 3) * Math.abs(distance)) / Math.max(1, Math.round(durF));


export const whipFade = (frame: number, at: number, durF: number, fadeF: number, mode: MaskMode): number => {
  const a = Math.round(at);
  const d = Math.max(1, Math.round(durF));
  const f = Math.max(0, Math.round(fadeF));
  return mode === "out"
    ? envF(frame, Number.NEGATIVE_INFINITY, a + d, 1, f)
    : envF(frame, a, Number.POSITIVE_INFINITY, f, 1);
};



const REMOTION_DIR: Readonly<Record<Dir, RemotionDirection>> = {
  rtl: "from-right",
  ltr: "from-left",
  up: "from-bottom",
  down: "from-top",
};


export const toRemotionDirection = (dir: Dir): RemotionDirection => REMOTION_DIR[assertDir(dir)];





const EXIT_BY_REVERSE: ReadonlySet<PresentationName> = new Set<PresentationName>(["clockWipe", "iris", "fade"]);

export const presentationCall = (
  name: PresentationName,
  phase: PresentationPhase,
  p: number,
): { presentationDirection: PresentationPhase; presentationProgress: number } => {
  const n = assertPresentation(name);
  const q = clamp01(p);
  if (phase === "exiting" && EXIT_BY_REVERSE.has(n)) return { presentationDirection: "entering", presentationProgress: 1 - q };
  return { presentationDirection: phase, presentationProgress: q };
};
