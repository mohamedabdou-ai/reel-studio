import { EASE, mix } from "../../core/motion.ts";
import { rectMorph } from "../../core/mask-geo.ts";
import {
  SURFACE_INSET,
  centerRect,
  intersectRect,
  mainBottom,
  mirrorX,
  roundRect,
  type ConceptBox,
  type Rect,
} from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, pulse, seg, segBeat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



export const PANEL_COUNT = 5;
export const PANEL_KEYS = ["p0", "p1", "p2", "p3", "p4"] as const;






export const panelZ = (i: number): number => PANEL_COUNT - i;

export const LEAVE_KEYS = ["q0", "q1", "q2", "q3", "q4"] as const;
type PanelKey = (typeof PANEL_KEYS)[number];
type LeaveKey = (typeof LEAVE_KEYS)[number];
type OnceKey = "lift" | "morph" | PanelKey | "done" | "hold";
type LoopKey = OnceKey | LeaveKey | "back";


const ONCE: BeatSpec<OnceKey> = {
  lift: [0.05, 0.14],
  morph: [0.13, 0.36],
  p0: [0.28, 0.42],
  p1: [0.31, 0.45],
  p2: [0.34, 0.48],
  p3: [0.37, 0.51],
  p4: [0.4, 0.54],
  done: [0.55, 0.64],
  hold: [0.66, 1],
};




const LOOP: BeatSpec<LoopKey> = {
  lift: [0.02, 0.08],
  morph: [0.07, 0.25],
  p0: [0.21, 0.35],
  p1: [0.24, 0.38],
  p2: [0.27, 0.41],
  p3: [0.3, 0.44],
  p4: [0.33, 0.47],
  done: [0.47, 0.53],
  hold: [0.53, 0.77],
  q4: [0.77, 0.83],
  q3: [0.79, 0.85],
  q2: [0.81, 0.87],
  q1: [0.83, 0.89],
  q0: [0.85, 0.91],
  back: [0.87, 0.97],
};

const ORDER: readonly OnceKey[] = ["lift", "morph", "p0", "p1", "p2", "p3", "p4", "done"];
const LOOP_ORDER: readonly LoopKey[] = [...ORDER, "q4", "q3", "q2", "q1", "q0", "back"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: LOOP_ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

type Span = { from: number; to: number };
export type BeatSet = Beats<OnceKey> & Partial<Record<LeaveKey | "back", Span>>;


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;





export const MIN_FRAMES = 90;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop") {
    const { q4, q1, back } = beats;
    if (!q4 || !q1 || !back) issues.push("loop mode needs the leave beats and `back`");
    else {
      if (q4.from !== beats.hold.to) issues.push("the panels must start retracting where the hold ends");
      if (back.from < q1.from) issues.push("the window must not start closing before the panels have begun to leave");
    }
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;



export type BriefToWorkspaceParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  pillK: number;

  windowRadius: number;
};

export type PanelLayout = {

  hero: boolean;

  slot: Rect;
  seed: Rect;

  chip: Rect;
  label: Rect;
  detail: Rect;

  detailLines: 1 | 2;
};

export type Layout = {

  window: Rect;
  brief: Rect;
  radius: number;
  panelRadius: number;

  header: Rect;

  rule: Rect;




  ruleFrom: number;

  titleFrom: Rect;
  titleTo: Rect;

  bars: Rect[];

  segments: Rect[];
  panels: PanelLayout[];
};


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; pillK: number; windowRadius: number }): Layout => {
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const win: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = win.width;
  const H = win.height;
  const at = (r: Rect, width = W): Rect => roundRect(opts.rtl ? mirrorX(r, width) : r);

  const pad = Math.round(W * 0.045);
  const gap = Math.round(W * 0.023);


  const hh = Math.round(H * 0.177);
  const tw = Math.round(W * 0.641);
  const th = Math.round(hh * 0.73);
  const titleTo = at({ x: pad, y: (hh - th) / 2, width: tw, height: th });
  const ruleH = 2;
  const rule: Rect = { x: 0, y: hh - ruleH, width: W, height: ruleH };
  const segW = Math.round(W * 0.038);
  const segH = 12;
  const segGap = 10;
  const meterW = PANEL_COUNT * segW + (PANEL_COUNT - 1) * segGap;
  const segments = Array.from({ length: PANEL_COUNT }, (_, i) =>
    at({ x: W - pad - meterW + i * (segW + segGap), y: (hh - segH) / 2, width: segW, height: segH }),
  );


  const briefPad = Math.round(W * 0.05);
  const vpad = Math.round(H * 0.067);
  const barH = 14;
  const barGap = 18;
  const barsH = 3 * barH + 2 * barGap;
  const titleGap = 30;
  const bw = tw + 2 * briefPad;
  const bh = th + titleGap + barsH + 2 * vpad;
  const brief = roundRect(centerRect(win.x + W / 2, win.y + H / 2, bw, bh));
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2;
  const titleFrom = at({ x: bx + briefPad, y: by + vpad, width: tw, height: th });



  const travel = titleFrom.y - titleTo.y;
  const ruleFrom = travel > 0 ? Math.min(1, Math.max(0, (titleFrom.y + th - rule.y) / travel)) : 0;
  const barWidths = [1, 0.86, 0.52];
  const bars = barWidths.map((k, j) =>
    at({ x: bx + briefPad, y: by + vpad + th + titleGap + j * (barH + barGap), width: Math.round(tw * k), height: barH }),
  );


  const gridTop = hh + Math.round(H * 0.029);
  const gridBottom = H - Math.round(H * 0.043);
  const rowH = Math.round((gridBottom - gridTop - 2 * gap) / 3);
  const gridW = W - 2 * pad;
  const colW = Math.round((gridW - gap) / 2);
  const rowY = (r: number) => gridTop + r * (rowH + gap);
  const cells: { hero: boolean; rect: Rect }[] = [
    { hero: true, rect: { x: pad, y: rowY(0), width: gridW, height: rowH } },
    { hero: false, rect: { x: pad, y: rowY(1), width: colW, height: rowH } },
    { hero: false, rect: { x: pad + colW + gap, y: rowY(1), width: colW, height: rowH } },
    { hero: false, rect: { x: pad, y: rowY(2), width: colW, height: rowH } },
    { hero: false, rect: { x: pad + colW + gap, y: rowY(2), width: colW, height: rowH } },
  ];
  const cx = W / 2;
  const cy = H / 2;
  const panels: PanelLayout[] = cells.map(({ hero, rect }) => {
    const slot = at(rect);
    const w = slot.width;
    const h = slot.height;

    const ip = hero ? 32 : 22;
    const cs = hero ? 52 : 44;
    const lh = hero ? 62 : 52;
    const dh = hero ? 52 : 88;
    const rowGap = 12;
    const chipGap = 14;
    const y0 = (h - (lh + rowGap + dh)) / 2;
    const local = (r: Rect): Rect => at(r, w);
    const seedW = Math.round(w * 0.4);
    const seedH = Math.round(h * 0.4);
    const seedCx = mix(cx, slot.x + w / 2, 0.18);
    const seedCy = mix(cy, slot.y + h / 2, 0.18);
    return {
      hero,
      slot,
      seed: roundRect(centerRect(seedCx, seedCy, seedW, seedH)),
      chip: local({ x: ip, y: y0 + (lh - cs) / 2, width: cs, height: cs }),
      label: local({ x: ip + cs + chipGap, y: y0, width: w - 2 * ip - cs - chipGap, height: lh }),
      detail: local({ x: ip, y: y0 + lh + rowGap, width: w - 2 * ip, height: dh }),
      detailLines: hero ? 1 : 2,
    };
  });

  return {
    window: win,
    brief,
    radius: opts.windowRadius,
    panelRadius: Math.round(opts.windowRadius * 0.6),
    header: { x: 0, y: 0, width: W, height: hh },
    rule,
    ruleFrom,
    titleFrom,
    titleTo,
    bars,
    segments,
    panels,
  };
};



