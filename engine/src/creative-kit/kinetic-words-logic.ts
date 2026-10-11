// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import type { MappedWord } from "../prepared-edit/timeline.ts";
import { EASE, clamp01, toFrame } from "../core/motion.ts";
import type { SpringPreset } from "../core/motion.ts";

export type TranscriptLanguage = "ar" | "en";
export type LineDirection = "rtl" | "ltr";

export const directionFor = (lang: TranscriptLanguage): LineDirection => {
  if (lang === "ar") return "rtl";
  if (lang === "en") return "ltr";
  throw new Error(
    `kinetic-words: transcript language must be "ar" or "en", got ${JSON.stringify(lang)}. ` +
      `Line direction comes from the transcript, never from one cue's letters.`,
  );
};

const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷏ﷰ-﷽ﹰ-﻾]/;
const LATIN_LETTER = /[A-Za-z]/;
const LTR_LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

const isZeroAdvance = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x200b && c <= 0x200f) ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2060 && c <= 0x2064) ||
    (c >= 0x2066 && c <= 0x2069) ||
    c === 0xfeff ||
    (c >= 0x064b && c <= 0x065f) ||
    c === 0x0670 ||
    (c >= 0x06d6 && c <= 0x06ed)
  );
};

export const advanceCount = (text: string): number => {
  let n = 0;
  for (const ch of text) if (!isZeroAdvance(ch)) n += 1;
  return n;
};

export type TokenFlow = "rtl" | "ltr" | "neutral";

export const tokenFlow = (text: string): TokenFlow => {
  for (const ch of text) {
    if (ARABIC_LETTER.test(ch)) return "rtl";
    if (LTR_LETTER.test(ch)) return "ltr";
  }
  return "neutral";
};

export type SpokenWord = Pick<MappedWord, "text" | "sourceIndex" | "fromFrame" | "toFrame">;
export type TokenPart = { sourceIndex: number; part: number };
export type WordToken = {
  text: string;

  enterFrame: number;
  sourceIndex: number;
  part: number;

  parts: TokenPart[];
};
export type TokenizeOptions = {

  origin?: number;

  leadFrames?: number;

  joinContinuations?: boolean | "auto";
};

const assertIntFrame = (name: string, value: number): void => {
  if (!Number.isInteger(value)) throw new Error(`kinetic-words: ${name} must be an integer frame, got ${value}.`);
};

export const tokenizeSpoken = (words: readonly SpokenWord[], opts: TokenizeOptions = {}): WordToken[] => {
  const origin = opts.origin ?? 0;
  const lead = opts.leadFrames ?? 0;
  assertIntFrame("origin", origin);
  assertIntFrame("leadFrames", lead);
  const join = opts.joinContinuations ?? "auto";
  const joinActive = join === "auto" ? words.some((w) => /^\s/.test(w.text)) : join;
  const tokens: WordToken[] = [];
  let lastEnter = Number.NEGATIVE_INFINITY;
  words.forEach((word, index) => {
    if (!Number.isInteger(word.fromFrame) || !Number.isInteger(word.toFrame) || word.toFrame < word.fromFrame) {
      throw new Error(
        `kinetic-words: word ${word.sourceIndex} needs integer frames with toFrame >= fromFrame (got ${word.fromFrame}..${word.toFrame}).`,
      );
    }
    const pieces = word.text.split(/\s+/).filter((p) => p.length > 0);
    if (pieces.length === 0) throw new Error(`kinetic-words: word ${word.sourceIndex} is empty.`);
    const continuation = joinActive && index > 0 && tokens.length > 0 && !/^\s/.test(word.text);
    const counts = pieces.map(advanceCount);
    const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
    const span = word.toFrame - word.fromFrame;
    let before = 0;
    pieces.forEach((piece, part) => {
      if (part === 0 && continuation) {
        const prev = tokens[tokens.length - 1];
        prev.text += piece;
        prev.parts.push({ sourceIndex: word.sourceIndex, part: 0 });
      } else {

        const onset = word.fromFrame + Math.floor((span * before) / total) - origin - lead;
        const enterFrame = Math.max(onset, lastEnter);
        lastEnter = enterFrame;
        tokens.push({ text: piece, enterFrame, sourceIndex: word.sourceIndex, part, parts: [{ sourceIndex: word.sourceIndex, part }] });
      }
      before += counts[part];
    });
  });
  return tokens;
};

