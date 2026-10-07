import type { Cam } from "./plate";

export type Anchor = { x: number; y: number };

export type NormBox = { x: number; y: number; width: number; height: number };

export type PunchKey = { frame: number; scale: number; ax: number; ay: number };

export type ManifestCameraKey = { atFrame: number; scale: number; focusX: number; focusY: number };
export type PunchKind = "slow-push" | "snap-in" | "punch-step";

export const PUNCH_CAPS = { min: 1.03, max: 1.07, hard: 1.1 } as const;
export const PUNCH_KINDS: readonly PunchKind[] = ["slow-push", "snap-in", "punch-step"];

export const DEFAULT_ANCHOR: Anchor = { x: 0.5, y: 0.29 };

export const MANIFEST_FOCUS: Anchor = { x: 0.5, y: 0.4 };

type Common = { anchor?: Anchor; allowHard?: boolean };

const EPS = 1e-9;
const ceiling = (allowHard?: boolean): number => (allowHard ? PUNCH_CAPS.hard : PUNCH_CAPS.max);
const same = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

const wholeFrame = (name: string, f: number): void => {
  if (!Number.isInteger(f) || f < 0) throw new RangeError(`${name} must be a whole frame >= 0, got ${f}`);
};
const level = (name: string, s: number, allowHard?: boolean): void => {
  if (!Number.isFinite(s) || s < 1 || s > ceiling(allowHard) + EPS) {
    throw new RangeError(`${name} ${s} is outside [1, ${ceiling(allowHard)}]`);
  }
};
const punch = (name: string, s: number, allowHard?: boolean): void => {
  if (!Number.isFinite(s) || s < PUNCH_CAPS.min - EPS || s > ceiling(allowHard) + EPS) {
    throw new RangeError(`${name} ${s} is outside the punch range [${PUNCH_CAPS.min}, ${ceiling(allowHard)}]`);
  }
};
const anchorOf = (a: Anchor | undefined): Anchor => {
  const v = a ?? DEFAULT_ANCHOR;
  if (!(v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)) throw new RangeError(`anchor (${v.x}, ${v.y}) must lie inside 0..1`);
  return v;
};
const key = (frame: number, scale: number, a: Anchor): PunchKey => ({ frame, scale, ax: a.x, ay: a.y });


export const capScale = (scale: number, allowHard = false): number => {
  if (!Number.isFinite(scale) || scale <= 1) return 1;
  return Math.min(ceiling(allowHard), Math.max(PUNCH_CAPS.min, scale));
};


export const slowPush = (o: Common & { fromFrame: number; toFrame: number; from?: number; to: number }): PunchKey[] => {
  const a = anchorOf(o.anchor);
  const from = o.from ?? 1;
  wholeFrame("fromFrame", o.fromFrame);
  wholeFrame("toFrame", o.toFrame);
  if (o.toFrame <= o.fromFrame) throw new RangeError(`slowPush needs toFrame > fromFrame (${o.fromFrame} -> ${o.toFrame})`);
  level("from", from, o.allowHard);
  level("to", o.to, o.allowHard);
  return [key(o.fromFrame, from, a), key(o.toFrame, o.to, a)];
};


export const snapIn = (o: Common & { atFrame: number; scale: number; from?: number; rampFrames?: number }): PunchKey[] => {
  const a = anchorOf(o.anchor);
  const from = o.from ?? 1;
  const ramp = o.rampFrames ?? 4;
  wholeFrame("atFrame", o.atFrame);
  if (!Number.isInteger(ramp) || ramp < 2) throw new RangeError(`snapIn rampFrames must be a whole number >= 2, got ${ramp} (use punchStep for a cut)`);
  if (o.atFrame - ramp < 0) throw new RangeError(`snapIn needs ${ramp} frames before atFrame ${o.atFrame}`);
  level("from", from, o.allowHard);
  punch("scale", o.scale, o.allowHard);
  if (o.scale <= from) throw new RangeError(`snapIn must land larger than it starts (${from} -> ${o.scale})`);
  return [key(o.atFrame - ramp, from, a), key(o.atFrame, o.scale, a)];
};


export const punchStep = (o: Common & { atFrame: number; scale: number; from?: number }): PunchKey[] => {
  const a = anchorOf(o.anchor);
  const from = o.from ?? 1;
  wholeFrame("atFrame", o.atFrame);
  if (o.atFrame < 1) throw new RangeError("punchStep needs one frame before atFrame");
  level("from", from, o.allowHard);
  punch("scale", o.scale, o.allowHard);
  if (o.scale <= from) throw new RangeError(`punchStep must land larger than it starts (${from} -> ${o.scale})`);
  return [key(o.atFrame - 1, from, a), key(o.atFrame, o.scale, a)];
};


export const snapBack = (o: Common & { atFrame: number; from: number; to?: number; rampFrames?: number }): PunchKey[] => {
  const a = anchorOf(o.anchor);
  const to = o.to ?? 1;
  const ramp = o.rampFrames ?? 1;
  wholeFrame("atFrame", o.atFrame);
  if (!Number.isInteger(ramp) || ramp < 1) throw new RangeError(`snapBack rampFrames must be a whole number >= 1, got ${ramp}`);
  if (o.atFrame - ramp < 0) throw new RangeError(`snapBack needs ${ramp} frame(s) before atFrame ${o.atFrame}`);
  level("from", o.from, o.allowHard);
  level("to", to, o.allowHard);
  if (to >= o.from) throw new RangeError(`snapBack must land smaller than it starts (${o.from} -> ${to})`);
  return [key(o.atFrame - ramp, o.from, a), key(o.atFrame, to, a)];
};







