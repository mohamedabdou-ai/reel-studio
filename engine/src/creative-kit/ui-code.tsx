// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { EASE, clamp01, mix, px, useClock, useEnterF } from "../core/motion";
import { assertFontsReady } from "../core/fonts";
import { useProbe } from "../core/safe";
import { fitToWidth, measure, type MeasuredStyle, type TypeStyle } from "../core/type";
import type { SceneTheme } from "./primitives";
import {
  CODE_LAYOUT,
  UI_TIMING,
  assertFrame,
  caretMark,
  caretOn,
  codeBlockHeight,
  framesFor,
  revealCount,
  revealTotal,
  sliceTokens,
  splitCodeLines,
  splitReveal,
  tokenizeCode,
  type CodeLang,
  type TokenKind,
} from "./code-tokens.ts";
import { TypingCaret } from "./ui-chat";

export const CODE_COLORS = {
  background: "#0F141A",
  header: "#171D25",
  border: "#2B3440",
  gutter: "#5C6773",
  title: "#AAB4BF",
  caret: "#E6EDF3",
  traffic: ["#FF5F57", "#FEBC2E", "#28C840"],
  kinds: {
    keyword: "#FF7B72",
    string: "#A5D6FF",
    number: "#79C0FF",
    comment: "#8B949E",
    fn: "#D2A8FF",
    punct: "#C9D1D9",
    plain: "#E6EDF3",
  } satisfies Record<TokenKind, string>,
} as const;

const LANG_LABEL: Record<CodeLang, string> = { bash: "BASH", js: "JS", ts: "TS", python: "PY", json: "JSON" };
const TITLE_SIZE = 22;
const HIGHLIGHT_F = 6;

export type CodeBlockProps = {
  theme: SceneTheme;
  lang: CodeLang;

  code: string;

  title: string;

  width: number;

  chrome?: "terminal" | "editor";

  typeFrom?: number;

  typeF?: number;

  highlightLines?: readonly number[];

  highlightAt?: number;

  enterAt?: number;

  fontSize?: number;
  style?: React.CSSProperties;
};

