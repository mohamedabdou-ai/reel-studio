import { EASE, clamp01, mix } from "../../core/motion.ts";
import { SURFACE_INSET, centerRect, insetRect, mainBottom, mirrorX, roundRect, type ConceptBox, type Rect } from "../geometry.ts";
import { beatFrames, beatIssues, envelope, minDuration, segBeat, type Beat, type BeatRules, type BeatSpec, type Beats } from "../timeline.ts";
import type { ConceptMode } from "../types.ts";




export const NODE_COUNT = 6;

export const HOP_COUNT = NODE_COUNT - 1;

export const BUMP = 6;

export const BUMP_ROOM = 8;

export const PORT_R = 6;

export const HALO_R = 28;

const idx = (n: number): number[] => Array.from({ length: n }, (_, i) => i);





const HOP = { step: 0.086, len: 0.062, lag: 0.02 } as const;
const REACT = { up: 0.03, down: 0.05, lit: 0.05 } as const;
const BUILD = { start: 0.02, step: 0.034, len: 0.066, drawAfter: 0.03, drawLen: 0.05 } as const;
const ERASE = { step: 0.026, nodeLen: 0.045, connAfter: 0.013, connLen: 0.045 } as const;
const WAVE_START: Readonly<Record<ConceptMode, number>> = { once: 0.265, loop: 0.05 };
const HOLD: Readonly<Record<ConceptMode, readonly [number, number]>> = { once: [0.78, 1], loop: [0.56, 0.77] };

const buildSpec = (mode: ConceptMode): BeatSpec<string> => {
  const loop = mode === "loop";
  const spec: Record<string, readonly [number, number]> = {};
  const goFrom = (i: number): number => WAVE_START[mode] + i * HOP.step;
  const goTo = (i: number): number => goFrom(i) + HOP.len;

  if (!loop) {

    for (const i of idx(NODE_COUNT)) {
      const a = BUILD.start + i * BUILD.step;
      spec[`enter${i}`] = [a, a + BUILD.len];
    }
    for (const i of idx(HOP_COUNT)) {
      const a = BUILD.start + i * BUILD.step + BUILD.drawAfter;
      spec[`draw${i}`] = [a, a + BUILD.drawLen];
    }
  }
  for (const i of idx(HOP_COUNT)) {
    spec[`go${i}`] = [goFrom(i), goTo(i)];
    spec[`tail${i}`] = [goFrom(i) + HOP.lag, goTo(i) + HOP.lag];
  }
  for (const i of idx(NODE_COUNT)) {

    const a = i === 0 ? goFrom(0) : goTo(i - 1);
    const upTo = a + REACT.up;
    spec[`up${i}`] = [a, upTo];
    spec[`down${i}`] = [upTo, upTo + REACT.down];
    spec[`lit${i}`] = [a, a + REACT.lit];
  }
  spec.hold = HOLD[mode];
  if (loop) {

    const e0 = HOLD.loop[1];
    for (const i of idx(NODE_COUNT)) spec[`cool${i}`] = [e0 + i * ERASE.step, e0 + i * ERASE.step + ERASE.nodeLen];
    for (const i of idx(HOP_COUNT)) {
      const a = e0 + i * ERASE.step + ERASE.connAfter;
      spec[`wipe${i}`] = [a, a + ERASE.connLen];
    }
  }
  return spec;
};

const SPECS: Readonly<Record<ConceptMode, BeatSpec<string>>> = { once: buildSpec("once"), loop: buildSpec("loop") };


const ORDER: Readonly<Record<ConceptMode, readonly string[]>> = {
  once: [...idx(NODE_COUNT).map((i) => `enter${i}`), ...idx(HOP_COUNT).map((i) => `go${i}`)],
  loop: [...idx(HOP_COUNT).map((i) => `go${i}`), ...idx(NODE_COUNT).map((i) => `cool${i}`)],
};
export const RULES: Readonly<Record<ConceptMode, BeatRules<string>>> = {
  once: { hold: "hold", holdAtEnd: true, order: ORDER.once },
  loop: { hold: "hold", holdAtEnd: false, order: ORDER.loop },
};


export const beatsFor = (mode: ConceptMode, duration: number): Beats<string> => beatFrames(SPECS[mode], duration);






export const MIN_FRAMES = 150;

export const MIN_VALID_FRAMES = Math.max(minDuration(SPECS.once, RULES.once), minDuration(SPECS.loop, RULES.loop));
export const DEFAULT_FRAMES = 240;






