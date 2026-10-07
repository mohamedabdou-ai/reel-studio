import { EASE, clamp01, px } from "./motion.ts";
import type { WindowGeo } from "./plate";

export type Ease = (p: number) => number;

export type GeoKey = readonly [frame: number, geo: WindowGeo];

const FIELDS = ["windowTop", "windowHeight", "videoWidth", "videoLeft", "videoTop"] as const;

const roundGeo = (g: WindowGeo): WindowGeo => ({
  windowTop: px(g.windowTop),
  windowHeight: px(g.windowHeight),
  videoWidth: px(g.videoWidth),
  videoLeft: px(g.videoLeft),
  videoTop: px(g.videoTop),
});

const wholeFrame = (label: string, n: number): void => {
  if (!Number.isInteger(n)) throw new RangeError(`${label} must be a whole frame, got ${n}`);
};






export const windowGeoAtFrame = (frame: number, keys: readonly GeoKey[], ease: Ease | "snap" = EASE.bezierMorph): WindowGeo => {
  if (keys.length === 0) throw new RangeError("windowGeoAtFrame: at least one key is required");
  keys.forEach(([at], i) => {
    wholeFrame(`windowGeoAtFrame key ${i}`, at);
    if (i > 0 && at <= keys[i - 1][0]) throw new RangeError(`windowGeoAtFrame: key frames must strictly increase (key ${i} at ${at})`);
  });
  if (keys.length === 1 || frame <= keys[0][0]) return roundGeo(keys[0][1]);
  const last = keys[keys.length - 1];
  if (frame >= last[0]) return roundGeo(last[1]);
  if (ease === "snap") {
    let geo = keys[0][1];
    for (const [at, g] of keys) if (frame >= at) geo = g;
    return roundGeo(geo);
  }
  let i = 1;
  while (frame > keys[i][0]) i++;
  const [a, ga] = keys[i - 1];
  const [b, gb] = keys[i];
  const p = ease((frame - a) / (b - a));
  const pick = (k: keyof WindowGeo) => px(ga[k] + (gb[k] - ga[k]) * p);
  return { windowTop: pick("windowTop"), windowHeight: pick("windowHeight"), videoWidth: pick("videoWidth"), videoLeft: pick("videoLeft"), videoTop: pick("videoTop") };
};

export type CurtainOptions = {

  fromF: number;

  durF: number;

  full: WindowGeo;

  split: WindowGeo;

  panelHeight?: number;

  canvasHeight?: number;

  ease?: Ease;

  lowerFadeF?: number;

  upperFrom?: number;

  returnF?: number;

  returnDurF?: number;
};

export type CurtainPhase = "full" | "descending" | "split" | "lifting";

export type CurtainState = {

  geo: WindowGeo;

  seamY: number;

  panelY: number;

  progress: number;

  lowerCaptionOpacity: number;

  upperOpacity: number;
  phase: CurtainPhase;

  moving: boolean;
};

type Resolved = { canvasHeight: number; panelHeight: number; ease: Ease; lowerFadeF: number; upperFrom: number; returnDurF: number };

const resolveCurtain = (opts: CurtainOptions): Resolved => {
  const r: Resolved = {
    canvasHeight: opts.canvasHeight ?? 1920,
    panelHeight: opts.panelHeight ?? opts.split.windowTop,
    ease: opts.ease ?? EASE.bezierMorph,
    lowerFadeF: opts.lowerFadeF ?? 8,
    upperFrom: opts.upperFrom ?? 0.88,
    returnDurF: opts.returnDurF ?? opts.durF,
  };
  wholeFrame("curtain fromF", opts.fromF);
  wholeFrame("curtain durF", opts.durF);
  if (opts.durF < 1) throw new RangeError(`curtain durF must be at least 1 frame, got ${opts.durF}`);
  wholeFrame("curtain lowerFadeF", r.lowerFadeF);
  if (r.lowerFadeF < 1) throw new RangeError(`curtain lowerFadeF must be at least 1 frame, got ${r.lowerFadeF}`);
  if (!(r.upperFrom >= 0 && r.upperFrom < 1)) throw new RangeError(`curtain upperFrom must be in [0, 1), got ${r.upperFrom}`);
  if (!(r.canvasHeight > 0)) throw new RangeError(`curtain canvasHeight must be positive, got ${r.canvasHeight}`);
  if (!(r.panelHeight > 0)) throw new RangeError(`curtain panelHeight must be positive, got ${r.panelHeight}`);
  for (const [name, g] of [["full", opts.full], ["split", opts.split]] as const) {
    for (const k of FIELDS) if (!Number.isFinite(g[k])) throw new RangeError(`curtain ${name}.${k} must be finite, got ${g[k]}`);
    if (g.windowTop + g.windowHeight !== r.canvasHeight)
      throw new RangeError(`curtain ${name} window must reach the canvas bottom: ${g.windowTop} + ${g.windowHeight} != ${r.canvasHeight}`);
  }
  if (opts.split.windowTop <= opts.full.windowTop)
    throw new RangeError(`curtain split.windowTop (${opts.split.windowTop}) must sit below full.windowTop (${opts.full.windowTop}); the panel descends`);
  if (opts.returnF !== undefined) {
    wholeFrame("curtain returnF", opts.returnF);
    wholeFrame("curtain returnDurF", r.returnDurF);
    if (r.returnDurF < 1) throw new RangeError(`curtain returnDurF must be at least 1 frame, got ${r.returnDurF}`);
    if (opts.returnF < opts.fromF + opts.durF)
      throw new RangeError(`curtain returnF ${opts.returnF} starts before the descent settles at ${opts.fromF + opts.durF}`);
  }
  return r;
};





