import { EASE, clamp01, mix } from "../core/motion.ts";
import { seededSigned } from "../core/accents-math.ts";
import { CONCEPT_FPS, HOLD_MIN_FRACTION } from "./types.ts";

export { EASE, clamp01, mix, seededSigned };

export type Ease = (p: number) => number;

export type Beat = { readonly from: number; readonly to: number };

export type BeatSpec<K extends string> = Readonly<Record<K, readonly [from: number, to: number]>>;
export type Beats<K extends string> = Readonly<Record<K, Beat>>;


export const MIN_MOTION_FRAMES = 4;










export const minFramesAtFps = (minFrames: number, fps: number): number => {
  if (!Number.isFinite(minFrames) || minFrames < 1) throw new RangeError(`motion-concepts minFramesAtFps: minFrames must be a number >= 1, got ${String(minFrames)}`);
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError(`motion-concepts minFramesAtFps: fps must be a positive number, got ${String(fps)}`);

  return Math.ceil((minFrames * fps) / CONCEPT_FPS - 1e-9);
};

const assertFrame = (what: string, frame: number): void => {
  if (typeof frame !== "number" || !Number.isFinite(frame)) throw new RangeError(`motion-concepts ${what}: frame must be a finite number, got ${String(frame)}`);
};




export const frameAt = (fraction: number, duration: number): number => Math.round(fraction * duration);


export const beatFrames = <K extends string>(spec: BeatSpec<K>, duration: number): Beats<K> => {
  if (!Number.isInteger(duration) || duration < 1) throw new RangeError(`motion-concepts beatFrames: duration must be a whole number >= 1, got ${String(duration)}`);
  const out = {} as Record<K, Beat>;
  for (const key of Object.keys(spec) as K[]) {
    const [a, b] = spec[key];
    if (!(a >= 0 && b <= 1 && a <= b)) throw new RangeError(`motion-concepts beat "${key}": fractions must satisfy 0 <= from <= to <= 1, got [${a}, ${b}]`);
    out[key] = { from: frameAt(a, duration), to: frameAt(b, duration) };
  }
  return out;
};

export type BeatRules<K extends string> = {

  hold?: K;

  holdAtEnd?: boolean;

  minHoldFraction?: number;

  minLen?: number;

  short?: readonly K[];

  order?: readonly K[];
};


export const beatIssues = <K extends string>(beats: Beats<K>, duration: number, rules: BeatRules<K> = {}): string[] => {
  const issues: string[] = [];
  const minLen = rules.minLen ?? MIN_MOTION_FRAMES;
  const names = Object.keys(beats) as K[];
  for (const k of names) {
    const { from, to } = beats[k];
    if (!Number.isInteger(from) || !Number.isInteger(to)) issues.push(`${k}: not whole frames [${from}, ${to}]`);
    else if (from < 0 || to > duration || from > to) issues.push(`${k}: [${from}, ${to}] is outside 0..${duration}`);
    else if (k !== rules.hold && !(rules.short ?? []).includes(k) && to - from < minLen) issues.push(`${k}: ${to - from} frames < ${minLen}`);
  }
  if (rules.hold !== undefined) {
    const h = beats[rules.hold];
    if (!h) issues.push(`hold beat "${rules.hold}" is missing`);
    else {
      const need = rules.minHoldFraction ?? HOLD_MIN_FRACTION;
      if ((h.to - h.from) / duration < need - 1e-9) issues.push(`hold ${h.to - h.from} of ${duration} frames < ${Math.round(need * 100)}%`);
      if ((rules.holdAtEnd ?? true) && h.to !== duration) issues.push(`hold ends at ${h.to}, not the last frame ${duration}`);
    }
  }
  const order = rules.order ?? [];
  for (let i = 1; i < order.length; i++) {
    const a = beats[order[i - 1]];
    const b = beats[order[i]];
    if (a && b && b.from < a.from) issues.push(`${order[i]} starts (${b.from}) before ${order[i - 1]} (${a.from})`);
  }
  return issues;
};


export const assertBeats = <K extends string>(beats: Beats<K>, duration: number, rules: BeatRules<K> = {}): Beats<K> => {
  const issues = beatIssues(beats, duration, rules);
  if (issues.length > 0) throw new RangeError(`motion-concepts assertBeats(${duration} frames): ${issues.join("; ")}`);
  return beats;
};