export const CodeBlock: React.FC<CodeBlockProps> = ({
  theme,
  lang,
  code,
  title,
  width,
  chrome = lang === "bash" ? "terminal" : "editor",
  typeFrom,
  typeF,
  highlightLines = [],
  highlightAt,
  enterAt = 0,
  fontSize = 30,
  style,
}) => {
  const { frame, fps } = useClock();
  const probe = useProbe();
  const enter = useEnterF(enterAt, "card");
  const layout = React.useMemo(() => {
    assertFontsReady();
    const lines = splitCodeLines(code);
    if (!lines.some((line) => /\S/.test(line))) throw new Error("ui-code: CodeBlock code is blank");
    if (lines.length > CODE_LAYOUT.maxLines) {
      throw new Error(`ui-code: ${lines.length} lines is more than a reel can read (max ${CODE_LAYOUT.maxLines}) — show the part he talks about`);
    }
    const base: TypeStyle = { fontFamily: theme.mono, fontSize, fontWeight: 400 };
    const gutter = chrome === "editor" ? Math.ceil(measure(String(lines.length), base).width) + CODE_LAYOUT.gutterGap : 0;
    const avail = width - 2 * CODE_LAYOUT.padX - gutter;
    let size = fontSize;
    lines.forEach((line, i) => {
      if (!/\S/.test(line)) return;
      const fit = fitToWidth(line, base, avail, { min: CODE_LAYOUT.minFont, max: fontSize });
      if (!fit.fits) {
        throw new Error(
          `ui-code: line ${i + 1} (${line.length} chars) does not fit ${avail}px even at ${CODE_LAYOUT.minFont}px — break the line or widen the block`,
        );
      }
      size = Math.min(size, fit.fontSize);
    });
    const lineBox = Math.round(size * CODE_LAYOUT.lineHeight);
    const run: MeasuredStyle = { ...measure("M", { ...base, fontSize: size }).style, lineHeight: `${lineBox}px` };
    const titleRun = measure(title, { fontFamily: theme.mono, fontSize: TITLE_SIZE, fontWeight: 400 });
    if (titleRun.width > width - 240) throw new Error(`ui-code: title ${JSON.stringify(title)} is wider than the chrome allows`);
    return { lines, tokens: tokenizeCode(code, lang), lineBox, run, gutter, titleRun, height: codeBlockHeight(lines.length, size) };
  }, [code, lang, theme.mono, fontSize, width, chrome, title]);
  const { lines, tokens, lineBox, run, gutter, titleRun, height } = layout;
  if (typeFrom !== undefined) assertFrame("CodeBlock typeFrom", typeFrom);
  if (typeF !== undefined && (!Number.isInteger(typeF) || typeF < 1)) throw new Error("ui-code: typeF must be a whole number of frames >= 1");
  if (highlightAt !== undefined) assertFrame("CodeBlock highlightAt", highlightAt);
  assertFrame("CodeBlock enterAt", enterAt);
  for (const n of highlightLines) {
    if (!Number.isInteger(n) || n < 1 || n > lines.length) throw new Error(`ui-code: highlight line ${n} is not a line of this ${lines.length}-line block`);
  }

  const total = revealTotal(lines, "type");
  const durF = typeF ?? Math.max(1, Math.round((total * fps) / UI_TIMING.codeRate));
  const typed = typeFrom === undefined || probe !== null ? total : revealCount(frame, typeFrom, durF, total);
  const parts = splitReveal(lines, typed, "type");
  const showCaret = probe === null && typeFrom !== undefined;
  const caretIsOn = typeFrom !== undefined && caretOn(frame, typeFrom, typeFrom + durF, framesFor(UI_TIMING.blinkSec, fps));
  const hAt = highlightAt ?? (typeFrom !== undefined ? typeFrom + durF : enterAt);
  const h = probe !== null ? 1 : frame < hAt ? 0 : EASE.land(clamp01((frame - hAt + 1) / HIGHLIGHT_F));
  const e = probe !== null ? 1 : enter;
  const bodyTop = CODE_LAYOUT.header + CODE_LAYOUT.padY;
  const titleTop = px((CODE_LAYOUT.header - titleRun.lineBox) / 2);
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 22,
          overflow: "hidden",
          background: CODE_COLORS.background,
          opacity: clamp01(e),
          transform: `translateY(${px((1 - e) * 20)}px) scale(${mix(0.97, 1, e)})`,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width, height: CODE_LAYOUT.header, background: CODE_COLORS.header }} />
        {chrome === "terminal" ? (
          <>
            {CODE_COLORS.traffic.map((color, i) => (
              <div
                key={color}
                style={{ position: "absolute", left: 26 + i * 24, top: 25, width: 14, height: 14, borderRadius: "50%", background: color }}
              />
            ))}
            <div style={{ ...titleRun.style, position: "absolute", left: 0, top: titleTop, width, textAlign: "center", color: CODE_COLORS.title }}>
              {title}
            </div>
          </>
        ) : (
          <>
            <div style={{ ...titleRun.style, position: "absolute", left: CODE_LAYOUT.padX, top: titleTop, color: CODE_COLORS.title }}>{title}</div>
            <div
              style={{
                position: "absolute",
                left: CODE_LAYOUT.padX,
                top: CODE_LAYOUT.header - 4,
                width: Math.ceil(titleRun.width),
                height: 4,
                background: theme.accent,
              }}
            />
            <div style={{ ...titleRun.style, position: "absolute", right: CODE_LAYOUT.padX, top: titleTop, color: CODE_COLORS.gutter }}>
              {LANG_LABEL[lang]}
            </div>
          </>
        )}
        {highlightLines.map((n) => (
          <div key={`hl-${n}`} style={{ position: "absolute", left: 0, top: bodyTop + (n - 1) * lineBox, width, height: lineBox, opacity: h }}>
            <div style={{ position: "absolute", inset: 0, background: theme.accent, opacity: 0.18 }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: 5, height: lineBox, background: theme.accent }} />
          </div>
        ))}
        {lines.map((_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, top: bodyTop + i * lineBox, width, height: lineBox }}>
            {chrome === "editor" ? (
              <div
                style={{
                  ...run,
                  position: "absolute",
                  left: CODE_LAYOUT.padX,
                  width: gutter - CODE_LAYOUT.gutterGap,
                  textAlign: "right",
                  color: CODE_COLORS.gutter,
                }}
              >
                {i + 1}
              </div>
            ) : null}
            <div style={{ ...run, position: "absolute", left: CODE_LAYOUT.padX + gutter, direction: "ltr" }}>
              {sliceTokens(tokens[i], parts[i].shown.length).map((t, k) => (
                <span key={k} style={{ color: CODE_COLORS.kinds[t.kind] }}>
                  {t.text}
                </span>
              ))}
              {showCaret && parts[i].caret ? (
                <>
                  {caretMark(parts[i].shown)}
                  <TypingCaret lineBox={lineBox} color={CODE_COLORS.caret} on={caretIsOn} />
                  {caretMark(parts[i].shown)}
                </>
              ) : null}
            </div>
          </div>
        ))}
        {                                                                                                 }
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, boxShadow: `inset 0 0 0 2px ${CODE_COLORS.border}` }} />
      </div>
    </div>
  );
};
