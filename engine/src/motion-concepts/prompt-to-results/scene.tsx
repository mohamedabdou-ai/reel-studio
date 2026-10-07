import React from "react";
import { px } from "../../core/motion";
import { formatNumber } from "../../core/numbers";
import { fitTextLayout } from "../../creative-kit/primitives";
import { caretMark, revealTotal, splitReveal } from "../../creative-kit/code-tokens.ts";
import {
  Bidi,
  ConceptStage,
  ConceptText,
  alpha,
  digitsFor,
  dirOf,
  numberFont,
  rectStyle,
  styleShape,
  surfaceShadow,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
  type Rect,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { MIN_FRAMES, layoutFor, stateAt, unitsShown, type PromptToResultsParams } from "./math.ts";
import type { PromptToResultsData } from "./schema.ts";


const SEND_ARROW = "M32 45 L32 20 M21 31 L32 20 L43 31";






const TypedPrompt: React.FC<{ text: string; rect: Rect; typed: number; focus: number; rtl: boolean }> = ({ text, rect, typed, focus, rtl }) => {
  const { theme } = useConcept();
  const colors = uiColors(theme);
  const fit = React.useMemo(
    () => fitTextLayout({ text, theme, width: rect.width, height: rect.height, size: 44, min: 28, lines: 3, role: "body" }),
    [text, theme, rect.width, rect.height],
  );
  if (!fit.fits || fit.height > rect.height) {
    throw new Error(`motion-concepts prompt-to-results: the prompt does not fit its ${rect.width}x${rect.height}px box: ${JSON.stringify(text)}. Shorten it.`);
  }
  const parts = splitReveal(fit.lines, unitsShown(typed, revealTotal(fit.lines, "type")), "type");
  return (
    <div style={rectStyle(rect)}>
      <div
        style={{
          ...fit.style,
          position: "absolute",
          left: rtl ? rect.width - fit.width : 0,
          top: px((rect.height - fit.height) / 2),
          width: fit.width,
          color: theme.text,
          direction: rtl ? "rtl" : "ltr",
          unicodeBidi: "isolate",
          textAlign: rtl ? "right" : "left",
          ...(theme.grammar ? { fontSynthesis: "none" as const } : {}),
        }}
      >
        {parts.map((p, i) => (
          <div key={i} style={{ height: fit.lineBox, whiteSpace: "pre" }}>
            {p.shown}
            {p.caret && focus > 0.001 ? (
              <>
                {caretMark(p.shown)}
                {                                                                                     }
                <span style={{ display: "inline-block", position: "relative", width: 0, height: fit.lineBox, verticalAlign: "top" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: -2,
                      top: px(fit.lineBox * 0.14),
                      width: 4,
                      height: px(fit.lineBox * 0.72),
                      borderRadius: 2,
                      background: colors.accentInk,
                      opacity: focus,
                    }}
                  />
                </span>
                {caretMark(p.shown)}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const Scene: React.FC<{ data: PromptToResultsData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = dirOf(data.prompt) === "rtl";
  const params: PromptToResultsParams = { mode, box, rtl, pillK: shape.pillK, windowRadius: shape.windowRadius };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const W = L.window.width;
  const H = L.window.height;
  const digits = digitsFor(data.prompt);
  const numFont = numberFont(theme, digits);
  const line = theme.dim;
  const T = L.trunk;

  return (
    <div style={{ position: "absolute", left: L.window.x, top: L.window.y, width: W, height: H }}>
      {                                                                                              }
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {S.trunk.drawn > 0.001 ? (
          <path d={`M${T.x} ${T.y0} L${T.x} ${T.y1}`} fill="none" stroke={line} strokeWidth={3} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - S.trunk.drawn} />
        ) : null}
        {T.nodes.map((y, i) => {
          const stub = S.trunk.stubs[i];
          if (stub <= 0.001) return null;
          return (
            <g key={i}>
              <path d={`M${T.x} ${y} L${T.stubX} ${y}`} fill="none" stroke={line} strokeWidth={3} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - stub} />
              <circle cx={T.x} cy={y} r={9} fill={theme.card} stroke={line} strokeWidth={3} opacity={Math.min(1, stub * 3)} />
            </g>
          );
        })}
      </svg>

      {                                                        }
      <div
        style={{
          ...rectStyle(L.field),
          background: theme.card,
          borderRadius: L.fieldRadius,
          boxShadow: surfaceShadow(theme, tint(theme.border, colors.accentInk, S.focus)),
        }}
      >
        <TypedPrompt text={data.prompt} rect={L.input} typed={S.typed} focus={S.focus} rtl={rtl} />
        <div
          style={{
            ...rectStyle(L.send),
            boxSizing: "border-box",
            border: `2px solid ${theme.border}`,
            borderRadius: L.sendRadius,
            background: tint(alpha(theme.border, 0.2), colors.accentFill, S.armed),
            transform: `scale(${1 - 0.14 * S.press})`,
          }}
        >
          <svg width={L.send.width - 4} height={L.send.height - 4} viewBox="0 0 64 64" style={{ display: "block" }}>
            <path d={SEND_ARROW} fill="none" stroke={tint(theme.dim, colors.onAccentFill, S.armed)} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {                                                                            }
      {data.results.map((r, i) => {
        const c = S.cards[i];
        const C = L.cards[i];
        return (
          <div
            key={i}
            style={{
              ...rectStyle(C.card),
              background: theme.card,
              borderRadius: L.cardRadius,
              boxShadow: surfaceShadow(theme, theme.border),
              opacity: c.presence,
              visibility: c.presence > 0.001 ? "visible" : "hidden",
              transform: `translateY(${px(c.dy)}px) scale(${c.scale})`,
            }}
          >
            <div
              style={{
                ...rectStyle(C.chip),
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `2px solid ${theme.border}`,
                borderRadius: L.chipRadius,
                background: colors.accentFill,
                color: colors.onAccentFill,
                fontFamily: numFont,
                fontWeight: 700,
                fontSize: 36,
                fontVariantNumeric: "tabular-nums",
                transform: `scale(${c.chip})`,
              }}
            >
              <Bidi dir={digits === "latin" ? "ltr" : "rtl"}>{formatNumber(i + 1, { digits })}</Bidi>
            </div>
            <div style={{ ...rectStyle(C.title), display: "flex", alignItems: "center" }}>
              <ConceptText text={r.title} theme={theme} role="title" width={C.title.width} height={C.title.height} size={40} min={26} lines={1} align={rtl ? "right" : "left"} />
            </div>
            <div style={{ ...rectStyle(C.detail), display: "flex", alignItems: "flex-start", opacity: c.detail }}>
              <ConceptText
                text={r.detail}
                theme={theme}
                role="body"
                width={C.detail.width}
                height={C.detail.height}
                size={30}
                min={22}
                lines={2}
                color={theme.dim}
                align={rtl ? "right" : "left"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};


export const PromptToResults: React.FC<ConceptSceneProps<PromptToResultsData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
