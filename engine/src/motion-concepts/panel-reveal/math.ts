import { EASE, mix } from "../../core/motion.ts";
import { curtainAt, type CurtainOptions } from "../../core/window-geo.ts";
import { mixColor, parseColor } from "../color.ts";
import { SURFACE_INSET, intersectRect, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, hashSeed, minDuration, mulberry32, pulse, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";




export const PANEL_COUNT = 5;
const PANEL_KEYS = ["p0", "p1", "p2", "p3", "p4"] as const;
const CLOSE_KEYS = ["c0", "c1", "c2", "c3", "c4"] as const;
type PanelKey = (typeof PANEL_KEYS)[number];
type CloseKey = (typeof CLOSE_KEYS)[number];
type OnceKey = PanelKey | "title" | "cta" | "nudge" | "hold";
type ExitKey = "titleOut" | "ctaOut" | CloseKey;
type LoopKey = OnceKey | ExitKey;



const ONCE: BeatSpec<OnceKey> = {
  p0: [0.06, 0.21],
  p1: [0.095, 0.245],
  p2: [0.13, 0.28],
  p3: [0.165, 0.315],
  p4: [0.2, 0.35],
  title: [0.28, 0.4],
  cta: [0.33, 0.45],
  nudge: [0.45, 0.52],
  hold: [0.55, 1],
};



const LOOP: BeatSpec<LoopKey> = {
  p0: [0.03, 0.17],
  p1: [0.055, 0.195],
  p2: [0.08, 0.22],
  p3: [0.105, 0.245],
  p4: [0.13, 0.27],
  title: [0.23, 0.33],
  cta: [0.28, 0.38],
  nudge: [0.38, 0.43],
  hold: [0.44, 0.78],
  titleOut: [0.78, 0.83],
  ctaOut: [0.79, 0.84],
  c4: [0.83, 0.915],
  c3: [0.84, 0.925],
  c2: [0.85, 0.935],
  c1: [0.86, 0.945],
  c0: [0.87, 0.955],
};

const OPEN_ORDER: readonly OnceKey[] = ["p0", "p1", "p2", "p3", "p4", "title", "cta", "nudge"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: OPEN_ORDER };
const LOOP_RULES: BeatRules<LoopKey> = {
  hold: "hold",
  holdAtEnd: false,
  order: [...OPEN_ORDER, "hold", "titleOut", "ctaOut", "c4", "c3", "c2", "c1", "c0"],
};
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & Partial<Beats<ExitKey>>;


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;






export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop" && beats.titleOut && beats.titleOut.from !== beats.hold.to) issues.push("the exit must start where the hold ends");
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;




export const luminance = (color: string): number => {
  const [r, g, b] = parseColor(color);
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};


export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};


const PANEL_LIFT = 0.16;







export const panelFill = (background: string, text: string): string =>
  luminance(background) < 0.2 ? mixColor(background, text, PANEL_LIFT) : text;


const BAR_MIX = 0.5;









export const plateBarFill = (background: string, text: string): string => mixColor(background, text, BAR_MIX);



export type PanelRevealParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  pillK: number;

  seed: string;
};

export type Layout = {

  card: Rect;

  plate: Rect;
  info: Rect;

  panels: Rect[];
  title: Rect;

  cta: Rect;
  ctaText: Rect;
  arrow: Rect;
  ctaRadius: number;

  nudge: number;
};


export const DIVIDER = 2;

export const EDGE_LINE = 4;

export const ZOOM = 0.06;

export const RISE = 28;
const NUDGE = 11;
const CTA_GAP = 16;


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; pillK: number }): Layout => {
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const card: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = card.width;
  const H = card.height;
  const at = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, W) : r);

  const plateH = Math.round(H * 0.6);
  const plate: Rect = { x: 0, y: 0, width: W, height: plateH };
  const info: Rect = { x: 0, y: plateH + DIVIDER, width: W, height: H - plateH - DIVIDER };


  const panels = Array.from({ length: PANEL_COUNT }, (_, i) => {
    const x0 = Math.round((i * W) / PANEL_COUNT);
    const x1 = Math.round(((i + 1) * W) / PANEL_COUNT);
    return at({ x: x0, y: 0, width: x1 - x0, height: H });
  });

  const pad = Math.round(W * 0.05);
  const padY = Math.round(info.height * 0.09);
  const ctaH = Math.round(info.height * 0.24);
  const gapY = Math.round(info.height * 0.065);
  const titleH = info.height - 2 * padY - gapY - ctaH;
  const titleY = info.y + padY;
  const ctaY = titleY + titleH + gapY;
  const barW = W - 2 * pad;

  const inner = Math.round(ctaH * 0.3);
  const arrowS = Math.round(ctaH * 0.5);
  const textH = ctaH - 16;
  const title = at({ x: pad, y: titleY, width: barW, height: titleH });
  const cta = at({ x: pad, y: ctaY, width: barW, height: ctaH });
  const ctaText = at({ x: pad + inner, y: ctaY + (ctaH - textH) / 2, width: barW - 2 * inner - arrowS - CTA_GAP, height: textH });
  const arrow = at({ x: pad + barW - inner - arrowS, y: ctaY + (ctaH - arrowS) / 2, width: arrowS, height: arrowS });

  return {
    card,
    plate,
    info,
    panels,
    title,
    cta,
    ctaText,
    arrow,
    ctaRadius: Math.round((opts.pillK * ctaH) / 2),
    nudge: opts.rtl ? -NUDGE : NUDGE,
  };
};



