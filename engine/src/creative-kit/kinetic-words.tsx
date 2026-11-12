// SPDX-License-Identifier: Apache-2.0
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { assertFontsReady, FAMILY } from "../core/fonts";
import { clamp01, px, toFrame, useClock, useEnterF } from "../core/motion";
import { useProbe } from "../core/safe";
import {
  fitOnLines,
  fitToWidth,
  fitsSafeZone,
  isArabic,
  measure,
  type Box,
  type MeasuredStyle,
  type SafeTarget,
  type TypeStyle,
} from "../core/type";
import { stretchWord } from "../arabic/kashida.ts";
import { Mark, markWobble } from "./emphasis";
import {
  ENTERED,
  TYPE_RATE,
  assignLines,
  directionFor,
  enterPose,
  markGeometry,
  placeTokens,
  reservedText,
  resolveEmphasis,
  resolveTypeUnit,
  stretchAmount,
  stretchCount,
  stretchRoom,
  stretchWidths,
  tokenColor,
  tokenEnter,
  tokenFlow,
  tokenTypeStyle,
  tokenizeSpoken,
  typeOnDuration,
  typeOnState,
  type Align,
  type EmphasisKind,
  type EmphasisSpec,
  type LineDirection,
  type SpokenWord,
  type TokenEnter,
  type TokenFlow,
  type TokenRect,
  type TranscriptLanguage,
  type TypeUnit,
  type WordToken,
} from "./kinetic-words-logic.ts";

export type SpokenFont = { fontFamily: string; fontSize: number; fontWeight?: number };
export type TextBox = { left: number; top: number; width: number };

export type SpokenLineProps = {
  words: readonly SpokenWord[];
  lang: TranscriptLanguage;
  font: SpokenFont;
  box: TextBox;
  color: string;
  accent: string;
  markColor?: string;
  enter?: TokenEnter;
  emphasis?: readonly EmphasisSpec[];
  maxLines?: number;
  minSize?: number;
  lineHeight?: number;
  align?: Align;
  latinFamily?: string;
  heavyWeight?: number;
  origin?: number;
  leadFrames?: number;
  untilFrame?: number;
  joinContinuations?: boolean | "auto";
  target?: SafeTarget;
  onOverflow?: "throw" | "render";
};

const NO_EMPHASIS: readonly EmphasisSpec[] = [];
export const SPOKEN_EXIT_FRAMES = 3;
export const UNDERLINE_DELAY = 2;
export const UNDERLINE_DUR = 8;

type SpokenLayout = {
  fontSize: number;
  lineBox: number;
  /** Where the words sit when every stretching word is at its widest: the worst case the safe-zone probe and the overflow check see. */
  rects: TokenRect[];
  styles: MeasuredStyle[];
  height: number;
  stroke: number;
  /** The line breaks, fixed for the whole animation: they are decided with the longest form of every word. */
  lines: number[][];
  flows: TokenFlow[][];
  place: { gap: number; lineBox: number; width: number; dir: LineDirection; align: Align };
  /** Each word's measured width (the longest form, for a stretching word). */
  widths: number[];
  /** A stretching word's measured width at 0 ... STRETCH_PEAK tatweels, so its room can follow its real width. Null for any other word. */
  forms: (readonly number[] | null)[];
};

const underlineSeed = (t: WordToken): string => `underline:${t.sourceIndex}:${t.part}`;
const markTarget = (r: TokenRect) => ({ x: r.left, y: r.top, width: r.width, height: r.height });

/** Where the words sit at `frame`: a stretching word takes the room of its current width, and the words around it follow. */
const roomsAt = (layout: SpokenLayout, tokens: readonly WordToken[], frame: number, fps: number): TokenRect[] =>
  placeTokens(
    layout.lines.map((row) =>
      row.map((i) => {
        const form = layout.forms[i];
        return form === null ? layout.widths[i] : stretchRoom(form, stretchAmount(frame, tokens[i].enterFrame, tokens[i].endFrame, fps));
      }),
    ),
    { ...layout.place, flows: layout.flows },
  ).rects;

/**
 * The stretched word as it is drawn: centred in its room and at most half a tatweel wider or narrower than it, because the word grows
 * in whole tatweels while its room grows smoothly. It stays inside the widest room it ever takes (or its own room, if that is wider).
 */