export const composeTrack = (parts: PunchKey[][]): PunchKey[] => {
  const out: PunchKey[] = [];
  parts.forEach((part, index) => {
    const prev = out[out.length - 1];
    const first = part[0];
    if (prev && first) {
      if (first.frame < prev.frame) throw new RangeError(`part ${index} starts at frame ${first.frame}, before the track's last key at ${prev.frame}`);
      if (!same(first.scale, prev.scale)) throw new RangeError(`part ${index} starts at scale ${first.scale} but the track holds scale ${prev.scale}`);
      if ((!same(first.ax, prev.ax) || !same(first.ay, prev.ay)) && !same(prev.scale, 1)) {
        throw new RangeError(`part ${index} moves the anchor while punched in at scale ${prev.scale}`);
      }
    }
    for (const k of part) {
      const last = out[out.length - 1];
      if (last && k.frame < last.frame) throw new RangeError(`part ${index} key at frame ${k.frame} is before ${last.frame}`);
      if (last && k.frame === last.frame) out[out.length - 1] = k;
      else out.push(k);
    }
  });
  return out;
};






export const emphasisPunch = (o: {
  kind: PunchKind;
  atFrame: number;
  scale: number;
  holdFrames: number;
  anchor?: Anchor;
  pushFrames?: number;
  releaseFrames?: number;
  allowHard?: boolean;
}): PunchKey[] => {
  if (!PUNCH_KINDS.includes(o.kind)) throw new RangeError(`unknown punch kind ${String(o.kind)}`);
  punch("scale", o.scale, o.allowHard);
  const release = o.releaseFrames ?? 1;
  if (!Number.isInteger(o.holdFrames) || o.holdFrames <= release) {
    throw new RangeError(`holdFrames must be a whole number > releaseFrames (${release}), got ${o.holdFrames}`);
  }
  const common = { anchor: o.anchor, allowHard: o.allowHard };
  const push = o.pushFrames ?? 30;
  const into =
    o.kind === "slow-push"
      ? slowPush({ ...common, fromFrame: o.atFrame - push, toFrame: o.atFrame, to: o.scale })
      : o.kind === "snap-in"
        ? snapIn({ ...common, atFrame: o.atFrame, scale: o.scale })
        : punchStep({ ...common, atFrame: o.atFrame, scale: o.scale });
  return composeTrack([into, snapBack({ ...common, atFrame: o.atFrame + o.holdFrames, from: o.scale, rampFrames: release })]);
};


export const toCamKeys = (keys: PunchKey[], fps: number): [number, Cam][] => {
  if (!(fps > 0)) throw new RangeError(`fps must be > 0, got ${fps}`);
  if (!keys.length) return [[0, { scale: 1 }]];
  keys.forEach((k, i) => {
    if (i > 0 && k.frame <= keys[i - 1].frame) throw new RangeError(`camera keys must be strictly increasing (frame ${k.frame} after ${keys[i - 1].frame})`);
  });
  return keys.map((k): [number, Cam] => [k.frame / fps, { scale: k.scale, ax: k.ax, ay: k.ay }]);
};


export const toManifestKeys = (keys: PunchKey[], focus: Anchor = MANIFEST_FOCUS): ManifestCameraKey[] => {
  const f = anchorOf(focus);
  return keys.map((k) => ({ atFrame: k.frame, scale: k.scale, focusX: f.x, focusY: f.y }));
};

const checkBox = (b: NormBox): void => {
  const ok =
    [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
    b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0 &&
    b.x + b.width <= 1 + EPS && b.y + b.height <= 1 + EPS;
  if (!ok) throw new RangeError(`box ${JSON.stringify(b)} must be a positive rectangle inside 0..1`);
};


export const boxAfterPunch = (box: NormBox, anchor: Anchor, scale: number): NormBox => ({
  x: anchor.x + scale * (box.x - anchor.x),
  y: anchor.y + scale * (box.y - anchor.y),
  width: box.width * scale,
  height: box.height * scale,
});







export const anchorForBox = (box: NormBox, scale: number): Anchor | null => {
  checkBox(box);
  if (!Number.isFinite(scale) || scale < 1) throw new RangeError(`scale must be >= 1, got ${scale}`);
  const axis = (u0: number, size: number): number | null => {
    const centre = u0 + size / 2;
    if (scale * size > 1 + EPS) return null;
    if (scale - 1 < EPS) return centre;
    const lo = Math.max(0, (scale * (u0 + size) - 1) / (scale - 1));
    const hi = Math.min(1, (scale * u0) / (scale - 1));
    return Math.min(hi, Math.max(lo, centre));
  };
  const x = axis(box.x, box.width);
  const y = axis(box.y, box.height);
  return x === null || y === null ? null : { x, y };
};