export const EMPHASIS_KINDS = ["accent", "latin", "pop", "underline", "weight"] as const;
export type EmphasisKind = (typeof EMPHASIS_KINDS)[number];
export type EmphasisSpec = { sourceIndex: number; part?: number; kind: EmphasisKind };

export const resolveEmphasis = (tokens: readonly WordToken[], specs: readonly EmphasisSpec[]): EmphasisKind[][] => {
  for (const s of specs) {
    if (!(EMPHASIS_KINDS as readonly string[]).includes(s.kind)) {
      throw new Error(`kinetic-words: unknown emphasis kind ${JSON.stringify(s.kind)}; use one of ${EMPHASIS_KINDS.join(", ")}.`);
    }
    if (!Number.isInteger(s.sourceIndex) || s.sourceIndex < 0 || (s.part !== undefined && (!Number.isInteger(s.part) || s.part < 0))) {
      throw new Error(`kinetic-words: emphasis needs a non-negative integer sourceIndex / part, got ${JSON.stringify(s)}.`);
    }
  }
  return tokens.map((token) => {
    const hits = new Set<EmphasisKind>();
    for (const s of specs) {
      if (token.parts.some((p) => p.sourceIndex === s.sourceIndex && (s.part === undefined || s.part === p.part))) hits.add(s.kind);
    }
    if (hits.has("latin") && !LATIN_LETTER.test(token.text)) {
      throw new Error(
        `kinetic-words: 'latin' emphasis on «${token.text}» (word ${token.sourceIndex}) — the token has no Latin letter to set in the Latin face.`,
      );
    }
    return EMPHASIS_KINDS.filter((k) => hits.has(k));
  });
};

export const TOKEN_ENTERS = ["rise", "pop", "fade"] as const;
export type TokenEnter = (typeof TOKEN_ENTERS)[number];

export const tokenEnter = (
  lineEnter: TokenEnter,
  kinds: readonly EmphasisKind[],
): { enter: TokenEnter; preset: Extract<SpringPreset, "snap" | "pop"> } => {
  if (!(TOKEN_ENTERS as readonly string[]).includes(lineEnter)) {
    throw new Error(`kinetic-words: unknown enter ${JSON.stringify(lineEnter)}; use rise, pop or fade.`);
  }
  return kinds.includes("pop") ? { enter: "pop", preset: "pop" } : { enter: lineEnter, preset: "snap" };
};

export const tokenColor = (kinds: readonly EmphasisKind[], palette: { color: string; accent: string }): string =>
  kinds.includes("accent") ? palette.accent : palette.color;

export type TokenFont = { fontFamily: string; fontSize: number; fontWeight: number };

export const tokenTypeStyle = (
  base: TokenFont,
  kinds: readonly EmphasisKind[],
  fontSize: number,
  opts: { latinFamily: string; heavyWeight: number },
): TokenFont => ({
  fontFamily: kinds.includes("latin") ? opts.latinFamily : base.fontFamily,
  fontSize,
  fontWeight: kinds.includes("weight") ? opts.heavyWeight : base.fontWeight,
});

export type Pose = { opacity: number; rise: number; scale: number };
export const ENTERED: Pose = { opacity: 1, rise: 0, scale: 1 };
export const POP_FROM = 0.55;

export const RISE_BY = 0.42;
export const ENTER_FRAMES = { rise: 6, fade: 4, pop: 2 } as const;

export const enterPose = (enter: TokenEnter, local: number, sprung: number): Pose => {
  if (local < 0) return { opacity: 0, rise: 0, scale: 1 };
  if (enter === "fade") return { opacity: clamp01((local + 1) / ENTER_FRAMES.fade), rise: 0, scale: 1 };
  if (enter === "rise") {
    return { opacity: clamp01((local + 1) / 3), rise: RISE_BY * (1 - EASE.land((local + 1) / ENTER_FRAMES.rise)), scale: 1 };
  }
  const s = Number.isFinite(sprung) ? sprung : 1;
  return { opacity: clamp01((local + 1) / ENTER_FRAMES.pop), rise: 0, scale: POP_FROM + (1 - POP_FROM) * s };
};

