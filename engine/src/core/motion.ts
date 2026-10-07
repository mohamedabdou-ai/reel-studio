import { Easing, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
export const mix = (a: number, b: number, p: number): number => a + (b - a) * clamp01(p);



export const toFrame = (sec: number, fps: number): number => Math.round(sec * fps);


export const useClock = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, t: frame / fps };
};


export const useT = (): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};


export const inWindow = (frame: number, fromF: number, toF: number): boolean => frame >= fromF && frame < toF;
export const inWindowSec = (frame: number, fps: number, fromSec: number, toSec: number): boolean =>
  inWindow(frame, toFrame(fromSec, fps), toFrame(toSec, fps));






export const envF = (frame: number, fromF: number, toF: number, upF = 3, downF = 3): number =>
  Math.min(clamp01((frame - fromF + 1) / Math.max(1, upF)), clamp01((toF - frame) / Math.max(1, downF)));


export const envSec = (t: number, from: number, to: number, up = 0.16, down = 0.2): number =>
  Math.min(clamp01((t - from) / up), clamp01((to - t) / down));



export const EASE = {

  land: (p: number) => 1 - Math.pow(1 - clamp01(p), 3),

  landQuad: (p: number) => 1 - Math.pow(1 - clamp01(p), 2),

  out: (p: number) => Math.pow(clamp01(p), 2),

  inOut: (p: number) => {
    const q = clamp01(p);
    return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
  },

  bell: (p: number) => Math.sin(clamp01(p) * Math.PI),

  bloom: (p: number, k = 1.7) => Math.pow(1 - clamp01(p), k),

  step: (p: number, steps: number) => Math.floor(clamp01(p) * steps + 1e-4) / steps,

  drift: (t: number, periodSec: number, amp: number, phase = 0) => amp * Math.sin((2 * Math.PI * t) / periodSec + phase),

  breathe: (t: number, periodSec: number) => 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / periodSec),

  bezierMorph: Easing.bezier(0.65, 0, 0.35, 1),

  bezierCam: Easing.bezier(0.6, 0, 0.25, 1),




  expoOut: (p: number) => {
    const q = clamp01(p);
    return q >= 1 ? 1 : 1 - Math.pow(2, -10 * q);
  },



  backOut: (p: number, s = 1.70158) => {
    const q = clamp01(p);
    if (q <= 0) return 0;
    if (q >= 1) return 1;
    const r = q - 1;
    return 1 + r * r * ((s + 1) * r + s);
  },


  elasticOut: (p: number) => {
    const q = clamp01(p);
    if (q <= 0) return 0;
    if (q >= 1) return 1;
    return Math.pow(2, -10 * q) * Math.sin((q * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },


  expoLike: Easing.bezier(0.16, 1, 0.3, 1),
} as const;








export const anticipate = (p: number, k = 2): number => {
  const q = clamp01(p);
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  return q * q * ((k + 1) * q - k);
};




export const SPRING = {
  land: { damping: 16, mass: 0.7 },
  landA: { damping: 15, mass: 0.7 },
  soft: { damping: 18, mass: 0.7 },
  card: { damping: 17, mass: 0.7 },
  headline: { damping: 14, mass: 0.7 },
  node: { damping: 15, mass: 0.7 },
  snap: { damping: 12, mass: 0.7 },
  stamp: { damping: 11, mass: 0.7 },
  pop: { damping: 9, mass: 0.7 },
  tight: { damping: 20, mass: 0.7 },
} as const;
export type SpringPreset = keyof typeof SPRING;
export type SpringLike = SpringPreset | { damping: number; mass?: number; stiffness?: number };

const springConfig = (preset: SpringLike) => (typeof preset === "string" ? SPRING[preset] : { mass: 0.7, ...preset });





export const useEnter = (atSec: number, preset: SpringLike = "land", headStartSec = 0): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - toFrame(atSec, fps) + toFrame(headStartSec, fps),
    fps,
    config: springConfig(preset),
  });
};


export const useEnterF = (atFrame: number, preset: SpringLike = "land"): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - atFrame, fps, config: springConfig(preset) });
};


export const useRamp = (atSec: number, durFrames: number, ease: (p: number) => number = EASE.land): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return ease((frame - toFrame(atSec, fps)) / Math.max(1, durFrames));
};






export const useLifecycle = (atSec: number, untilSec: number, opts: { enterF?: number; exitF?: number } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterF = opts.enterF ?? 3;
  const exitF = opts.exitF ?? 8;
  const fromF = toFrame(atSec, fps);
  const toF = toFrame(untilSec, fps);
  const visible = inWindow(frame, fromF, toF);
  const enter = clamp01((frame - fromF + 1) / Math.max(1, enterF));
  const exit = clamp01((frame - (toF - exitF) + 1) / Math.max(1, exitF));
  return { frame, fps, fromF, toF, visible, enter, exit, opacity: visible ? Math.min(enter, 1 - exit * 0.999) : 0 };
};


export const stagger = (baseSec: number, i: number, stepFrames: number, fps: number): number =>
  (toFrame(baseSec, fps) + i * stepFrames) / fps;







export const snapKeys = <T,>(keys: [number, T][], fps: number): [number, T][] => {
  const byFrame = new Map<number, T>();
  for (const [t, v] of keys) byFrame.set(toFrame(t, fps), v);
  return [...byFrame.entries()].sort((a, b) => a[0] - b[0]).map(([f, v]) => [f / fps, v]);
};


export const stepKeys = <T,>(atSec: number, prev: T, next: T, fps: number): [number, T][] => {
  const f = toFrame(atSec, fps);
  return [
    [(f - 1) / fps, prev],
    [f / fps, next],
  ];
};




export const POP = {
  split: { kind: "sec", up: 0.09, down: 0.07 },
  deck: { kind: "sec", up: 0.16, down: 0.08 },
  calligraphic: { kind: "sec", up: 0.07, down: 0.06 },

  snapped: { kind: "frames", upF: 2, downF: 2 },

  snappedClause: { kind: "frames", upF: 5, downF: 3 },
} as const;
export type Pop = (typeof POP)[keyof typeof POP] | { kind: "sec"; up: number; down: number } | { kind: "frames"; upF: number; downF: number };






export const cueAtFrame = <T extends { from: number; to: number }>(list: readonly T[], frame: number, fps: number): T | null =>
  list.find((c) => inWindow(frame, toFrame(c.from, fps), toFrame(c.to, fps))) ?? null;


export const pillEnvelope = (frame: number, fps: number, fromSec: number, toSec: number, pop: Pop): number => {
  if (pop.kind === "sec") return envSec(frame / fps, fromSec, toSec, pop.up, pop.down);
  return envF(frame, toFrame(fromSec, fps), toFrame(toSec, fps), pop.upF, pop.downF);
};



const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};


export const mixHex = (a: string, b: string, p: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const q = clamp01(p);
  return `rgb(${Math.round(mix(r1, r2, q))}, ${Math.round(mix(g1, g2, q))}, ${Math.round(mix(b1, b2, q))})`;
};


export const px = (n: number): number => Math.round(n);
