import { EASE, clamp01, mix } from "../../core/motion.ts";
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
import { beatFrames, beatIssues, envelope, minDuration, pulse, seg, segBeat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



type OnceKey = "cursorIn" | "press" | "morph" | "cursorOut" | "row0" | "row1" | "row2" | "progress" | "hold";
type LoopKey = OnceKey | "back";

const ONCE: BeatSpec<OnceKey> = {
  cursorIn: [0.04, 0.12],
  press: [0.13, 0.2],
  morph: [0.19, 0.4],
  cursorOut: [0.19, 0.26],
  row0: [0.36, 0.46],
  row1: [0.41, 0.51],
  row2: [0.46, 0.56],
  progress: [0.4, 0.68],
  hold: [0.72, 1],
};

const LOOP: BeatSpec<LoopKey> = {
  cursorIn: [0.03, 0.1],
  press: [0.11, 0.17],
  morph: [0.16, 0.32],
  cursorOut: [0.16, 0.22],
  row0: [0.29, 0.36],
  row1: [0.32, 0.39],
  row2: [0.35, 0.42],
  progress: [0.32, 0.5],
  hold: [0.52, 0.75],
  back: [0.75, 0.93],
};

const ORDER: readonly OnceKey[] = ["cursorIn", "press", "morph", "row0", "row1", "row2"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { back?: { from: number; to: number } };


export const beatsFor = (mode: ConceptMode, duration: number): BeatSet =>
  (mode === "loop" ? beatFrames(LOOP, duration) : beatFrames(ONCE, duration)) as BeatSet;





export const MIN_FRAMES = 150;

export const MIN_VALID_FRAMES = Math.max(minDuration(ONCE, RULES.once), minDuration(LOOP, RULES.loop));
export const DEFAULT_FRAMES = 240;


export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats as Beats<LoopKey>, duration, RULES[mode]);
  if (mode === "loop" && beats.back && beats.back.from !== beats.hold.to) issues.push("back must start where the hold ends");
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;



export type ButtonToWindowParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  pillK: number;

  windowRadius: number;
};

export type RowLayout = { card: Rect; icon: Rect; text: Rect };

export type Layout = {

  window: Rect;

  button: Rect;
  buttonRadius: number;

  label: Rect;
  bar: Rect;
  icon: Rect;
  name: Rect;
  badge: Rect;
  progressLabel: Rect;
  pct: Rect;
  track: Rect;
  rows: RowLayout[];

  tip: { x: number; y: number };
  cursor: Rect;
  rippleRadius: number;
};

const CURSOR_W = 52;
const CURSOR_H = 64;


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; pillK: number; windowRadius: number }): Layout => {
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const win: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = win.width;
  const H = win.height;
  const at = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, W) : r);

  const bw = Math.round(W * 0.62);
  const bh = Math.round(H * 0.165);
  const button = roundRect(centerRect(win.x + W / 2, win.y + H / 2, bw, bh));

  const pad = Math.round(W * 0.045);
  const gap = 20;
  const barH = Math.round(H * 0.125);
  const iconS = Math.round(barH * 0.56);
  const badgeW = Math.round(W * 0.17);
  const badgeH = Math.round(barH * 0.4);
  const icon = at({ x: pad, y: (barH - iconS) / 2, width: iconS, height: iconS });
  const badge = at({ x: W - pad - badgeW, y: (barH - badgeH) / 2, width: badgeW, height: badgeH });
  const nameX = pad + iconS + gap;
  const nameW = W - pad - badgeW - gap - nameX;
  const nameH = Math.round(barH * 0.5);
  const name = at({ x: nameX, y: (barH - nameH) / 2, width: nameW, height: nameH });

  const labelY = barH + Math.round(H * 0.05);
  const labelH = Math.round(H * 0.06);
  const pctW = Math.round(W * 0.18);
  const progressLabel = at({ x: pad, y: labelY, width: W - 2 * pad - pctW - gap, height: labelH });
  const pct = at({ x: W - pad - pctW, y: labelY, width: pctW, height: labelH });
  const trackY = labelY + labelH + Math.round(H * 0.018);
  const trackH = Math.round(H * 0.017);
  const track = at({ x: pad, y: trackY, width: W - 2 * pad, height: trackH });

  const rowsTop = trackY + trackH + Math.round(H * 0.055);
  const rowH = Math.round(H * 0.19);
  const rowGap = Math.round(H * 0.027);
  const inner = 28;
  const dot = Math.round(rowH * 0.42);
  const rows: RowLayout[] = [0, 1, 2].map((i) => {
    const y = rowsTop + i * (rowH + rowGap);
    return {
      card: at({ x: pad, y, width: W - 2 * pad, height: rowH }),
      icon: at({ x: pad + inner, y: y + (rowH - dot) / 2, width: dot, height: dot }),
      text: at({ x: pad + inner + dot + inner, y: y + 14, width: W - 2 * pad - 3 * inner - dot, height: rowH - 28 }),
    };
  });

  const lw = bw - 2 * Math.round(bh * 0.28);
  const lh = Math.round(bh * 0.55);
  const label = roundRect({ x: (W - lw) / 2, y: (H - lh) / 2, width: lw, height: lh });

  const tip = { x: button.x + Math.round(bw * 0.7), y: button.y + Math.round(bh * 0.62) };
  return {
    window: win,
    button,
    buttonRadius: opts.pillK * (bh / 2),
    label,
    bar: { x: 0, y: 0, width: W, height: barH },
    icon,
    name,
    badge,
    progressLabel,
    pct,
    track,
    rows,
    tip,
    cursor: { x: tip.x, y: tip.y, width: CURSOR_W, height: CURSOR_H },
    rippleRadius: Math.round(bh * 0.9),
  };
};



