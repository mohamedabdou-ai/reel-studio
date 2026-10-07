import { EASE, clamp01 } from "../../core/motion.ts";
import { SURFACE_INSET, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, minDuration, pulse, seg, segBeat, type BeatRules, type BeatSpec, type Beat, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";



type OnceKey = "type" | "send" | "card0" | "card1" | "card2" | "hold";
type LoopKey = OnceKey | "back";

const ONCE: BeatSpec<OnceKey> = {
  type: [0.06, 0.34],
  send: [0.37, 0.43],
  card0: [0.44, 0.56],
  card1: [0.5, 0.62],
  card2: [0.56, 0.68],
  hold: [0.7, 1],
};

const LOOP: BeatSpec<LoopKey> = {
  type: [0.05, 0.26],
  send: [0.28, 0.33],
  card0: [0.34, 0.45],
  card1: [0.38, 0.49],
  card2: [0.42, 0.53],
  hold: [0.55, 0.77],
  back: [0.77, 0.94],
};

const ORDER: readonly OnceKey[] = ["type", "send", "card0", "card1", "card2"];
const ONCE_RULES: BeatRules<OnceKey> = { hold: "hold", holdAtEnd: true, order: ORDER };
const LOOP_RULES: BeatRules<LoopKey> = { hold: "hold", holdAtEnd: false, order: ORDER };
export const RULES = { once: ONCE_RULES, loop: LOOP_RULES } as const;

export type BeatSet = Beats<OnceKey> & { back?: Beat };


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



export type PromptToResultsParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  pillK: number;

  windowRadius: number;
};

export type CardLayout = {

  card: Rect;

  chip: Rect;
  title: Rect;
  detail: Rect;

  nodeY: number;
};

export type Layout = {

  window: Rect;

  field: Rect;

  input: Rect;
  send: Rect;
  cards: CardLayout[];

  trunk: { x: number; y0: number; y1: number; nodes: number[]; stubX: number };
  fieldRadius: number;
  cardRadius: number;
  chipRadius: number;
  sendRadius: number;
};


export const CARD_TRAVEL = 28;


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; pillK: number; windowRadius: number }): Layout => {
  const left = box.left + SURFACE_INSET;
  const top = box.top + SURFACE_INSET;
  const right = box.right - SURFACE_INSET;

  const bottom = mainBottom(box) - SURFACE_INSET;
  const win: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const W = win.width;
  const H = win.height;
  const inWin = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, W) : r);




  const fieldH = Math.round(H * 0.25);
  const gap = Math.round(H * 0.031);
  const cardH = Math.floor((H - fieldH - Math.round(H * 0.045) - 2 * gap) / 3);
  const stem = H - fieldH - 2 * gap - 3 * cardH;
  const field: Rect = { x: 0, y: 0, width: W, height: fieldH };


  const padX = Math.round(W * 0.036);
  const sendS = Math.round(fieldH * 0.4);
  const inputW = W - 2 * padX - sendS - 24;
  const inputY = Math.round(fieldH * 0.15);
  const send = inWin({ x: W - padX - sendS, y: Math.round((fieldH - sendS) / 2), width: sendS, height: sendS });
  const input = inWin({ x: padX, y: inputY, width: inputW, height: fieldH - 2 * inputY });


  const gutter = Math.round(W * 0.095);
  const cardW = W - gutter;
  const cardsTop = fieldH + stem;
  const pad = Math.round(cardH * 0.145);
  const chipS = Math.round(cardH * 0.38);
  const padY = Math.round(cardH * 0.12);
  const innerH = cardH - 2 * padY;
  const titleH = Math.round(innerH * 0.42);
  const detailH = innerH - titleH - 4;
  const textX = pad + chipS + 22;
  const textW = cardW - textX - pad;
  const inCard = (r: Rect): Rect => roundRect(opts.rtl ? mirrorX(r, cardW) : r);
  const cards: CardLayout[] = [0, 1, 2].map((i) => {
    const y = cardsTop + i * (cardH + gap);
    return {
      card: inWin({ x: gutter, y, width: cardW, height: cardH }),
      chip: inCard({ x: pad, y: Math.round((cardH - chipS) / 2), width: chipS, height: chipS }),
      title: inCard({ x: textX, y: padY, width: textW, height: titleH }),
      detail: inCard({ x: textX, y: padY + titleH + 4, width: textW, height: detailH }),
      nodeY: y + Math.round(cardH / 2),
    };
  });

  const trunkX = opts.rtl ? W - Math.round(gutter * 0.55) : Math.round(gutter * 0.55);
  const nodes = cards.map((c) => c.nodeY);
  return {
    window: win,
    field,
    input,
    send,
    cards,

    trunk: { x: trunkX, y0: fieldH, y1: nodes[2], nodes, stubX: opts.rtl ? W - gutter : gutter },
    fieldRadius: opts.windowRadius,
    cardRadius: Math.round(opts.windowRadius * 0.6),
    chipRadius: Math.round((opts.pillK * chipS) / 2),
    sendRadius: Math.round((opts.pillK * sendS) / 2),
  };
};




