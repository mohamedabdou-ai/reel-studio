import { noise2D } from "@remotion/noise";
import { clamp01, envF } from "./motion.ts";

export type Seed = string | number;
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };



const RAND_STRIDE = 1.618034;
const RAND_LANE = 37.13;
const LANE_STEP = 101.7;

const LANE = {
  dir: 0, rot: 1, angle: 2, speed: 3, life: 4, size: 5, spin: 6, spin0: 7, phase: 8,
  sliceTop: 9, sliceH: 10, sliceDx: 11, split: 12,
} as const;
type Channel = keyof typeof LANE;
const DEG = Math.PI / 180;


export const seededSigned = (seed: Seed, index: number, lane = 0): number =>
  noise2D(seed, index * RAND_STRIDE, RAND_LANE + lane);
const signedAt = (seed: Seed, index: number, ch: Channel): number => seededSigned(seed, index, LANE[ch] * LANE_STEP);
const unitAt = (seed: Seed, index: number, ch: Channel): number => clamp01((signedAt(seed, index, ch) + 1) / 2);



export type RecoilPose = { x: number; y: number; rot: number };
export type ImpulseOptions = { seed: Seed; ampPx?: number; rotateDeg?: number; decayF?: number };
export const IMPULSE_DEFAULTS = { ampPx: 8, rotateDeg: 0.4, decayF: 8 } as const;

export const RECOIL_HALF_CYCLES = 3;










export const impulse = (frame: number, hitFrames: readonly number[], opts: ImpulseOptions): RecoilPose => {
  const amp = Math.max(0, opts.ampPx ?? IMPULSE_DEFAULTS.ampPx);
  const rotMax = Math.max(0, opts.rotateDeg ?? IMPULSE_DEFAULTS.rotateDeg);
  const decayF = Math.max(1, Math.round(opts.decayF ?? IMPULSE_DEFAULTS.decayF));
  let x = 0;
  let y = 0;
  let rot = 0;
  let active = false;
  for (const raw of hitFrames) {
    if (!Number.isFinite(raw)) continue;
    const hit = Math.round(raw);
    const age = frame - hit;
    if (age < 0 || age >= decayF) continue;
    active = true;
    const k = (1 - age / decayF) ** 2 * Math.cos((Math.PI * RECOIL_HALF_CYCLES * age) / decayF);
    const theta = Math.PI * signedAt(opts.seed, hit, "dir");
    x += amp * k * Math.cos(theta);
    y += amp * k * Math.sin(theta);
    rot += rotMax * k * (signedAt(opts.seed, hit, "rot") >= 0 ? 1 : -1);
  }
  if (!active) return { x: 0, y: 0, rot: 0 };
  const mag = Math.hypot(x, y);
  if (mag > amp) {
    x *= amp / mag;
    y *= amp / mag;
  }
  return { x, y, rot: Math.max(-rotMax, Math.min(rotMax, rot)) };
};



export const impulseBounds = (opts: Omit<ImpulseOptions, "seed"> = {}): RecoilPose => {
  const amp = Math.max(0, opts.ampPx ?? IMPULSE_DEFAULTS.ampPx);
  return { x: amp, y: amp, rot: Math.max(0, opts.rotateDeg ?? IMPULSE_DEFAULTS.rotateDeg) };
};




export type Motion = (frame: number) => number | Point;






export const velocityAt = (fn: Motion, frame: number): number => {
  const a = fn(frame - 1);
  const b = fn(frame);
  let v: number;
  if (typeof a === "number" && typeof b === "number") v = Math.abs(b - a);
  else if (typeof a === "object" && typeof b === "object") v = Math.hypot(b.x - a.x, b.y - a.y);
  else throw new TypeError("core/accents-math velocityAt: the motion function must return the same shape (number or {x, y}) on every frame.");
  return Number.isFinite(v) ? v : 0;
};



export type ParticleKind = "confetti" | "sparks" | "dots";


export const PARTICLE_KIND = {
  confetti: { speed: 20, gravity: 0.8, drag: 0.9, size: 16, spin: 12, flutter: 6, spread: 120 },
  sparks: { speed: 28, gravity: 0.3, drag: 0.82, size: 5, spin: 0, flutter: 0, spread: 360 },
  dots: { speed: 12, gravity: 0, drag: 0.85, size: 10, spin: 0, flutter: 0, spread: 360 },
} as const;

export const MAX_PARTICLES = 64;

export const MAX_SPARK_STRETCH = 8;

export type ParticleOptions = {
  seed: Seed;

  count: number;

  origin: Point;
  kind: ParticleKind;

  lifeF: number;

  spread?: number;

  direction?: number;
  speed?: number;
  gravity?: number;

  drag?: number;



  avoid?: Rect | null;
};

export type ParticleState = {
  i: number;

  x: number;
  y: number;

  rot: number;

  scaleX: number;

  scaleY: number;

  size: number;

  opacity: number;

  colorIndex: number;
};