export type PanelState = {

  presence: number;

  rect: Rect;

  zoom: number;

  fade: number;

  content: number;
};

export type BriefToWorkspaceState = {

  p: number;

  lift: number;

  scale: number;

  rect: Rect;
  radius: number;
  outer: Rect;

  title: Rect;

  bars: number;

  chrome: number;




  rule: number;
  panels: PanelState[];

  segments: number[];
  done: number;

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`brief-to-workspace stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

const toAbs = (win: Rect, r: Rect): Rect => ({ x: win.x + r.x, y: win.y + r.y, width: r.width, height: r.height });

export const stateAt = (frame: number, duration: number, params: BriefToWorkspaceParams): BriefToWorkspaceState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const morph = segBeat(frame, B.morph, EASE.bezierMorph);
  const back = B.back ? segBeat(frame, B.back, EASE.bezierMorph) : 0;
  const p = morph * (1 - back);

  const lift = pulse(frame, B.lift);
  const scale = 1 + 0.03 * lift * (1 - p);
  const chrome = seg(p, 0.55, 0.92, EASE.inOut);

  const rule = seg(p, L.ruleFrom, 1, EASE.inOut);
  const bars = 1 - seg(p, 0, 0.3, EASE.inOut);

  const panels: PanelState[] = PANEL_KEYS.map((key, i) => {

    const enter = segBeat(frame, B[key], EASE.land);

    const leaveBeat = B[LEAVE_KEYS[i]];
    const leave = leaveBeat ? segBeat(frame, leaveBeat, EASE.out) : 0;
    const presence = enter * (1 - leave);
    const { seed, slot } = L.panels[i];
    const rect = roundRect(rectMorph(seed, slot, presence));
    return {
      presence,
      rect,
      zoom: rect.width / slot.width,
      fade: seg(presence, 0, 0.2, EASE.inOut),


      content: seg(presence, 0.85, 1, EASE.inOut),
    };
  });
  const segments = panels.map((panel) => seg(panel.presence, 0.6, 1, EASE.inOut));

  const done = seg(frame, B.done.from, B.done.to, EASE.inOut) * Math.min(...segments);

  const morphed = rectMorph({ ...L.brief, radius: L.radius }, { ...L.window, radius: L.radius }, p);
  const rect = roundRect(morphed);
  const outer = roundRect(centerRect(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width * scale, rect.height * scale));
  const title = roundRect({
    x: mix(L.titleFrom.x, L.titleTo.x, p),
    y: mix(L.titleFrom.y, L.titleTo.y, p),
    width: L.titleTo.width,
    height: L.titleTo.height,
  });


  const rects: Rect[] = [outer];
  const clip = (r: Rect): void => {
    const visible = intersectRect(toAbs(L.window, r), rect);
    if (visible) rects.push(visible);
  };
  clip(title);
  if (bars > 0) L.bars.forEach(clip);
  if (chrome > 0) L.segments.forEach(clip);
  if (rule > 0) clip(L.rule);
  panels.forEach((panel) => {
    if (panel.presence > 0) clip(panel.rect);
  });

  return { p, lift, scale, rect, radius: morphed.radius, outer, title, bars, chrome, rule, panels, segments, done, rects };
};