export const assignLines = (tokens: readonly { text: string }[], lines: readonly string[]): number[][] => {
  const out: number[][] = [];
  let k = 0;
  for (const line of lines) {
    const idx: number[] = [];
    for (const word of line.split(" ").filter((w) => w.length > 0)) {
      if (k >= tokens.length || tokens[k].text !== word) {
        throw new Error(
          `kinetic-words: fitted lines ${JSON.stringify(lines)} do not match the tokens ${JSON.stringify(tokens.map((t) => t.text))}.`,
        );
      }
      idx.push(k);
      k += 1;
    }
    out.push(idx);
  }
  if (k !== tokens.length) {
    throw new Error(`kinetic-words: fitted lines ${JSON.stringify(lines)} dropped tokens ${JSON.stringify(tokens.slice(k).map((t) => t.text))}.`);
  }
  return out;
};

export type Align = "start" | "center" | "end";
export type TokenRect = { left: number; top: number; width: number; height: number };
export type PlacedTokens = { rects: TokenRect[]; lineWidths: number[]; height: number; fits: boolean };

export const placeTokens = (
  lines: readonly (readonly number[])[],
  opts: {
    gap: number;
    lineBox: number;
    width: number;
    dir: LineDirection;
    align: Align;
    flows?: readonly (readonly TokenFlow[])[];
  },
): PlacedTokens => {
  const gap = Math.max(0, Math.round(opts.gap));
  const lineBox = Math.max(1, Math.round(opts.lineBox));
  const width = Math.round(opts.width);
  const fromRight = opts.dir === "rtl";
  const foreign: TokenFlow = fromRight ? "ltr" : "rtl";
  const rects: TokenRect[] = [];
  const lineWidths: number[] = [];
  lines.forEach((raw, li) => {
    const widths = raw.map((w) => Math.max(0, Math.ceil(w)));
    const lw = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1);
    lineWidths.push(lw);
    const slack = width - lw;
    const leftEdge = opts.align === "center" ? Math.round(slack / 2) : (opts.align === "start") === fromRight ? slack : 0;
    const flows = opts.flows?.[li] ?? [];
    const units: { idx: number[]; foreign: boolean }[] = [];
    widths.forEach((_, i) => {
      const flow = flows[i] ?? "neutral";
      const last = units[units.length - 1];
      if (last !== undefined && last.foreign && (flow === foreign || flow === "neutral")) last.idx.push(i);
      else units.push({ idx: [i], foreign: flow === foreign });
    });
    const top = li * lineBox;
    const lineRects: TokenRect[] = new Array<TokenRect>(widths.length);
    let cursor = fromRight ? leftEdge + lw : leftEdge;
    for (const unit of units) {
      const uw = unit.idx.reduce((a, i) => a + widths[i], 0) + gap * (unit.idx.length - 1);
      const uLeft = fromRight ? cursor - uw : cursor;
      cursor = fromRight ? uLeft - gap : uLeft + uw + gap;
      const innerFromRight = unit.foreign ? !fromRight : fromRight;
      let x = innerFromRight ? uLeft + uw : uLeft;
      for (const i of unit.idx) {
        if (innerFromRight) {
          x -= widths[i];
          lineRects[i] = { left: x, top, width: widths[i], height: lineBox };
          x -= gap;
        } else {
          lineRects[i] = { left: x, top, width: widths[i], height: lineBox };
          x += widths[i] + gap;
        }
      }
    }
    rects.push(...lineRects);
  });
  return { rects, lineWidths, height: lines.length * lineBox, fits: lineWidths.every((lw) => lw <= width) };
};

export const MARK_KINDS = ["underline", "circle", "band", "strike", "arrow"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export type MarkRect = { x: number; y: number; width: number; height: number };
export type MarkPoint = { x: number; y: number };
export type Wobble = readonly [number, number, number];
export type MarkGeometry = {
  d: string;
  start: MarkPoint;
  end: MarkPoint;

  box: { left: number; top: number; width: number; height: number };
};

const unitClamp = (n: number): number => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);
const P = (x: number, y: number): MarkPoint => ({ x: Math.round(x) + 0, y: Math.round(y) + 0 });
const xy = (p: MarkPoint): string => `${p.x} ${p.y}`;