export type PlateArt = {

  disc: { cx: number; cy: number; r: number };

  bars: Rect[];
};






export const plateArt = (seed: string, width: number, height: number): PlateArt => {
  const rnd = mulberry32(hashSeed(seed));
  const r = Math.round(height * 0.3);
  const disc = {
    cx: Math.round(width * (0.3 + 0.4 * rnd())),
    cy: Math.round(height * (0.36 + 0.06 * rnd())),
    r,
  };
  const n = PANEL_COUNT * 2;
  const gap = 6;
  const bars: Rect[] = Array.from({ length: n }, (_, i) => {
    const x0 = Math.round((i * width) / n);
    const x1 = Math.round(((i + 1) * width) / n);
    const h = Math.round(height * (0.16 + 0.26 * rnd()));
    return { x: x0 + gap / 2, y: height - h, width: x1 - x0 - gap, height: h };
  });
  return { disc, bars };
};



export type PanelState = {

  open: number;

  rect: Rect;

  line: number;
};

export type PanelRevealState = {

  reveal: number;

  zoom: number;
  panels: PanelState[];

  title: { presence: number; dy: number };
  cta: { presence: number; dy: number };

  nudge: number;

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`panel-reveal stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};





export const slatCurtain = (cardHeight: number, open: Beat, close?: Beat): CurtainOptions => ({
  fromF: open.from,
  durF: open.to - open.from,
  full: { windowTop: 0, windowHeight: cardHeight, videoWidth: 0, videoLeft: 0, videoTop: 0 },
  split: { windowTop: cardHeight, windowHeight: 0, videoWidth: 0, videoLeft: 0, videoTop: 0 },
  canvasHeight: cardHeight,
  ease: EASE.bezierMorph,
  ...(close ? { returnF: close.from, returnDurF: close.to - close.from } : {}),
});

export const stateAt = (frame: number, duration: number, params: PanelRevealParams): PanelRevealState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);
  const H = L.card.height;

  const panels: PanelState[] = L.panels.map((slat, i) => {
    const c = curtainAt(frame, slatCurtain(H, B[PANEL_KEYS[i]], B[CLOSE_KEYS[i]]));
    return { open: c.progress, rect: { x: slat.x, y: c.seamY, width: slat.width, height: c.geo.windowHeight }, line: Math.min(EDGE_LINE, c.geo.windowHeight) };
  });
  const reveal = panels.reduce((sum, p) => sum + p.open, 0) / PANEL_COUNT;

  const appear = (enter: Beat, leave: Beat | undefined) => {
    const presence = segBeat(frame, enter, EASE.land) * (1 - (leave ? segBeat(frame, leave, EASE.inOut) : 0));
    return { presence, dy: mix(RISE, 0, presence) };
  };
  const title = appear(B.title, B.titleOut);
  const cta = appear(B.cta, B.ctaOut);

  const card = L.card;
  const rects: Rect[] = [card];
  for (const p of panels) {
    if (p.rect.height > 0) rects.push({ x: card.x + p.rect.x, y: card.y + p.rect.y, width: p.rect.width, height: p.rect.height });
  }
  const shown = (local: Rect, dy: number): Rect | null =>
    intersectRect({ x: card.x + local.x, y: card.y + local.y + dy, width: local.width, height: local.height }, card);
  for (const [item, local] of [[title, L.title], [cta, L.cta]] as const) {
    if (item.presence <= 0) continue;
    const r = shown(local, item.dy);
    if (r) rects.push(r);
  }

  return {
    reveal,
    zoom: 1 + ZOOM * (1 - reveal),
    panels,
    title,
    cta,
    nudge: pulse(frame, B.nudge),
    rects,
  };
};