const drawnRect = (room: TokenRect, widest: TokenRect, drawn: number): TokenRect => {
  const width = Math.min(widest.width, Math.max(0, Math.ceil(drawn)));
  const least = Math.min(room.left, widest.left);
  const most = Math.max(room.left + room.width, widest.left + widest.width);
  const left = Math.round(room.left + (room.width - width) / 2);
  return { ...room, left: Math.max(least, Math.min(left, most - width)), width };
};

const layoutSpoken = (
  tokens: readonly WordToken[],
  kinds: readonly EmphasisKind[][],
  o: {
    base: { fontFamily: string; fontSize: number; fontWeight: number };
    width: number;
    maxLines: number;
    minSize: number;
    lineHeight: number;
    dir: LineDirection;
    align: Align;
    latinFamily: string;
    heavyWeight: number;
  },
): SpokenLayout => {
  // The line is fitted and wrapped with the longest form of every stretching word, so the breaks (and the type size) never change while
  // a word stretches. Where each word sits inside its line is decided per frame, from its current width (see roomsAt).
  const longest = tokens.map((t, i) => reservedText(t.text, kinds[i]));
  const text = longest.join(" ");
  let max = o.base.fontSize;
  for (;;) {
    const fitted = fitOnLines(text, o.base, {
      maxBoxWidth: o.width,
      maxLines: o.maxLines,
      min: o.minSize,
      max,
      lineHeight: o.lineHeight,
    });
    const size = fitted.fontSize;
    const lines = assignLines(longest.map((word) => ({ text: word })), fitted.lines);
    const styleOf = (i: number) => tokenTypeStyle(o.base, kinds[i], size, { latinFamily: o.latinFamily, heavyWeight: o.heavyWeight });
    const measured = tokens.map((_, i) => measure(longest[i], styleOf(i)));
    const gap = measure(" ", { ...o.base, fontSize: size }).width;
    const lineBox = px(size * o.lineHeight);
    const flows = lines.map((row) => row.map((i) => tokenFlow(tokens[i].text)));
    const place = { gap, lineBox, width: o.width, dir: o.dir, align: o.align };
    const placed = placeTokens(
      lines.map((row) => row.map((i) => measured[i].width)),
      { ...place, flows },
    );
    if (fitted.fits && placed.fits) {
      return {
        fontSize: size,
        lineBox,
        rects: placed.rects,
        styles: measured.map((m) => m.style),
        height: placed.height,
        stroke: Math.max(4, px(size * 0.08)),
        lines,
        flows,
        place,
        widths: measured.map((m) => m.width),
        forms: tokens.map((t, i) => {
          if (!kinds[i].includes("stretch")) return null;
          const widths = stretchWidths(t.text, (form) => measure(form, styleOf(i)).width);
          // A word with no legal slot never grows: there is no room to follow.
          return widths[widths.length - 1] > widths[0] ? widths : null;
        }),
      };
    }
    if (size <= o.minSize) {
      throw new Error(
        `creative-kit <SpokenLine>: ${JSON.stringify(text)} does not fit ${o.maxLines} line(s) x ${o.width}px even at ${size}px. ` +
          `Shorten the clause or widen the box.`,
      );
    }
    max = size - 1;
  }
};

const SpokenToken: React.FC<{
  text: string;
  rect: TokenRect;
  measured: MeasuredStyle;
  dir: LineDirection;
  color: string;
  enterFrame: number;
  enter: TokenEnter;
  preset: "snap" | "pop";
  probe: boolean;
}> = ({ text, rect, measured, dir, color, enterFrame, enter, preset, probe }) => {
  const { frame } = useClock();

  const sprung = useEnterF(enter === "pop" ? enterFrame : frame, preset);
  const pose = probe ? ENTERED : enterPose(enter, frame - enterFrame, sprung);
  if (pose.opacity <= 0) return null;
  return (
    <span
      style={{
        ...measured,
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        lineHeight: `${rect.height}px`,
        direction: dir,
        textAlign: "center",
        color,
        opacity: pose.opacity,
        transform: `translateY(${px(pose.rise * rect.height)}px) scale(${pose.scale})`,
        transformOrigin: "50% 60%",
      }}
    >
      {text}
    </span>
  );
};