export const markGeometry = (
  kind: MarkKind,
  target: MarkRect,
  dir: LineDirection,
  opts: { strokeWidth: number; wobble?: Wobble },
): MarkGeometry => {
  if (!(MARK_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kinetic-words: unknown mark kind ${JSON.stringify(kind)}; use one of ${MARK_KINDS.join(", ")}.`);
  }
  const { x, y, width: w, height: h } = target;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    throw new Error(`kinetic-words: mark target must be a finite rect with positive size, got ${JSON.stringify(target)}.`);
  }
  if (!Number.isFinite(opts.strokeWidth) || opts.strokeWidth <= 0) {
    throw new Error(`kinetic-words: mark strokeWidth must be positive, got ${opts.strokeWidth}.`);
  }
  const [a, b, c] = (opts.wobble ?? [0, 0, 0]).map(unitClamp);
  const rtl = dir === "rtl";
  const s = rtl ? -1 : 1;
  const x0 = rtl ? x + w : x;
  const x1 = rtl ? x : x + w;
  const pts: MarkPoint[] = [];
  let d: string;
  let start: MarkPoint;
  let end: MarkPoint;
  switch (kind) {
    case "underline": {
      const ext = w * 0.04;
      const yb = y + h;
      start = P(x0 - s * ext, yb);
      const ctrl = P(x + w / 2 + s * w * 0.06 * c, yb + 2 * h * (0.06 + 0.03 * a));
      end = P(x1 + s * ext, yb - h * (0.04 + 0.03 * b));
      pts.push(start, ctrl, end);
      d = `M ${xy(start)} Q ${xy(ctrl)} ${xy(end)}`;
      break;
    }
    case "strike": {
      const ext = w * 0.03;
      const ym = y + h * 0.6;
      start = P(x0 - s * ext, ym + h * 0.04 * a);
      end = P(x1 + s * ext, ym - h * (0.06 + 0.03 * b));
      pts.push(start, end);
      d = `M ${xy(start)} L ${xy(end)}`;
      break;
    }
    case "band": {
      const pad = h * 0.12;
      const ym = y + h * 0.56;
      start = P(x0 - s * pad, ym + h * 0.03 * a);
      end = P(x1 + s * pad, ym + h * 0.03 * b);
      pts.push(start, end);
      d = `M ${xy(start)} L ${xy(end)}`;
      break;
    }
    case "circle": {

      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2 + Math.max(12, h * 0.22);
      const ry = h / 2 + Math.max(10, h * 0.28);
      const grow = 0.05 + 0.03 * a;
      const theta0 = ((rtl ? -10 : 190) + 8 * c) * (Math.PI / 180);
      const sweep = (385 + 10 * b) * (Math.PI / 180) * (rtl ? -1 : 1);
      const N = 8;
      const alpha = (4 / 3) * Math.tan(sweep / N / 4);
      const at = (t: number) => {
        const th = theta0 + sweep * t;
        const k = 1 + grow * t;
        return { X: cx + rx * k * Math.cos(th), Y: cy + ry * k * Math.sin(th), dX: -rx * k * Math.sin(th), dY: ry * k * Math.cos(th) };
      };
      let prev = at(0);
      start = P(prev.X, prev.Y);
      end = start;
      pts.push(start);
      d = `M ${xy(start)}`;
      for (let i = 1; i <= N; i++) {
        const q = at(i / N);
        const c1 = P(prev.X + alpha * prev.dX, prev.Y + alpha * prev.dY);
        const c2 = P(q.X - alpha * q.dX, q.Y - alpha * q.dY);
        end = P(q.X, q.Y);
        pts.push(c1, c2, end);
        d += ` C ${xy(c1)} ${xy(c2)} ${xy(end)}`;
        prev = q;
      }
      break;
    }
    case "arrow": {

      const len = Math.min(220, Math.max(48, h * 1.2));
      const tip = P(x + w * (rtl ? 0.62 : 0.38), y + h * 1.12);
      start = P(tip.x - s * len * 0.85, tip.y + len * 0.7);
      const ctrl = P(tip.x + s * len * 0.1 * a, start.y);
      const vx = tip.x - ctrl.x;
      const vy = tip.y - ctrl.y;
      const vl = Math.hypot(vx, vy) || 1;
      const ux = -vx / vl;
      const uy = -vy / vl;
      const bl = Math.max(14, len * 0.22);
      const phi = (28 * Math.PI) / 180;
      const barb = (sign: number): MarkPoint =>
        P(
          tip.x + bl * (ux * Math.cos(sign * phi) - uy * Math.sin(sign * phi)),
          tip.y + bl * (ux * Math.sin(sign * phi) + uy * Math.cos(sign * phi)),
        );
      const b1 = barb(1);
      const b2 = barb(-1);
      end = tip;
      pts.push(start, ctrl, tip, b1, b2);
      d = `M ${xy(start)} Q ${xy(ctrl)} ${xy(tip)} M ${xy(b1)} L ${xy(tip)} L ${xy(b2)}`;
      break;
    }
    default:
      throw new Error(`kinetic-words: unknown mark kind ${JSON.stringify(kind)}.`);
  }
  const half = Math.ceil(opts.strokeWidth / 2);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const left = Math.min(...xs) - half;
  const top = Math.min(...ys) - half;
  return { d, start, end, box: { left, top, width: Math.max(...xs) + half - left, height: Math.max(...ys) + half - top } };
};

export const drawProgress = (frame: number, at: number, dur: number): number =>
  frame < at ? 0 : EASE.land((frame - at + 1) / Math.max(1, Math.round(dur)));

export const TYPE_UNITS = ["auto", "char", "word", "sweep"] as const;
export type TypeUnit = (typeof TYPE_UNITS)[number];
export type ResolvedTypeUnit = Exclude<TypeUnit, "auto">;

export const TYPE_RATE = 24;

export const resolveTypeUnit = (unit: TypeUnit, arabic: boolean): ResolvedTypeUnit => {
  if (!(TYPE_UNITS as readonly string[]).includes(unit)) {
    throw new Error(`kinetic-words <TypeOn>: unknown unit ${JSON.stringify(unit)}; use auto, char, word or sweep.`);
  }
  if (unit === "auto") return arabic ? "sweep" : "char";
  if (unit === "char" && arabic) {
    throw new Error(`kinetic-words <TypeOn>: unit "char" would split Arabic words into letters and break the cursive joins; use "auto", "sweep" or "word".`);
  }
  return unit;
};

export const typeOnDuration = (text: string, fps: number, rate: number = TYPE_RATE): number => {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`kinetic-words <TypeOn>: rate must be a positive number of characters per second, got ${rate}.`);
  }
  return Math.max(1, toFrame(advanceCount(text) / rate, fps));
};

export type TypeOnState = { progress: number; shown: string; hidden: string; done: boolean };

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

export const typeOnState = (text: string, unit: ResolvedTypeUnit, frame: number, at: number, durF: number): TypeOnState => {
  const progress = frame < at ? 0 : clamp01((frame - at + 1) / Math.max(1, Math.round(durF)));
  if (unit === "sweep") return { progress, shown: text, hidden: "", done: progress >= 1 };
  if (unit === "char") {
    if (ARABIC_LETTER.test(text)) {
      throw new Error(`kinetic-words <TypeOn>: «${text}» contains Arabic; per-character typing would split its words. Use "sweep" or "word".`);
    }
    const g = Array.from(GRAPHEMES.segment(text), (seg) => seg.segment);
    const n = Math.min(g.length, Math.floor(progress * g.length + 1e-9));
    return { progress, shown: g.slice(0, n).join(""), hidden: g.slice(n).join(""), done: n >= g.length };
  }
  const parts = text.split(/(\s+)/);
  const wordCount = parts.filter((q, i) => i % 2 === 0 && q.length > 0).length;
  const k = Math.min(wordCount, Math.floor(progress * wordCount + 1e-9));
  let cut = 0;
  let seen = 0;
  for (let i = 0; i < parts.length && seen < k; i++) {
    if (i % 2 === 0 && parts[i].length > 0) {
      seen += 1;
      if (seen === k) cut = i + 1;
    }
  }
  return { progress, shown: parts.slice(0, cut).join(""), hidden: parts.slice(cut).join(""), done: k >= wordCount };
};
