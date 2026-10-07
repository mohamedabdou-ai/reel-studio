import { rectMorph } from "../../core/mask-geo.ts";
import { EASE } from "../../core/motion.ts";
import { SURFACE_INSET, centerRect, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, seg, segBeat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



export type Idx = 0 | 1 | 2 | 3;

export const IDX: readonly Idx[] = [0, 1, 2, 3];

type OnceKey = "morph" | "hold" | `line${Idx}` | `card${Idx}` | `bars${Idx}`;
type LoopKey = OnceKey | `out${Idx}` | "back";




const ONCE: BeatSpec<OnceKey> = {
  morph: [0.1, 0.34],
  line0: [0.31, 0.43],
  line1: [0.34, 0.46],
  line2: [0.37, 0.49],
  line3: [0.4, 0.52],
  card0: [0.39, 0.5],
  card1: [0.42, 0.53],
  card2: [0.45, 0.56],
  card3: [0.48, 0.59],
  bars0: [0.5, 0.62],
  bars1: [0.53, 0.65],
  bars2: [0.56, 0.68],
  bars3: [0.59, 0.71],
  hold: [0.72, 1],
};

const LOOP: BeatSpec<LoopKey> = {
  morph: [0.08, 0.27],
  line0: [0.25, 0.35],
  line1: [0.27, 0.37],
  line2: [0.29, 0.39],
  line3: [0.31, 0.41],
  card0: [0.32, 0.41],
  card1: [0.34, 0.43],
  card2: [0.36, 0.45],
  card3: [0.38, 0.47],
  bars0: [0.39, 0.48],
  bars1: [0.41, 0.5],
  bars2: [0.43, 0.52],
  bars3: [0.45, 0.54],
  hold: [0.54, 0.76],
  out0: [0.76, 0.83],
  out1: [0.78, 0.85],
  out2: [0.8, 0.87],
  out3: [0.82, 0.89],
  back: [0.86, 0.95],
};

const ORDER: readonly OnceKey[] = ["morph", "line0", "line1", "line2", "line3"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & Partial<Beats<`out${Idx}` | "back">>;


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;







export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  const settle = beats.morph.from + Math.floor(0.75 * (beats.morph.to - beats.morph.from));
  for (const i of IDX) {
    const line = beats[`line${i}` as const];
    const card = beats[`card${i}` as const];
    const bars = beats[`bars${i}` as const];
    if (line.from < settle) issues.push(`line${i} starts (${line.from}) before the hub has settled (${settle})`);
    if (card.from < line.from) issues.push(`card${i} starts before its connector`);
    if (card.to < line.to) issues.push(`card${i} lands before its connector has arrived`);
    if (bars.from < card.from) issues.push(`bars${i} start before their card`);
    if (bars.to > beats.hold.from) issues.push(`bars${i} end (${bars.to}) after the hold starts (${beats.hold.from})`);
    if (i > 0) {
      for (const kind of ["line", "card", "bars"] as const) {
        if (beats[`${kind}${i}` as const].from < beats[`${kind}${(i - 1) as Idx}` as const].from) issues.push(`${kind}${i} starts before ${kind}${i - 1}`);
      }
    }
  }
  if (mode === "once") {
    if (beats.back || beats.out0) issues.push("once mode never retracts");
  } else {
    const out0 = beats.out0;
    const back = beats.back;
    if (!out0 || !back) issues.push("loop mode needs out0..3 and back");
    else {
      if (out0.from !== beats.hold.to) issues.push("the first card must start leaving where the hold ends");
      for (const i of IDX) {
        const out = beats[`out${i}` as const];
        if (!out) issues.push(`out${i} is missing`);
        else if (out.to > back.to) issues.push(`out${i} ends after the headline has re-formed`);
      }
      if (back.to > duration) issues.push("back ends after the last frame");
    }
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;



export type HeadlineToSystemParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  pillK: number;

  windowRadius: number;
};

export type Pt = { x: number; y: number };

export type CardLayout = {

  card: Rect;

  seed: Rect;

  badge: Rect;
  label: Rect;
  barA: Rect;
  barB: Rect;

  side: 1 | -1;

  route: Pt[];
};

export type Layout = {

  region: Rect;

  centre: Pt;

  hub: Rect;

  pad: { x: number; y: number };

  text: Rect;

  openScale: number;
  cards: CardLayout[];

  corner: number;

  port: number;

  cardRadius: number;
};


export const OPEN_FILL = 0.92;

export const PORT_HALF = 9;

const PORT_FRAC = 0.27;







export const CONTENT_FROM = 0.7;

export const FADE_TO = 0.2;


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; pillK: number; windowRadius: number }): Layout => {
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const region: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = region.width;
  const H = region.height;
  const centre: Pt = { x: region.x + W / 2, y: region.y + H / 2 };

  const pt = (x: number, y: number): Pt => ({ x: Math.round(region.x + (opts.rtl ? W - x : x)), y: Math.round(region.y + y) });

  const hubW = Math.round(W * 0.6);
  const hubH = Math.round(H * 0.245);
  const padX = Math.round(W * 0.034);
  const padY = Math.round(H * 0.031);
  const hub = roundRect(centerRect(centre.x, centre.y, hubW, hubH));
  const text = roundRect(centerRect(centre.x, centre.y, hubW - 2 * padX, hubH - 2 * padY));
  const openScale = Math.floor((1000 * OPEN_FILL * W) / text.width) / 1000;

  const cw = Math.round(W * 0.47);
  const ch = Math.round(H * 0.23);

  const slots: Rect[] = [
    { x: 0, y: 0, width: cw, height: ch },
    { x: W - cw, y: 0, width: cw, height: ch },
    { x: 0, y: H - ch, width: cw, height: ch },
    { x: W - cw, y: H - ch, width: cw, height: ch },
  ];
  const hubLocal: Rect = { x: W / 2 - hubW / 2, y: H / 2 - hubH / 2, width: hubW, height: hubH };


  const padC = 22;
  const badgeS = 56;
  const gapC = 16;
  const rowH = Math.round(ch * 0.44);
  const barH = 12;
  const barY = padC + rowH + Math.round(ch * 0.1);
  const inC = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, cw) : r);

  const cards: CardLayout[] = IDX.map((i) => {
    const row = i < 2 ? 0 : 1;
    const col = i % 2;
    const slot = slots[i];
    const abs = roundRect({ x: region.x + (opts.rtl ? W - slot.x - slot.width : slot.x), y: region.y + slot.y, width: slot.width, height: slot.height });
    const fx = hubLocal.x + hubLocal.width * (col === 0 ? PORT_FRAC : 1 - PORT_FRAC);
    const fy = row === 0 ? hubLocal.y : hubLocal.y + hubLocal.height;
    const tx = slot.x + slot.width / 2;
    const ty = row === 0 ? slot.y + slot.height : slot.y;
    const my = (fy + ty) / 2;
    return {
      card: abs,
      seed: hub,
      badge: inC({ x: padC, y: padC + (rowH - badgeS) / 2, width: badgeS, height: badgeS }),
      label: inC({ x: padC + badgeS + gapC, y: padC, width: cw - 2 * padC - badgeS - gapC, height: rowH }),
      barA: inC({ x: padC, y: barY, width: cw - 2 * padC, height: barH }),
      barB: inC({ x: padC, y: barY + barH + 12, width: Math.round((cw - 2 * padC) * 0.62), height: barH }),
      side: row === 0 ? 1 : -1,
      route: [pt(fx, fy), pt(fx, my), pt(tx, my), pt(tx, ty)],
    };
  });

  return {
    region,
    centre,
    hub,
    pad: { x: padX, y: padY },
    text,
    openScale,
    cards,
    corner: Math.round(opts.windowRadius * 0.6),
    port: PORT_HALF,
    cardRadius: opts.windowRadius,
  };
};