export const particlesAt = (frame: number, opts: ParticleOptions): ParticleState[] => {
  const t = Math.floor(frame);
  if (!(t >= 0)) return [];
  const kind = PARTICLE_KIND[opts.kind];
  const n = Math.max(0, Math.min(MAX_PARTICLES, Math.round(Number.isFinite(opts.count) ? opts.count : 0)));
  const lifeF = Math.max(1, Math.round(opts.lifeF));
  const spread = Math.max(0, Math.min(360, opts.spread ?? kind.spread));
  const direction = opts.direction ?? -90;
  const speed = Math.max(0, opts.speed ?? kind.speed);
  const g = opts.gravity ?? kind.gravity;
  const d = Math.max(0.01, Math.min(1, opts.drag ?? kind.drag));
  const S = (age: number) => (d === 1 ? age : (1 - Math.pow(d, age)) / (1 - d));
  const fall = (age: number) => (d === 1 ? (g * age * (age - 1)) / 2 : (g * (age - S(age))) / (1 - d));
  const out: ParticleState[] = [];
  for (let i = 0; i < n; i++) {
    const life = Math.max(1, Math.round(lifeF * (0.7 + 0.3 * unitAt(opts.seed, i, "life"))));
    if (t >= life) continue;
    const slot = spread / n;
    const a = (direction + spread * ((i + 0.5) / n - 0.5) + signedAt(opts.seed, i, "angle") * 0.5 * slot) * DEG;
    const v0 = speed * (0.55 + 0.45 * unitAt(opts.seed, i, "speed"));
    const vx0 = v0 * Math.cos(a);
    const vy0 = v0 * Math.sin(a);
    const phase = Math.PI * signedAt(opts.seed, i, "phase");
    const size0 = kind.size * (0.7 + 0.6 * unitAt(opts.seed, i, "size"));
    const at = (age: number): Point => ({
      x: opts.origin.x + vx0 * S(age) + (kind.flutter === 0 ? 0 : kind.flutter * Math.sin(phase + 0.35 * age) * Math.min(1, age / 8)),
      y: opts.origin.y + vy0 * S(age) + fall(age),
    });
    if (opts.avoid) {

      const r = (size0 / 2) * (opts.kind === "sparks" ? MAX_SPARK_STRETCH : 1.5);
      const b = opts.avoid;
      let hit = false;
      for (let age = 0; age <= t && !hit; age++) {
        const p = at(age);
        hit = p.x + r > b.x && p.x - r < b.x + b.width && p.y + r > b.y && p.y - r < b.y + b.height;
      }
      if (hit) continue;
    }
    const p = at(t);
    const decay = Math.pow(d, t);
    const vx = vx0 * decay;
    const vy = vy0 * decay + g * S(t);
    const fadeF = Math.max(1, Math.round(life * 0.35));
    out.push({
      i,
      x: p.x,
      y: p.y,
      rot:
        opts.kind === "sparks"
          ? Math.atan2(vy, vx) / DEG
          : opts.kind === "confetti"
            ? 180 * signedAt(opts.seed, i, "spin0") + kind.spin * signedAt(opts.seed, i, "spin") * t
            : 0,
      scaleX: opts.kind === "sparks" ? Math.max(1, Math.min(MAX_SPARK_STRETCH, 1 + Math.hypot(vx, vy) / 3)) : 1,
      scaleY: opts.kind === "confetti" ? Math.cos(phase + 0.3 * t) : 1,
      size: opts.kind === "dots" ? size0 * (1 - (0.5 * t) / life) : size0,
      opacity: clamp01((life - t) / fadeF),
      colorIndex: i,
    });
  }
  return out;
};



export const MAX_GLITCH_SLICES = 6;
export const GLITCH_DEFAULTS = { slices: 4, shiftPx: 36, splitPx: 10 } as const;
export type GlitchSlice = { top: number; height: number; dx: number };
export type GlitchState = { active: boolean; intensity: number; split: number; slices: GlitchSlice[] };
export type GlitchOptions = {

  at: number;

  durF: number;
  seed: Seed;

  region: { top: number; height: number };
  slices?: number;
  shiftPx?: number;
  splitPx?: number;
};









export const glitchAt = (frame: number, opts: GlitchOptions): GlitchState => {
  const at = Math.round(opts.at);
  const durF = Math.max(1, Math.round(opts.durF));
  const f = Math.floor(frame);
  if (!(f >= at && f < at + durF)) return { active: false, intensity: 0, split: 0, slices: [] };
  const age = f - at;
  const intensity = envF(f, at, at + durF, 1, Math.min(2, durF));
  const n = Math.max(0, Math.min(MAX_GLITCH_SLICES, Math.round(opts.slices ?? GLITCH_DEFAULTS.slices)));
  const shift = Math.max(0, opts.shiftPx ?? GLITCH_DEFAULTS.shiftPx);
  const laneH = opts.region.height / Math.max(1, n);
  const slices: GlitchSlice[] = [];
  for (let i = 0; i < n; i++) {
    const idx = age * 8 + i;
    const top0 = opts.region.top + Math.floor(i * laneH);
    const room = opts.region.top + Math.floor((i + 1) * laneH) - top0;
    const height = Math.max(1, Math.min(room, Math.round(room * (0.18 + 0.32 * unitAt(opts.seed, idx, "sliceH")))));
    const top = top0 + Math.floor((room - height) * unitAt(opts.seed, idx, "sliceTop"));
    slices.push({ top, height, dx: Math.round(shift * intensity * signedAt(opts.seed, idx, "sliceDx")) || 0 });
  }
  const sign = signedAt(opts.seed, age, "split") >= 0 ? 1 : -1;
  const split = sign * Math.round(Math.max(0, opts.splitPx ?? GLITCH_DEFAULTS.splitPx) * intensity) || 0;
  return { active: true, intensity, split, slices };
};


export const glitchHolePath = (slices: readonly GlitchSlice[], width: number, height: number): string =>
  `path(evenodd, "M0 0H${width}V${height}H0Z${slices.map((s) => `M0 ${s.top}H${width}V${s.top + s.height}H0Z`).join("")}")`;