export type RowState = {

  presence: number;

  dy: number;

  check: number;
};

export type ButtonToWindowState = {

  p: number;

  press: number;

  rect: Rect;
  radius: number;

  label: number;
  labelScale: number;

  chrome: number;
  cursor: { opacity: number; scale: number };
  ripple: { p: number; opacity: number };

  fill: number;
  pct: number;
  rows: RowState[];

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`button-to-window stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

export const stateAt = (frame: number, duration: number, params: ButtonToWindowParams): ButtonToWindowState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const morph = segBeat(frame, B.morph, EASE.bezierMorph);
  const back = B.back ? segBeat(frame, B.back, EASE.bezierMorph) : 0;
  const p = morph * (1 - back);

  const chrome = seg(p, 0.55, 0.92, EASE.inOut);
  const label = 1 - seg(p, 0.02, 0.3, EASE.inOut);
  const press = pulse(frame, B.press);
  const cursorOpacity = envelope(frame, B.cursorIn, B.cursorOut, EASE.land);

  const rippleT = frame > B.press.from && frame < B.press.to ? (frame - B.press.from) / (B.press.to - B.press.from) : -1;
  const ripple = rippleT < 0 ? { p: 0, opacity: 0 } : { p: EASE.land(rippleT), opacity: 0.9 * (1 - rippleT) };

  const fill = seg(frame, B.progress.from, B.progress.to, EASE.inOut) * chrome;

  const rows: RowState[] = [B.row0, B.row1, B.row2].map((beat) => {
    const presence = segBeat(frame, beat, EASE.land) * chrome;

    return { presence, dy: mix(28, 0, presence), check: presence >= 1 ? 1 : clamp01((presence - 0.55) / 0.45) };
  });

  const morphed = rectMorph(
    { ...L.button, radius: L.buttonRadius },
    { ...L.window, radius: params.windowRadius },
    p,
  );
  const rect = roundRect(morphed);

  const cursorScale = 1 - 0.16 * press;
  const rects: Rect[] = [rect];
  if (cursorOpacity > 0) rects.push({ x: L.cursor.x, y: L.cursor.y, width: L.cursor.width * cursorScale, height: L.cursor.height * cursorScale });
  if (ripple.opacity > 0) {
    const r = L.rippleRadius * ripple.p;
    rects.push(centerRect(L.tip.x, L.tip.y, 2 * r, 2 * r));
  }
  rows.forEach((row, i) => {
    if (row.presence <= 0) return;
    const card = L.rows[i].card;
    const visible = intersectRect({ x: L.window.x + card.x, y: L.window.y + card.y + row.dy, width: card.width, height: card.height }, rect);
    if (visible) rects.push(visible);
  });

  return {
    p,
    press,
    rect,
    radius: morphed.radius,
    label,
    labelScale: mix(0.9, 1, label),
    chrome,
    cursor: { opacity: cursorOpacity, scale: cursorScale },
    ripple,
    fill,
    pct: Math.round(fill * 100),
    rows,
    rects,
  };
};