export const modeIssues = (mode: ConceptMode, duration: number): string[] => {
  const beats = beatsFor(mode, duration);
  const issues = beatIssues(beats, duration, RULES[mode]);
  const hold = beats.hold;
  for (const [key, beat] of Object.entries(beats)) {
    if (key === "hold") continue;
    const erasing = key.startsWith("cool") || key.startsWith("wipe");
    if (erasing) {
      if (beat.from < hold.to) issues.push(`${key} starts (${beat.from}) before the hold ends (${hold.to})`);
    } else if (beat.to > hold.from) issues.push(`${key} ends (${beat.to}) after the hold starts (${hold.from})`);
  }
  if (mode === "loop") {
    const lastErase = Math.max(...Object.entries(beats).filter(([k]) => k.startsWith("cool") || k.startsWith("wipe")).map(([, b]) => b.to));
    if (lastErase >= duration) issues.push(`the erase relay ends at ${lastErase}, not before the last frame ${duration}`);
  }
  return issues;
};


export const settledFrame = (mode: ConceptMode, duration: number): number => beatsFor(mode, duration).hold.from;


export const arrivalFrame = (mode: ConceptMode, duration: number, i: number): number => {
  const B = beatsFor(mode, duration);
  return i === 0 ? B.go0.from : B[`go${i - 1}`].to;
};



export type AutomationFlowParams = {
  mode: ConceptMode;
  box: ConceptBox;

  rtl: boolean;

  pillK: number;

  windowRadius: number;
};

export type NodeKind = "input" | "step" | "output";
export type Pt = { x: number; y: number };

export type NodeLayout = {
  kind: NodeKind;

  rect: Rect;

  radius: number;

  badge: Rect;
  text: Rect;
};

export type ConnLayout = {

  a: Pt;
  b: Pt;
  len: number;

  ux: number;
  uy: number;
};

export type Layout = {

  region: Rect;
  nodes: NodeLayout[];
  conns: ConnLayout[];
};


export const layoutFor = (box: ConceptBox, opts: { rtl: boolean; pillK: number; windowRadius: number }): Layout => {
  const room = SURFACE_INSET + BUMP_ROOM;
  const left = box.left + room;
  const top = box.top + room;

  const bottom = mainBottom(box) - room;
  const region: Rect = { x: left, y: top, width: box.right - room - left, height: bottom - top };
  const W = region.width;
  const H = region.height;
  const { rtl } = opts;


  const inH = Math.round(H * 0.122);
  const stepH = Math.round(H * 0.213);
  const outH = Math.round(H * 0.146);
  const gap = Math.floor((H - inH - 2 * stepH - outH) / 3);
  const y1 = inH + gap;
  const y2 = y1 + stepH + gap;
  const y3 = y2 + stepH + gap;

  const colW = 2 * Math.round(W * 0.22);
  const endX = W - colW;

  const abs = (r: Rect): Rect => roundRect({ x: region.x + (rtl ? W - r.x - r.width : r.x), y: region.y + r.y, width: r.width, height: r.height });
  const local = (r: Rect, w: number): Rect => roundRect(rtl ? mirrorX(r, w) : r);
  const pt = (x: number, y: number): Pt => ({ x: Math.round(region.x + (rtl ? W - x : x)), y: Math.round(region.y + y) });

  const cardR = Math.min(opts.windowRadius, 28);
  const bookend = (kind: "input" | "output", y: number, h: number): NodeLayout => {
    const pad = 28;
    const badgeS = Math.round(h * 0.56);
    const textX = pad + badgeS + 22;
    const textH = Math.round(h * 0.62);
    return {
      kind,
      rect: abs({ x: 0, y, width: W, height: h }),
      radius: kind === "input" ? Math.round((opts.pillK * h) / 2) : cardR,
      badge: local({ x: pad, y: (h - badgeS) / 2, width: badgeS, height: badgeS }, W),
      text: local({ x: textX, y: (h - textH) / 2, width: W - textX - pad, height: textH }, W),
    };
  };
  const step = (x: number, y: number): NodeLayout => {
    const pad = 22;
    const badgeS = Math.round(stepH * 0.25);
    const badgeY = Math.round(stepH * 0.115);
    const textY = badgeY + badgeS + 10;
    return {
      kind: "step",
      rect: abs({ x, y, width: colW, height: stepH }),
      radius: cardR,
      badge: local({ x: pad, y: badgeY, width: badgeS, height: badgeS }, colW),
      text: local({ x: pad, y: textY, width: colW - 2 * pad, height: stepH - textY - 18 }, colW),
    };
  };


  const nodes: NodeLayout[] = [bookend("input", 0, inH), step(0, y1), step(endX, y1), step(endX, y2), step(0, y2), bookend("output", y3, outH)];

  const wire = (fromX: number, fromY: number, toX: number, toY: number): ConnLayout => {
    const a = pt(fromX, fromY);
    const b = pt(toX, toY);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, b, len, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len };
  };
  const cx0 = colW / 2;
  const cx1 = endX + colW / 2;
  const conns: ConnLayout[] = [
    wire(cx0, inH, cx0, y1),
    wire(colW, y1 + stepH / 2, endX, y1 + stepH / 2),
    wire(cx1, y1 + stepH, cx1, y2),
    wire(endX, y2 + stepH / 2, colW, y2 + stepH / 2),
    wire(cx0, y2 + stepH, cx0, y3),
  ];
  return { region, nodes, conns };
};



