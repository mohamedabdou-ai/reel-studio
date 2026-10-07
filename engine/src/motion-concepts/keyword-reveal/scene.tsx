import React from "react";
import { mix, px } from "../../core/motion";
import { fitTextLayout, type SceneTheme } from "../../creative-kit/primitives";
import { ConceptStage, ConceptText, dirOf, rectStyle, tint, uiColors, useConcept, useConceptTimeline, type ConceptBox } from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import {
  KEYWORD_MAX_SIZE,
  KEYWORD_MIN_SIZE,
  MIN_FRAMES,
  arcPath,
  blockHeight,
  inkGuess,
  keywordMaxWidth,
  layoutFor,
  maxInkHeight,
  ringArc,
  ringPoint,
  stateAt,
  visualFor,
  wavePath,
  type KeywordMetrics,
  type KeywordRevealParams,
} from "./math.ts";
import type { KeywordRevealData } from "./schema.ts";

const WHITE = "rgb(255, 255, 255)";
const BLACK = "rgb(0, 0, 0)";

const BLEED = 48;

type Fitted = { fit: ReturnType<typeof fitTextLayout>; metrics: KeywordMetrics };


const measureInk = (lines: readonly string[], fontFamily: string, fontSize: number, fontWeight: number | string): { ascent: number; descent: number } | null => {
  if (typeof document === "undefined") return null;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;

  ctx.font = `${fontWeight} ${fontSize}px ${/[,'"]/.test(fontFamily) ? fontFamily : `"${fontFamily}"`}`;
  ctx.textBaseline = "alphabetic";
  let ascent = 0;
  let descent = 0;
  for (const line of lines) {
    ctx.direction = dirOf(line);
    const m = ctx.measureText(line);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent);
    descent = Math.max(descent, m.actualBoundingBoxDescent);
  }
  return { ascent: Math.ceil(ascent), descent: Math.ceil(descent) };
};


const sane = (ink: { ascent: number; descent: number } | null, fontSize: number): ink is { ascent: number; descent: number } =>
  ink !== null && ink.ascent >= 0.35 * fontSize && ink.ascent <= 1.3 * fontSize && ink.descent >= 0 && ink.descent <= 0.8 * fontSize;





const fitKeyword = (text: string, theme: SceneTheme, box: ConceptBox): Fitted => {
  const width = keywordMaxWidth(box);
  const budget = maxInkHeight(box);
  let size = KEYWORD_MAX_SIZE;
  for (let pass = 0; ; pass++) {

    const fit = fitTextLayout({ text, theme, width, height: 4000, size, min: KEYWORD_MIN_SIZE, lines: 2, role: "title" });
    if (!fit.fits) {
      throw new Error(`motion-concepts keyword-reveal: ${JSON.stringify(text)} does not fit the ${width}px column at ${KEYWORD_MIN_SIZE}px. Shorten the keyword.`);
    }
    const measured = measureInk(fit.lines, fit.style.fontFamily, fit.fontSize, fit.style.fontWeight);
    const ink = sane(measured, fit.fontSize) ? measured : inkGuess(text, fit.fontSize);
    const metrics: KeywordMetrics = { lines: fit.lines.length, fontSize: fit.fontSize, width: fit.width, ascent: ink.ascent, descent: ink.descent };
    const h = blockHeight(metrics);
    if (h <= budget || fit.fontSize <= KEYWORD_MIN_SIZE || pass >= 5) return { fit, metrics };
    size = Math.max(KEYWORD_MIN_SIZE, Math.min(fit.fontSize - 1, Math.floor((fit.fontSize * budget) / h)));
  }
};


const Glyphs: React.FC<{
  lines: readonly string[];
  x: number;
  ys: readonly number[];
  font: React.CSSProperties;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}> = ({ lines, x, ys, font, fill, stroke, strokeWidth }) => (
  <>
    {lines.map((line, i) => (
      <text
        key={i}
        x={x}
        y={ys[i]}
        textAnchor="middle"
        direction={dirOf(line)}
        style={font}
        fill={fill}
        stroke={stroke ?? "none"}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      >
        {line}
      </text>
    ))}
  </>
);