export const curtainAt = (frame: number, opts: CurtainOptions): CurtainState => {
  const r = resolveCurtain(opts);
  const { fromF, durF, full, split, returnF } = opts;
  const down = r.ease(clamp01((frame - fromF) / durF));
  const up = returnF === undefined ? 0 : r.ease(clamp01((frame - returnF) / r.returnDurF));
  const progress = down * (1 - up);
  const lerp = (k: keyof WindowGeo) => px(full[k] + (split[k] - full[k]) * progress);
  const seamY = lerp("windowTop");
  const geo: WindowGeo = { windowTop: seamY, windowHeight: r.canvasHeight - seamY, videoWidth: lerp("videoWidth"), videoLeft: lerp("videoLeft"), videoTop: lerp("videoTop") };
  const returnEndF = returnF === undefined ? Infinity : returnF + r.returnDurF;
  const phase: CurtainPhase =
    frame < fromF ? "full"
    : frame < fromF + durF ? "descending"
    : returnF === undefined || frame < returnF ? "split"
    : frame < returnEndF ? "lifting"
    : "full";
  const lowerOut = 1 - clamp01((frame - fromF) / r.lowerFadeF);
  const lowerBack = returnF === undefined ? 0 : clamp01((frame - returnEndF) / r.lowerFadeF);
  return {
    geo,
    seamY,
    panelY: seamY - r.panelHeight,
    progress,
    lowerCaptionOpacity: Math.max(lowerOut, lowerBack),
    upperOpacity: clamp01((progress - r.upperFrom) / (1 - r.upperFrom)),
    phase,
    moving: phase === "descending" || phase === "lifting",
  };
};






export const settleCurtainForProbe = (state: CurtainState, opts: CurtainOptions): CurtainState => {
  const panelHeight = opts.panelHeight ?? opts.split.windowTop;
  const entered = state.upperOpacity > 0;
  return {
    ...state,
    lowerCaptionOpacity: state.lowerCaptionOpacity > 0 ? 1 : 0,
    upperOpacity: entered ? 1 : 0,
    panelY: entered ? opts.split.windowTop - panelHeight : state.panelY,
  };
};


export type NormBox = { x: number; y: number; width: number; height: number };
export type CanvasRect = { x: number; y: number; width: number; height: number };


export const sourceBoxToCanvas = (geo: WindowGeo, sourceAspect: number, box: NormBox): CanvasRect => {
  const plateHeight = px(geo.videoWidth * sourceAspect);
  return {
    x: geo.videoLeft + box.x * geo.videoWidth,
    y: geo.windowTop + geo.videoTop + box.y * plateHeight,
    width: box.width * geo.videoWidth,
    height: box.height * plateHeight,
  };
};






export const curtainHeadConflicts = (opts: CurtainOptions, sourceAspect: number, head: NormBox, marginPx = 0): number[] => {
  const ranges: [number, number][] = [[opts.fromF, opts.fromF + opts.durF]];
  if (opts.returnF !== undefined) ranges.push([opts.returnF, opts.returnF + (opts.returnDurF ?? opts.durF)]);
  const out: number[] = [];
  for (const [a, b] of ranges)
    for (let f = a; f <= b; f++) {
      const s = curtainAt(f, opts);
      if (sourceBoxToCanvas(s.geo, sourceAspect, head).y < s.seamY + marginPx) out.push(f);
    }
  return out;
};