export const minDuration = <K extends string>(spec: BeatSpec<K>, rules: BeatRules<K> = {}, max = 3000): number => {
  for (let d = 30; d <= max; d++) if (beatIssues(beatFrames(spec, d), d, rules).length === 0) return d;
  throw new RangeError("motion-concepts minDuration: no duration up to " + max + " frames satisfies the spec");
};

export const holdFraction = (hold: Beat, duration: number): number => (hold.to - hold.from) / duration;

export const beatFramesOf = (beat: Beat): number[] => Array.from({ length: Math.max(0, beat.to - beat.from) }, (_, i) => beat.from + i);




export const seg = (frame: number, from: number, to: number, ease: Ease = EASE.inOut): number => {
  assertFrame("seg", frame);
  if (to <= from) return frame >= to ? 1 : 0;
  return ease(clamp01((frame - from) / (to - from)));
};
export const segBeat = (frame: number, beat: Beat, ease: Ease = EASE.inOut): number => seg(frame, beat.from, beat.to, ease);


export const pulse = (frame: number, beat: Beat): number => {
  assertFrame("pulse", frame);
  return frame <= beat.from || frame >= beat.to ? 0 : EASE.bell((frame - beat.from) / (beat.to - beat.from));
};


export const envelope = (frame: number, up: Beat, down: Beat, ease: Ease = EASE.inOut): number =>
  segBeat(frame, up, ease) * (1 - segBeat(frame, down, ease));


export const loopAngle = (frame: number, duration: number, cycles = 1): number => {
  assertFrame("loopAngle", frame);
  return (2 * Math.PI * Math.round(cycles) * frame) / duration;
};




export const hashSeed = (seed: string | number): number => {
  let h = 0x811c9dc5;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};








export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};


export const seededList = (seed: string | number, n: number): number[] => {
  const rnd = mulberry32(hashSeed(seed));
  return Array.from({ length: n }, () => rnd());
};



type Leaf = number | string | boolean | null;


export const flattenState = (value: unknown, path = "state"): [string, Leaf][] => {
  if (value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => flattenState(v, `${path}[${i}]`));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flattenState(v, `${path}.${k}`));
  }
  throw new TypeError(`motion-concepts flattenState: ${path} is ${typeof value}; state must be plain numbers, strings, booleans, arrays and objects`);
};


export const assertFiniteState = (state: unknown, label = "state"): void => {
  for (const [path, v] of flattenState(state, label)) {
    if (typeof v === "number" && !Number.isFinite(v)) throw new RangeError(`motion-concepts: ${path} is ${v}`);
  }
};


export const stateDistance = (a: unknown, b: unknown): number => {
  const fa = flattenState(a);
  const fb = flattenState(b);
  if (fa.length !== fb.length) throw new Error(`motion-concepts stateDistance: shapes differ (${fa.length} vs ${fb.length} leaves)`);
  let max = 0;
  for (let i = 0; i < fa.length; i++) {
    if (fa[i][0] !== fb[i][0]) throw new Error(`motion-concepts stateDistance: shapes differ at ${fa[i][0]} vs ${fb[i][0]}`);
    const [x, y] = [fa[i][1], fb[i][1]];
    if (typeof x === "number" && typeof y === "number") max = Math.max(max, Math.abs(x - y));
    else if (x !== y) return Infinity;
  }
  return max;
};


export const assertLoopClosed = <S>(stateAt: (frame: number) => S, duration: number, eps = 1e-9): void => {
  const d = stateDistance(stateAt(duration), stateAt(0));
  if (!(d <= eps)) throw new Error(`motion-concepts: loop does not close, frame(${duration}) differs from frame(0) by ${d}`);
};


export const assertHoldFrozen = <S>(stateAt: (frame: number) => S, hold: Beat, eps = 1e-9): void => {
  const first = stateAt(hold.from);
  for (const f of beatFramesOf(hold)) {
    const d = stateDistance(stateAt(f), first);
    if (!(d <= eps)) throw new Error(`motion-concepts: hold is not frozen, frame ${f} differs from frame ${hold.from} by ${d}`);
  }
};
