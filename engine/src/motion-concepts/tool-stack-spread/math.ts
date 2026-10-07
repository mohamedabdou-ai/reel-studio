import { EASE, clamp01, mix } from "../../core/motion.ts";
import { SURFACE_INSET, SURFACE_REACH, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, pulse, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



type ReadKey = "read0" | "read1" | "read2" | "read3" | "read4";
type OnceKey = "out2" | "out1" | ReadKey | "hold";
type LoopKey = OnceKey | "back2" | "back1";





const ONCE: BeatSpec<OnceKey> = {
  out2: [0.12, 0.26],
  out1: [0.13, 0.27],
  read0: [0.33, 0.42],
  read1: [0.37, 0.46],
  read2: [0.41, 0.5],
  read3: [0.45, 0.54],
  read4: [0.49, 0.58],
  hold: [0.62, 1],
};



const LOOP: BeatSpec<LoopKey> = {
  out2: [0.08, 0.22],
  out1: [0.09, 0.23],
  read0: [0.28, 0.36],
  read1: [0.315, 0.395],
  read2: [0.35, 0.43],
  read3: [0.385, 0.465],
  read4: [0.42, 0.5],
  hold: [0.53, 0.77],
  back2: [0.77, 0.9],
  back1: [0.78, 0.91],
};

const ORDER: readonly OnceKey[] = ["out2", "out1", "read0", "read1", "read2", "read3", "read4"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { back1?: Beat; back2?: Beat };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;






export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop") {
    if (!beats.back2 || !beats.back1) issues.push("loop mode needs back2 and back1");
    else if (beats.back2.from !== beats.hold.to) issues.push("back2 must start where the hold ends");
    else if (beats.back1.to > duration) issues.push("back1 ends after the scene");
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;



export const TOOL_COUNT = 5;

export const FRONT = 2;

export const BACK_TENSION = 1.4;

export const spreadEase = (p: number): number => EASE.backOut(p, BACK_TENSION);




export const SPREAD_PEAK = spreadEase(1 - (2 * BACK_TENSION) / (3 * (BACK_TENSION + 1)));





export const PAINT_ORDER: readonly number[] = Array.from({ length: TOOL_COUNT }, (_, i) => i).sort(
  (a, b) => Math.abs(b - FRONT) - Math.abs(a - FRONT),
);






const GAP = 22;

const PEEK_RATIO = 0.12;

const SCALE_STEP = 0.045;

const CHIP_RATIO = 0.58;
const PAD_RATIO = 0.19;
const TEXT_GAP = 24;


const clean = (n: number): number => (n === 0 ? 0 : n);



export type Layout = {

  width: number;
  height: number;
  gap: number;

  pitch: number;

  peek: number;

  slots: Rect[];

  pileDy: number[];

  pileScale: number[];

  overshootPx: number;

  chip: Rect;
  name: Rect;
  fn: Rect;
};


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean }): Layout => {
  const left = box.left + SURFACE_INSET;
  const width = box.width - 2 * SURFACE_INSET;

  const top = box.top + SURFACE_REACH;
  const bottom = mainBottom(box) - SURFACE_REACH;


  let slack = 0;
  let height = 0;
  let pitch = 0;
  let peek = 0;
  for (let k = 0; k < 16; k++) {
    height = Math.floor((bottom - top - 2 * slack - GAP * (TOOL_COUNT - 1)) / TOOL_COUNT);
    pitch = height + GAP;
    peek = Math.round(height * PEEK_RATIO);
    const need = Math.ceil(FRONT * (pitch - peek) * (SPREAD_PEAK - 1)) + 1;
    if (need <= slack) break;
    slack = need;
  }
  const total = TOOL_COUNT * height + GAP * (TOOL_COUNT - 1);
  const colTop = top + slack + Math.floor((bottom - top - 2 * slack - total) / 2);

  const slots: Rect[] = Array.from({ length: TOOL_COUNT }, (_, i) => ({ x: left, y: colTop + i * pitch, width, height }));
  const pileDy = Array.from({ length: TOOL_COUNT }, (_, i) => clean((i - FRONT) * (peek - pitch)));
  const pileScale = Array.from({ length: TOOL_COUNT }, (_, i) => 1 - SCALE_STEP * Math.abs(i - FRONT));

  const at = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, width) : r);
  const pad = Math.round(height * PAD_RATIO);
  const chipS = Math.round(height * CHIP_RATIO);
  const textX = pad + chipS + TEXT_GAP;
  const textW = width - textX - pad;




  const nameH = Math.round(height * 0.4);
  const fnH = Math.round(height * 0.36);
  const textTop = (height - nameH - fnH) / 2;

  return {
    width,
    height,
    gap: GAP,
    pitch,
    peek,
    slots,
    pileDy,
    pileScale,
    overshootPx: slack,
    chip: at({ x: pad, y: (height - chipS) / 2, width: chipS, height: chipS }),
    name: at({ x: textX, y: textTop, width: textW, height: nameH }),
    fn: at({ x: textX, y: textTop + nameH, width: textW, height: fnH }),
  };
};



export type ToolCardState = {

  e: number;

  dy: number;

  scale: number;

  rect: Rect;

  glance: number;
};

export type ToolStackState = {

  spread: number;

  cards: ToolCardState[];
};

export type ToolStackParams = { mode: ConceptMode; box: ConceptBox; rtl: boolean };

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`tool-stack-spread stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

export const stateAt = (frame: number, duration: number, params: ToolStackParams): ToolStackState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const cards: ToolCardState[] = Array.from({ length: TOOL_COUNT }, (_, i) => {
    const ring = Math.abs(i - FRONT);
    const out = ring === 2 ? B.out2 : B.out1;
    const back = ring === 2 ? B.back2 : B.back1;
    const spread = segBeat(frame, out, spreadEase);
    const fold = back ? segBeat(frame, back, EASE.bezierMorph) : 0;
    const e = spread * (1 - fold);



    const dy = clean(Math.round((1 - e) * L.pileDy[i]));
    const scale = e >= 1 ? 1 : mix(L.pileScale[i], 1, e);
    const slot = L.slots[i];
    const w = L.width * scale;
    const h = L.height * scale;
    const cx = slot.x + L.width / 2;
    const cy = slot.y + L.height / 2 + dy;
    const glance = pulse(frame, B[`read${i}` as ReadKey]);
    return { e, dy, scale, rect: { x: cx - w / 2, y: cy - h / 2, width: w, height: h }, glance };
  });

  return { spread: clamp01(cards[1].e), cards };
};
