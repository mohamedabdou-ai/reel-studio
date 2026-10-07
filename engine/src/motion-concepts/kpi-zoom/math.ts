import { EASE, mix } from "../../core/motion.ts";
import { rectMorph } from "../../core/mask-geo.ts";
import { ARABIC_PERCENT, deltaDirection, formatNumber, type DeltaDirection, type DigitSet, type NumberFormat } from "../../core/numbers.ts";
import { parseColor } from "../color.ts";
import { SURFACE_INSET, centerRect, mainBottom, mirrorX, rectBottom, rectRight, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, segBeat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



export const TILE_COUNT = 5;

type Slot = 0 | 1 | 2 | 3 | 4;
type FanKey<P extends string> = `${P}${Slot}`;
type OnceKey = FanKey<"enter"> | FanKey<"roll"> | "focusRoll" | "dim" | "zoom" | "hold";
type LoopKey = OnceKey | "back" | FanKey<"exit">;
type Window = readonly [number, number];

const r3 = (x: number): number => Math.round(x * 1000) / 1000;


const fan = <P extends string>(prefix: P, at: (i: number) => Window): Record<FanKey<P>, Window> => {
  const out: Record<string, Window> = {};
  for (let i = 0; i < TILE_COUNT; i++) out[`${prefix}${i}`] = at(i);
  return out as Record<FanKey<P>, Window>;
};

const ONCE: BeatSpec<OnceKey> = {

  ...fan("enter", (i) => [r3(0.02 + 0.02 * i), r3(0.1 + 0.02 * i)]),
  ...fan("roll", (i) => [r3(0.03 + 0.02 * i), r3(0.17 + 0.02 * i)]),


  focusRoll: [0.05, 0.6],

  dim: [0.3, 0.62],
  zoom: [0.34, 0.58],
  hold: [0.64, 1],
};

const LOOP: BeatSpec<LoopKey> = {
  ...fan("enter", (i) => [r3(0.02 + 0.02 * i), r3(0.09 + 0.02 * i)]),
  ...fan("roll", (i) => [r3(0.03 + 0.02 * i), r3(0.15 + 0.02 * i)]),
  focusRoll: [0.04, 0.48],
  dim: [0.26, 0.5],
  zoom: [0.29, 0.47],
  hold: [0.52, 0.74],
  back: [0.74, 0.85],

  ...fan("exit", (i) => [r3(0.86 + 0.012 * (TILE_COUNT - 1 - i)), r3(0.93 + 0.012 * (TILE_COUNT - 1 - i))]),
};

const ORDER: readonly OnceKey[] = ["enter0", "enter1", "enter2", "enter3", "enter4"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & Partial<Beats<"back" | FanKey<"exit">>>;


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;





export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop" && beats.back && beats.back.from !== beats.hold.to) issues.push("back must start where the hold ends");
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;




export const decimalsOf = (value: number): number => {
  const s = Math.round(Math.abs(value) * 100) / 100;
  if (s === Math.round(s)) return 0;
  return s === Math.round(s * 10) / 10 ? 1 : 2;
};


export const unitSuffix = (unit: string | undefined, digits: DigitSet): string => {
  const u = unit?.trim() ?? "";
  if (u === "") return "";
  if (u === "%" || u === ARABIC_PERCENT) return digits === "arabic-indic" ? ARABIC_PERCENT : "%";
  return ` ${u}`;
};


export const valueFormat = (value: number, unit: string | undefined, digits: DigitSet): NumberFormat => ({
  digits,
  decimals: decimalsOf(value),
  suffix: unitSuffix(unit, digits),
});


export const changeDirection = (change: number): DeltaDirection => deltaDirection(change, 1);


export const changeText = (finalChange: number, shownChange: number, digits: DigitSet): string => {
  const dir = changeDirection(finalChange);
  return formatNumber(Math.abs(shownChange), {
    digits,
    decimals: 1,
    prefix: dir === "up" ? "+" : dir === "down" ? "-" : "",
    suffix: digits === "arabic-indic" ? ARABIC_PERCENT : "%",
  });
};



const linear = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (c: readonly number[]): number => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
const flatten = (color: string, ground: readonly number[]): [number, number, number] => {
  const [r, g, b, a] = parseColor(color);
  return [r * a + ground[0] * (1 - a), g * a + ground[1] * (1 - a), b * a + ground[2] * (1 - a)];
};


export const contrastRatio = (fg: string, bg: string, ground: string): number => {
  const g = parseColor(ground);
  const back = flatten(bg, [g[0], g[1], g[2]]);
  const front = flatten(fg, back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};






export const pickInk = (candidates: readonly string[], fill: string, ground: string, min = 4.5): string =>
  candidates.find((c) => contrastRatio(c, fill, ground) >= min) ?? candidates[candidates.length - 1];




export const GAP = 24;

export const TILE_SIDE = 28;
export const TILE_PAD_V = 22;

export const HERO_SIDE = 48;
export const HERO_PAD_V = 48;

export const HERO_HEIGHT_SHARE = 0.72;


export const NAME_SIZE = 58;
export const NAME_MIN = 40;
export const VALUE_SIZE = 180;
export const VALUE_MIN = 64;
export const CHIP_SIZE = 44;
export const CHIP_ARROW = 30;

export type Part = "name" | "number" | "chip";
export const PARTS: readonly Part[] = ["name", "number", "chip"];
export type Size = { w: number; h: number };

export type PartPose = { x: number; y: number; scale: number };
export type PartPoses = Record<Part, PartPose>;


const SLOT_H: Record<Part, number> = { name: 96, number: 236, chip: 68 };

const K_NOMINAL = { name: 0.55, chip: 0.65 } as const;

export type Layout = {

  region: Rect;
  center: { x: number; y: number };

  cells: Rect[];
  colWidth: number;

  hero: Rect;

  slots: Record<Part, Size>;

  k: Record<Part, number>;

  tilePose: PartPoses[];
  heroPose: PartPoses;
};


const stack = (total: number, n: number, gap: number): { y: number; h: number }[] => {
  const free = total - (n - 1) * gap;
  const base = Math.floor(free / n);
  const extra = free - base * n;
  let y = 0;
  return Array.from({ length: n }, (_, i) => {
    const h = base + (i < extra ? 1 : 0);
    const cell = { y, h };
    y += h + gap;
    return cell;
  });
};


export const partRect = (pose: PartPose, slot: Size): Rect => ({ x: pose.x, y: pose.y, width: slot.w * pose.scale, height: slot.h * pose.scale });

const EPS = 1e-6;


export const layoutIssues = (L: Layout): string[] => {
  const issues: string[] = [];
  const inside = (what: string, r: Rect, w: number, h: number) => {
    if (r.x < -EPS || r.y < -EPS || rectRight(r) > w + EPS || rectBottom(r) > h + EPS) issues.push(`${what} ${JSON.stringify(r)} leaves its ${w}x${h} card`);
  };
  const stacked = (what: string, poses: PartPoses) => {
    const [n, v, c] = [partRect(poses.name, L.slots.name), partRect(poses.number, L.slots.number), partRect(poses.chip, L.slots.chip)];
    if (rectBottom(n) > v.y + EPS) issues.push(`${what}: name overlaps number`);
    if (rectBottom(v) > c.y + EPS) issues.push(`${what}: number overlaps chip`);
  };
  for (const part of PARTS) if (!(L.k[part] > 0 && L.k[part] < 1)) issues.push(`k.${part} = ${L.k[part]} is not a shrink`);
  L.cells.forEach((cell, i) => {
    for (const part of PARTS) inside(`tile ${i} ${part}`, partRect(L.tilePose[i][part], L.slots[part]), cell.width, cell.height);
    stacked(`tile ${i}`, L.tilePose[i]);
    if (cell.x < L.region.x || cell.y < L.region.y || rectRight(cell) > rectRight(L.region) || rectBottom(cell) > rectBottom(L.region)) issues.push(`tile ${i} leaves the region`);
    L.cells.forEach((other, j) => {
      if (j > i && cell.x < rectRight(other) && other.x < rectRight(cell) && cell.y < rectBottom(other) && other.y < rectBottom(cell)) issues.push(`tiles ${i} and ${j} overlap`);
    });
  });
  for (const part of PARTS) inside(`hero ${part}`, partRect(L.heroPose[part], L.slots[part]), L.hero.width, L.hero.height);
  stacked("hero", L.heroPose);
  if (L.hero.x < L.region.x || L.hero.y < L.region.y || rectRight(L.hero) > rectRight(L.region) || rectBottom(L.hero) > rectBottom(L.region)) issues.push("hero leaves the region");
  return issues;
};


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean }): Layout => {

  const region: Rect = {
    x: box.left + SURFACE_INSET,
    y: box.top + SURFACE_INSET,
    width: box.right - box.left - 2 * SURFACE_INSET,
    height: mainBottom(box) - SURFACE_INSET - (box.top + SURFACE_INSET),
  };
  const W = region.width;
  const H = region.height;
  const colW = Math.floor((W - GAP) / 2);


  const start = stack(H, 3, GAP);
  const end = stack(H, 2, GAP);
  const local: Rect[] = [
    { x: 0, y: start[0].y, width: colW, height: start[0].h },
    { x: W - colW, y: end[0].y, width: colW, height: end[0].h },
    { x: 0, y: start[1].y, width: colW, height: start[1].h },
    { x: W - colW, y: end[1].y, width: colW, height: end[1].h },
    { x: 0, y: start[2].y, width: colW, height: start[2].h },
  ];
  const cells = local.map((r) => {
    const m = opts.rtl ? mirrorX(r, W) : r;
    return { x: region.x + m.x, y: region.y + m.y, width: m.width, height: m.height };
  });

  const heroH = Math.round(H * HERO_HEIGHT_SHARE);
  const hero: Rect = { x: region.x, y: region.y + Math.round((H - heroH) / 2), width: W, height: heroH };

  const tileInner = colW - 2 * TILE_SIDE;
  const heroInner = W - 2 * HERO_SIDE;
  const slotW: Record<Part, number> = {
    name: Math.min(heroInner, Math.round(tileInner / K_NOMINAL.name)),
    number: heroInner,
    chip: Math.min(heroInner, Math.round(tileInner / K_NOMINAL.chip)),
  };
  const slots: Record<Part, Size> = {
    name: { w: slotW.name, h: SLOT_H.name },
    number: { w: slotW.number, h: SLOT_H.number },
    chip: { w: slotW.chip, h: SLOT_H.chip },
  };

  const k: Record<Part, number> = { name: tileInner / slotW.name, number: tileInner / slotW.number, chip: tileInner / slotW.chip };
  const scaledH = (p: Part): number => SLOT_H[p] * k[p];


  const tilePoseFor = (h: number): PartPoses => {
    const nameY = TILE_PAD_V;
    const chipY = h - TILE_PAD_V - scaledH("chip");
    const numberY = (nameY + scaledH("name") + chipY) / 2 - scaledH("number") / 2;

    return {
      name: { x: TILE_SIDE, y: nameY, scale: k.name },
      number: { x: TILE_SIDE, y: numberY, scale: k.number },
      chip: { x: TILE_SIDE, y: chipY, scale: k.chip },
    };
  };
  const heroX = (part: Part): number => (opts.rtl ? W - HERO_SIDE - slotW[part] : HERO_SIDE);
  const heroNameY = HERO_PAD_V;
  const heroChipY = heroH - HERO_PAD_V - SLOT_H.chip;
  const heroNumberY = (heroNameY + SLOT_H.name + heroChipY) / 2 - SLOT_H.number / 2;
  const heroPose: PartPoses = {
    name: { x: heroX("name"), y: heroNameY, scale: 1 },
    number: { x: heroX("number"), y: heroNumberY, scale: 1 },
    chip: { x: heroX("chip"), y: heroChipY, scale: 1 },
  };

  const L: Layout = {
    region,
    center: { x: region.x + W / 2, y: region.y + H / 2 },
    cells,
    colWidth: colW,
    hero,
    slots,
    k,
    tilePose: cells.map((c) => tilePoseFor(c.height)),
    heroPose,
  };
  const issues = layoutIssues(L);
  if (issues.length > 0) throw new RangeError(`kpi-zoom layoutFor: the box is too small for this layout: ${issues.slice(0, 3).join("; ")}`);
  return L;
};



export type KpiZoomParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  focusIndex: number;

  values: readonly number[];
  changes: readonly number[];

  windowRadius: number;
};