const RHYTHM = { amplitude: 0.45, cycles: 3 } as const;





export const typeClock = (p: number): number => {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const w = 2 * Math.PI * RHYTHM.cycles;
  return clamp01(p - (RHYTHM.amplitude * Math.sin(w * p)) / w);
};






export const unitsShown = (typed: number, total: number): number => {
  if (!Number.isInteger(total) || total < 0) throw new RangeError(`prompt-to-results unitsShown: total must be a whole number >= 0, got ${String(total)}`);
  if (!(typed > 0)) return 0;
  if (typed >= 1) return total;

  return Math.max(Math.min(1, total), Math.min(total, Math.ceil(typed * total - 1e-9)));
};



export type CardState = {

  presence: number;

  dy: number;

  scale: number;

  detail: number;

  chip: number;
};

export type PromptToResultsState = {

  typed: number;

  armed: number;

  press: number;

  focus: number;
  cards: CardState[];

  trunk: { drawn: number; stubs: number[] };

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`prompt-to-results stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};

const LINEAR = (p: number): number => p;


const UNWIND = {
  out: [
    [0.2, 0.7],
    [0.1, 0.6],
    [0, 0.5],
  ],
  clear: [0.45, 0.9],
  returned: [0.75, 1],
} as const;

export const stateAt = (frame: number, duration: number, params: PromptToResultsParams): PromptToResultsState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);

  const u = B.back ? segBeat(frame, B.back, LINEAR) : 0;

  const clock = typeClock(segBeat(frame, B.type, LINEAR));
  const clear = seg(u, UNWIND.clear[0], UNWIND.clear[1], EASE.inOut);
  const typed = clock * (1 - clear);

  const press = pulse(frame, B.send);

  const sendMid = B.send.from + Math.max(1, Math.floor((B.send.to - B.send.from) / 2));
  const sent = seg(frame, B.send.from, sendMid, EASE.inOut);
  const focus = 1 - sent * (1 - seg(u, UNWIND.returned[0], UNWIND.returned[1], EASE.inOut));

  const cards: CardState[] = [B.card0, B.card1, B.card2].map((beat, i) => {
    const enter = segBeat(frame, beat, EASE.land);
    const out = seg(u, UNWIND.out[i][0], UNWIND.out[i][1], EASE.inOut);
    const presence = enter * (1 - out);
    return {
      presence,
      dy: CARD_TRAVEL * (presence - 1),
      scale: 1 - 0.04 * (1 - presence),
      detail: seg(presence, 0.3, 0.85, EASE.inOut),

      chip: 1 - 0.28 * (1 - EASE.backOut(seg(presence, 0.25, 1, LINEAR))),
    };
  });


  const nodes = L.trunk.nodes;
  const segLen = nodes.map((y, i) => y - (i === 0 ? L.trunk.y0 : nodes[i - 1]));
  const total = segLen.reduce((a, l) => a + l, 0);
  const drawnLen = segLen.reduce((a, l, i) => a + l * seg(cards[i].presence, 0, 0.5, EASE.inOut), 0);
  const stubs = cards.map((c) => seg(c.presence, 0.5, 1, EASE.inOut));

  const at = (r: Rect, dy = 0): Rect => ({ x: L.window.x + r.x, y: L.window.y + r.y + dy, width: r.width, height: r.height });
  const rects: Rect[] = [at(L.field), at(L.send), ...cards.map((c, i) => at(L.cards[i].card, c.dy))];

  return {
    typed,
    armed: typed > 0 ? 1 : 0,
    press,
    focus,
    cards,
    trunk: { drawn: drawnLen >= total ? 1 : drawnLen / total, stubs },
    rects,
  };
};