const Scene: React.FC<{ data: KeywordRevealData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const colors = uiColors(theme);
  const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, "");

  const { fit, metrics } = React.useMemo(() => fitKeyword(data.keyword, theme, box), [data.keyword, theme, box]);
  const params: KeywordRevealParams = { mode, box, metrics };
  const L = layoutFor(box, params.metrics);
  const S = stateAt(frame, duration, params);
  const V = React.useMemo(() => visualFor(data.keyword, L.visual.width, L.visual.height), [data.keyword, L.visual.width, L.visual.height]);



  const ground = colors.accentFill;
  const groundLow = tint(ground, colors.onAccentFill, 0.3);
  const line = colors.onAccentFill;


  const vw = L.visual.width;
  const vh = L.visual.height;
  const cx = L.cx - L.visual.x;
  const ys = L.baselines.map((y) => y - L.visual.y);
  const edge = S.edgeY - L.visual.y;
  const font: React.CSSProperties = {
    fontFamily: fit.style.fontFamily,
    fontSize: fit.fontSize,
    fontWeight: fit.style.fontWeight,
    letterSpacing: fit.style.letterSpacing,
    fontVariantNumeric: fit.style.fontVariantNumeric,
    fontStyle: "normal",
    ...(theme.grammar ? { fontSynthesis: "none" as const } : {}),
  };
  const glyphs = (extra: { fill: string; stroke?: string; strokeWidth?: number }) => <Glyphs lines={fit.lines} x={cx} ys={ys} font={font} {...extra} />;


  const ampScale = mix(1.5, 1, S.detail);
  const disorder = 1 - S.detail;
  const crisp = mix(0.55, 1, S.detail);
  const fx = V.focus.x;
  const fy = V.focus.y;
  const washH = Math.round(vh * 0.4);

  return (
    <>
      <svg
        width={vw}
        height={vh}
        viewBox={`0 0 ${vw} ${vh}`}
        style={{ position: "absolute", left: px(L.visual.x), top: px(L.visual.y), overflow: "visible" }}
      >
        <defs>
          {                                                                                        }
          <mask id={`${uid}-glyph`} maskUnits="userSpaceOnUse" x={-BLEED} y={-BLEED} width={vw + 2 * BLEED} height={vh + 2 * BLEED}>
            {glyphs({ fill: WHITE, stroke: WHITE, strokeWidth: 2 })}
          </mask>
          {                                                                                                              }
          <mask id={`${uid}-ring`} maskUnits="userSpaceOnUse" x={-BLEED} y={-BLEED} width={vw + 2 * BLEED} height={vh + 2 * BLEED}>
            {glyphs({ fill: WHITE, stroke: WHITE, strokeWidth: 2 * L.ring })}
            {glyphs({ fill: BLACK })}
          </mask>
          {                                                                         }
          <clipPath id={`${uid}-level`}>
            <rect x={-BLEED} y={edge} width={vw + 2 * BLEED} height={Math.max(0, vh + BLEED - edge)} />
          </clipPath>
          <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ground} />
            <stop offset="1" stopColor={groundLow} />
          </linearGradient>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0" stopColor={WHITE} stopOpacity={0.34} />
            <stop offset="1" stopColor={WHITE} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-wash`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={WHITE} stopOpacity={0.4} />
            <stop offset="1" stopColor={WHITE} stopOpacity={0} />
          </linearGradient>
        </defs>

        {                                                                                      }
        {S.level > 0 ? (
          <g mask={`url(#${uid}-glyph)`}>
            <g clipPath={`url(#${uid}-level)`}>
              <rect x={-BLEED} y={-BLEED} width={vw + 2 * BLEED} height={vh + 2 * BLEED} fill={`url(#${uid}-ground)`} />
              <g transform={`translate(${vw / 2} ${vh / 2}) scale(${S.zoom.toFixed(4)}) translate(${-vw / 2} ${-vh / 2})`}>
                <circle cx={fx} cy={fy} r={V.glow} fill={`url(#${uid}-glow)`} />
                {V.waves.map((wv, i) => (
                  <path
                    key={i}
                    d={wavePath(wv, vw, S.phase, ampScale, disorder)}
                    fill="none"
                    stroke={line}
                    strokeWidth={wv.w}
                    strokeOpacity={wv.a * crisp}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {V.rings.map((ring, j) => {
                  const arc = ringArc(ring, j, S.phase);
                  const node = ringPoint(fx, fy, ring.r, arc.end);
                  return (
                    <g key={j}>
                      <circle cx={fx} cy={fy} r={ring.r} fill="none" stroke={line} strokeWidth={ring.w} strokeOpacity={ring.a * crisp} strokeDasharray={`${ring.dash} ${ring.gap}`} />
                      <path d={arcPath(fx, fy, ring.r, arc.start, arc.end)} fill="none" stroke={line} strokeWidth={ring.arcW} strokeOpacity={0.9 * crisp} strokeLinecap="round" />
                      <circle cx={node.x} cy={node.y} r={ring.arcW + 2} fill={line} fillOpacity={crisp} />
                    </g>
                  );
                })}
                <circle cx={fx} cy={fy} r={16} fill="none" stroke={line} strokeWidth={2} strokeOpacity={0.7 * crisp} />
                <circle cx={fx} cy={fy} r={6} fill={line} fillOpacity={crisp} />
              </g>
              {                                                                                   }
              <rect x={-BLEED} y={edge} width={vw + 2 * BLEED} height={washH} fill={`url(#${uid}-wash)`} opacity={S.edge} />
              <rect x={-BLEED} y={edge} width={vw + 2 * BLEED} height={3} fill={line} opacity={0.9 * S.edge} />
            </g>
          </g>
        ) : null}

        {                                                                                          }
        <rect x={-BLEED} y={-BLEED} width={vw + 2 * BLEED} height={vh + 2 * BLEED} fill={theme.text} mask={`url(#${uid}-ring)`} />
      </svg>

      {                                                                                               }
      <div
        style={{
          ...rectStyle(L.sub),
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          opacity: S.sub.presence,
          transform: `translateY(${px(S.sub.dy)}px)`,
        }}
      >
        <ConceptText text={data.subheadline} theme={theme} role="body" width={L.sub.width} height={L.sub.height} size={46} min={28} lines={2} align="center" color={theme.text} />
      </div>
    </>
  );
};


export const KeywordReveal: React.FC<ConceptSceneProps<KeywordRevealData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