export type NodeState = {

  presence: number;

  scale: number;

  lit: number;

  react: number;

  bump: number;

  rect: Rect;
};

export type ConnState = {

  draw: number;

  trailFrom: number;
  trailTo: number;

  cometFrom: number;
  cometTo: number;

  power: number;
};

export type AutomationFlowState = {
  nodes: NodeState[];
  conns: ConnState[];

  rects: Rect[];
};

const finiteFrame = (frame: number): number => {
  if (!Number.isFinite(frame)) throw new RangeError(`automation-flow stateAt: frame must be finite, got ${String(frame)}`);
  return frame;
};


const span = (from: number, to: number): { from: number; to: number } => (to - from > 1e-9 ? { from, to } : { from: 0, to: 0 });


const wireBox = (c: ConnLayout, t: number): Rect => {
  const x = mix(c.a.x, c.b.x, t);
  const y = mix(c.a.y, c.b.y, t);
  const x0 = Math.min(c.a.x, x) - PORT_R;
  const y0 = Math.min(c.a.y, y) - PORT_R;
  return { x: x0, y: y0, width: Math.max(c.a.x, x) + PORT_R - x0, height: Math.max(c.a.y, y) + PORT_R - y0 };
};

export const stateAt = (frame: number, duration: number, params: AutomationFlowParams): AutomationFlowState => {
  finiteFrame(frame);
  const L = layoutFor(params.box, params);
  const B = beatsFor(params.mode, duration);
  const loop = params.mode === "loop";
  const get = (key: string): Beat => {
    const beat = B[key];
    if (!beat) throw new Error(`automation-flow: no beat "${key}" in mode ${params.mode}`);
    return beat;
  };

  const nodes: NodeState[] = L.nodes.map((n, i) => {
    const presence = loop ? 1 : segBeat(frame, get(`enter${i}`), EASE.land);

    const react = envelope(frame, get(`up${i}`), get(`down${i}`), EASE.land);
    const ramp = segBeat(frame, get(`lit${i}`), EASE.land);
    const lit = loop ? ramp * (1 - segBeat(frame, get(`cool${i}`), EASE.inOut)) : ramp;
    const scale = mix(0.94, 1, presence);

    const bump = Math.round(BUMP * react);
    const c = { x: n.rect.x + n.rect.width / 2, y: n.rect.y + n.rect.height / 2 };
    const painted = insetRect(centerRect(c.x, c.y, n.rect.width * scale, n.rect.height * scale), -bump);
    return { presence, scale, lit, react, bump, rect: roundRect(painted) };
  });

  const conns: ConnState[] = L.conns.map((_, i) => {
    const head = segBeat(frame, get(`go${i}`), EASE.inOut);
    const tail = segBeat(frame, get(`tail${i}`), EASE.inOut);
    const erase = loop ? segBeat(frame, get(`wipe${i}`), EASE.inOut) : 0;
    const draw = loop ? 1 : segBeat(frame, get(`draw${i}`), EASE.land);
    const trail = span(erase, head);
    const comet = span(Math.min(tail, head), head);
    return { draw, trailFrom: trail.from, trailTo: trail.to, cometFrom: comet.from, cometTo: comet.to, power: clamp01((comet.to - comet.from) / 0.25) };
  });

  const rects: Rect[] = [];
  nodes.forEach((n) => {
    if (n.presence > 0) rects.push(n.rect);
  });
  conns.forEach((c, i) => {
    const wire = L.conns[i];
    if (c.draw > 0) rects.push(wireBox(wire, c.draw));
    if (c.power > 0) rects.push(centerRect(mix(wire.a.x, wire.b.x, c.cometTo), mix(wire.a.y, wire.b.y, c.cometTo), 2 * HALO_R, 2 * HALO_R));
  });

  return { nodes, conns, rects };
};