export const SpokenLine: React.FC<SpokenLineProps> = ({
  words,
  lang,
  font,
  box,
  color,
  accent,
  markColor,
  enter = "rise",
  emphasis = NO_EMPHASIS,
  maxLines = 2,
  minSize = 28,
  lineHeight = 1.3,
  align = "center",
  latinFamily = FAMILY.plexDisplay,
  heavyWeight = 1000,
  origin = 0,
  leadFrames = 0,
  untilFrame,
  joinContinuations = "auto",
  target = "organic",
  onOverflow = "throw",
}) => {
  const { frame, fps } = useClock();
  const probe = useProbe();
  const dir = directionFor(lang);
  const { fontFamily, fontSize, fontWeight = 800 } = font;
  const tokens = React.useMemo(
    () => tokenizeSpoken(words, { origin, leadFrames, joinContinuations }),
    [words, origin, leadFrames, joinContinuations],
  );
  const kinds = React.useMemo(() => resolveEmphasis(tokens, emphasis), [tokens, emphasis]);
  const layout = React.useMemo(() => {
    assertFontsReady();
    return layoutSpoken(tokens, kinds, {
      base: { fontFamily, fontSize: Math.round(fontSize), fontWeight },
      width: box.width,
      maxLines,
      minSize,
      lineHeight,
      dir,
      align,
      latinFamily,
      heavyWeight,
    });
  }, [tokens, kinds, fontFamily, fontSize, fontWeight, box.width, maxLines, minSize, lineHeight, dir, align, latinFamily, heavyWeight]);
  const painted = React.useMemo((): Box => {
    const boxes = layout.rects.map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }));
    tokens.forEach((t, i) => {
      if (kinds[i].includes("underline")) {
        boxes.push(
          markGeometry("underline", markTarget(layout.rects[i]), dir, { strokeWidth: layout.stroke, wobble: markWobble(underlineSeed(t)) }).box,
        );
      }
    });
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.left + b.width));
    const bottom = Math.max(...boxes.map((b) => b.top + b.height));
    return { left: px(box.left) + left, top: px(box.top) + top, width: right - left, height: bottom - top };
  }, [layout, tokens, kinds, dir, box.left, box.top]);
  const safe = fitsSafeZone(painted, target);
  if (!safe.ok && onOverflow === "throw") {
    throw new Error(
      `creative-kit <SpokenLine>: ${JSON.stringify(tokens.map((t) => t.text).join(" "))} paints ${painted.width}x${painted.height} ` +
        `at (${painted.left},${painted.top}), outside ${safe.profile} [${safe.hits.join(",")}]. Move or narrow the box; do not render it.`,
    );
  }
  if (untilFrame !== undefined && frame >= untilFrame) return null;
  const fade = probe || untilFrame === undefined ? 1 : clamp01((untilFrame - frame) / SPOKEN_EXIT_FRAMES);
  const ink = markColor ?? accent;
  // A stretching word takes the room of its current width and the words around it follow, so there is never a loose gap at rest.
  // The probe sees the widest room, as the overflow check above does. A line with no stretching word is laid out once.
  const rooms =
    probe === null && layout.forms.some((form) => form !== null) ? roomsAt(layout, tokens, frame, fps) : layout.rects;
  return (
    <div style={{ position: "absolute", left: px(box.left), top: px(box.top), width: px(box.width), height: layout.height, opacity: fade }}>
      {tokens.map((t, i) => {
        const { enter: tokenIn, preset } = tokenEnter(enter, kinds[i]);
        const form = layout.forms[i];
        let text = t.text;
        let rect = rooms[i];
        if (form !== null) {
          if (probe !== null) text = reservedText(t.text, kinds[i]);
          else {
            const count = stretchCount(frame, t.enterFrame, t.endFrame, fps);
            text = stretchWord(t.text, count);
            rect = drawnRect(rooms[i], layout.rects[i], form[count]);
          }
        }
        return (
          <SpokenToken
            key={`t:${t.sourceIndex}:${t.part}`}
            text={text}
            rect={rect}
            measured={layout.styles[i]}
            dir={dir}
            color={tokenColor(kinds[i], { color, accent })}
            enterFrame={t.enterFrame}
            enter={tokenIn}
            preset={preset}
            probe={probe !== null}
          />
        );
      })}
      {tokens.map((t, i) =>
        kinds[i].includes("underline") ? (
          <Mark
            key={`u:${t.sourceIndex}:${t.part}`}
            kind="underline"
            dir={dir}
            target={markTarget(rooms[i])}
            at={t.enterFrame + UNDERLINE_DELAY}
            dur={UNDERLINE_DUR}
            color={ink}
            strokeWidth={layout.stroke}
            seed={underlineSeed(t)}
          />
        ) : null,
      )}
    </div>
  );
};