export const HERO_WASH = 0.16;

export const DIM_OPACITY = 0.22;
export const RECEDE = 0.94;

export const ENTER_SCALE = 0.9;

export const radiiFor = (windowRadius: number): { tile: number; hero: number } => ({ tile: Math.round(windowRadius * 0.7), hero: windowRadius });

export type TileState = {

  presence: number;

  dim: number;

  u: number;

  roll: number;

  value: number;
  change: number;
  opacity: number;

  scale: number;
  shift: { x: number; y: number };

  rect: Rect;
  radius: number;

  painted: Rect;

  parts: PartPoses;
};

export type KpiZoomState = {
  focus: number;

  p: number;
  dim: number;
  tiles: TileState[];

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`kpi-zoom stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

const assertParams = (params: KpiZoomParams): void => {
  if (!Number.isInteger(params.focusIndex) || params.focusIndex < 0 || params.focusIndex >= TILE_COUNT) {
    throw new RangeError(`kpi-zoom: focusIndex must be a whole number 0..${TILE_COUNT - 1}, got ${String(params.focusIndex)}`);
  }
  if (params.values.length !== TILE_COUNT || params.changes.length !== TILE_COUNT) {
    throw new RangeError(`kpi-zoom: needs exactly ${TILE_COUNT} values and changes, got ${params.values.length} and ${params.changes.length}`);
  }
};

export const stateAt = (frame: number, duration: number, params: KpiZoomParams): KpiZoomState => {
  finiteFrame(frame);
  assertParams(params);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);
  const radii = radiiFor(params.windowRadius);
  const focus = params.focusIndex;

  const zoom = segBeat(frame, B.zoom, EASE.bezierMorph);
  const dimIn = segBeat(frame, B.dim, EASE.inOut);
  const back = B.back ? segBeat(frame, B.back, EASE.bezierMorph) : 0;
  const u = zoom * (1 - back);
  const dim = dimIn * (1 - back);

  const tiles: TileState[] = Array.from({ length: TILE_COUNT }, (_, i) => {
    const isFocus = i === focus;
    const enter = segBeat(frame, B[`enter${i as Slot}`], EASE.land);
    const exitBeat = B[`exit${i as Slot}`];
    const exit = exitBeat ? segBeat(frame, exitBeat, EASE.inOut) : 0;
    const presence = enter * (1 - exit);

    const roll = isFocus ? segBeat(frame, B.focusRoll, EASE.landQuad) : segBeat(frame, B[`roll${i as Slot}`], EASE.land);
    const shown = roll * presence;

    const tileU = isFocus ? u : 0;
    const tileDim = isFocus ? 0 : dim;
    const cell = L.cells[i];
    const morphed = isFocus
      ? rectMorph({ ...cell, radius: radii.tile }, { ...L.hero, radius: radii.hero }, tileU)
      : { ...cell, radius: radii.tile };
    const rect = roundRect(morphed);

    const recede = mix(1, RECEDE, tileDim);
    const scale = mix(ENTER_SCALE, 1, presence) * recede;

    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const px = L.center.x + (cx - L.center.x) * recede;
    const py = L.center.y + (cy - L.center.y) * recede;

    const pose = (part: Part): PartPose => ({
      x: mix(L.tilePose[i][part].x, L.heroPose[part].x, tileU),
      y: mix(L.tilePose[i][part].y, L.heroPose[part].y, tileU),
      scale: mix(L.tilePose[i][part].scale, L.heroPose[part].scale, tileU),
    });

    return {
      presence,
      dim: tileDim,
      u: tileU,
      roll: shown,

      value: params.values[i] * shown + 0,
      change: params.changes[i] * shown + 0,
      opacity: presence * mix(1, DIM_OPACITY, tileDim),
      scale,
      shift: { x: px - cx, y: py - cy },
      rect,
      radius: morphed.radius,
      painted: centerRect(px, py, rect.width * scale, rect.height * scale),
      parts: { name: pose("name"), number: pose("number"), chip: pose("chip") },
    };
  });

  return { focus, p: u, dim, tiles, rects: tiles.map((t) => t.painted) };
};