export const roundedPath = (pts: readonly Pt[], radius: number): string => {
  if (pts.length < 2) return "";
  const n = (v: number) => Math.round(v * 100) / 100;
  const toward = (from: Pt, to: Pt, d: number): Pt => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    return len === 0 ? from : { x: from.x + ((to.x - from.x) * d) / len, y: from.y + ((to.y - from.y) * d) / len };
  };
  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const r = Math.max(0, Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2));
    const p1 = toward(b, a, r);
    const p2 = toward(b, c, r);
    d += ` L ${n(p1.x)} ${n(p1.y)} Q ${n(b.x)} ${n(b.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${n(last.x)} ${n(last.y)}`;
};



export type CardState = {

  presence: number;

  fade: number;

  content: number;

  line: number;

  portFrom: number;
  portTo: number;

  bars: [number, number];

  rect: Rect;
};

export type HeadlineToSystemState = {

  p: number;

  textScale: number;

  cardIn: number;

  hub: Rect;
  radius: number;

  text: Rect;
  cards: CardState[];

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`headline-to-system stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

const boundsOf = (pts: readonly Pt[]): Rect => {
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

export const stateAt = (frame: number, duration: number, params: HeadlineToSystemParams): HeadlineToSystemState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const morph = segBeat(frame, B.morph, EASE.bezierMorph);
  const back = B.back ? segBeat(frame, B.back, EASE.bezierMorph) : 0;
  const p = morph * (1 - back);

  const textScale = 1 + (L.openScale - 1) * (1 - p);
  const cardIn = seg(p, 0.12, 0.55, EASE.inOut);

  const hub = roundRect(centerRect(L.centre.x, L.centre.y, L.text.width * textScale + 2 * L.pad.x * p, L.text.height * textScale + 2 * L.pad.y * p));
  const radius = params.windowRadius * (0.5 + 0.5 * p);
  const text = roundRect(centerRect(L.centre.x, L.centre.y, L.text.width * textScale, L.text.height * textScale));

  const cards: CardState[] = IDX.map((i) => {
    const outBeat = B[`out${i}` as const];
    const alive = 1 - (outBeat ? segBeat(frame, outBeat, EASE.inOut) : 0);

    const presence = segBeat(frame, B[`card${i}` as const], EASE.bezierMorph) * alive;
    const line = segBeat(frame, B[`line${i}` as const], EASE.inOut) * alive;
    const bt = segBeat(frame, B[`bars${i}` as const], EASE.inOut);
    const lay = L.cards[i];
    return {
      presence,
      fade: seg(presence, 0, FADE_TO, EASE.inOut),
      content: seg(presence, CONTENT_FROM, 1, EASE.inOut),
      line,
      portFrom: seg(line, 0, 0.12, EASE.land),
      portTo: seg(line, 0.88, 1, EASE.land),
      bars: [seg(bt, 0, 0.7, EASE.inOut) * alive, seg(bt, 0.3, 1, EASE.inOut) * alive],

      rect: roundRect(rectMorph(lay.seed, lay.card, presence)),
    };
  });

  const rects: Rect[] = [text];
  if (cardIn > 0) rects.push(hub);
  cards.forEach((c, i) => {
    const route = L.cards[i].route;
    if (c.presence > 0) rects.push(c.rect);
    if (c.line > 0) rects.push(boundsOf(route));
    if (c.portFrom > 0) rects.push(centerRect(route[0].x, route[0].y, 2 * L.port * c.portFrom, 2 * L.port * c.portFrom));
    if (c.portTo > 0) rects.push(centerRect(route[3].x, route[3].y, 2 * L.port * c.portTo, 2 * L.port * c.portTo));
  });

  return { p, textScale, cardIn, hub, radius, text, cards, rects };
};