export type TypeOnProps = {
  text: string;
  at: number;
  font: SpokenFont;
  box: TextBox;
  color: string;
  unit?: TypeUnit;
  rate?: number;
  durFrames?: number;
  minSize?: number;
  align?: Align;
  dir?: LineDirection;
  caret?: string | false;
};

export const TypeOn: React.FC<TypeOnProps> = ({
  text,
  at,
  font,
  box,
  color,
  unit = "auto",
  rate = TYPE_RATE,
  durFrames,
  minSize = 24,
  align = "start",
  dir,
  caret = false,
}) => {
  const { frame, fps } = useClock();
  const probe = useProbe();
  const arabic = isArabic(text);
  const mode = resolveTypeUnit(unit, arabic);
  const direction: LineDirection = dir ?? (arabic ? "rtl" : "ltr");
  const { fontFamily, fontSize, fontWeight = 700 } = font;
  const fit = React.useMemo(() => {
    assertFontsReady();
    const fitted = fitToWidth(text, { fontFamily, fontSize, fontWeight }, box.width, { min: minSize });
    if (!fitted.fits) {
      throw new Error(
        `creative-kit <TypeOn>: ${JSON.stringify(text)} does not fit ${box.width}px on one line even at ${fitted.fontSize}px. Shorten it or widen the box.`,
      );
    }
    return fitted;
  }, [text, fontFamily, fontSize, fontWeight, box.width, minSize]);
  if (!probe && frame < at) return null;
  const run = placeTokens([[fit.width]], { gap: 0, lineBox: fit.lineBox, width: box.width, dir: direction, align }).rects[0];
  const durF = durFrames ?? typeOnDuration(text, fps, rate);
  const state = typeOnState(text, mode, probe ? at + durF : frame, at, durF);
  const hidden = mode === "sweep" ? px(run.width * (1 - state.progress)) : 0;
  const clip =
    mode !== "sweep" || state.done
      ? undefined
      : direction === "rtl"
        ? `inset(0px 0px 0px ${hidden}px)`
        : `inset(0px ${hidden}px 0px 0px)`;
  const fitted: TypeStyle = { fontFamily, fontSize: fit.fontSize, fontWeight };
  const blinkF = Math.max(1, toFrame(0.5, fps));
  const caretColor = caret === false || probe ? null : caret;
  const caretOn = caretColor !== null && (!state.done || Math.floor((frame - at) / blinkF) % 2 === 0);
  let caretLeft = 0;
  const caretW = Math.max(3, px(fit.fontSize * 0.06));
  if (caretOn) {
    const shownWidth =
      mode === "sweep" ? run.width - hidden : state.shown === "" ? 0 : Math.ceil(measure(state.shown, fitted).width);
    const edge = direction === "rtl" ? run.left + run.width - shownWidth : run.left + shownWidth;
    caretLeft = direction === "rtl" ? edge - caretW - 2 : edge + 2;
  }
  return (
    <div style={{ position: "absolute", left: px(box.left), top: px(box.top), width: px(box.width), height: fit.lineBox }}>
      <div
        style={{
          ...fit.style,
          position: "absolute",
          left: run.left,
          top: 0,
          width: run.width,
          direction,
          textAlign: direction === "rtl" ? "right" : "left",
          color,
          clipPath: clip,
        }}
      >
        {mode === "sweep" ? (
          text
        ) : (
          <>
            {state.shown}
            <span style={{ opacity: 0 }}>{state.hidden}</span>
          </>
        )}
      </div>
      {caretOn ? (
        <div
          style={{
            position: "absolute",
            left: caretLeft,
            top: px(fit.lineBox * 0.15),
            width: caretW,
            height: px(fit.lineBox * 0.7),
            background: caretColor ?? undefined,
          }}
        />
      ) : null}
    </div>
  );
};
