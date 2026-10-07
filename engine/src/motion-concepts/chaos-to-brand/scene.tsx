import React from "react";
import { FAMILY, assertFontsReady } from "../../core/fonts";
import { px } from "../../core/motion";
import { FRAME } from "../../core/safe";
import type { SceneTheme } from "../../creative-kit/primitives";
import { ConceptStage, ConceptText, dirOf, rectStyle, styleShape, tint, uiColors, useConcept, useConceptTimeline, type Rect } from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { MIN_FRAMES, STROKE_PX, layoutFor, maskInk, maskShape, pathShape, stateAt, subpathsOf, type Mask, type MarkShape, type Subpath } from "./math.ts";
import { parseViewBox, type ChaosMark, type ChaosToBrandData, type ViewBox } from "./schema.ts";




const RASTER_PX = 220;
const RASTER_PAD = 24;

type TextRaster = {
  shape: MarkShape;

  ink: Rect;

  origin: { x: number; y: number };
  family: string;
  weight: number;
};

const RASTERS = new Map<string, TextRaster>();


const cssFamily = (family: string): string => (/[,'"]/.test(family) ? family : `"${family}"`);


const markFace = (text: string, theme: SceneTheme): { family: string; weight: number } => {
  const arabic = dirOf(text) === "rtl";
  const adapted = Boolean(theme.grammar);
  return { family: arabic ? theme.ar : theme.display, weight: adapted ? (arabic && theme.ar === FAMILY.cairo ? 900 : 700) : 800 };
};

const rasterize = (text: string, theme: SceneTheme): TextRaster => {
  assertFontsReady();
  const face = markFace(text, theme);
  const family = cssFamily(face.family);
  const weight = face.weight;
  const key = `${weight}|${family}|${text}`;
  const hit = RASTERS.get(key);
  if (hit) return hit;

  const font = `${weight} ${RASTER_PX}px ${family}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("chaos-to-brand: this browser has no 2D canvas, so the text mark cannot be sampled");
  const setup = (): void => {
    const before = ctx.font;
    ctx.font = font;
    if (ctx.font === before) throw new Error(`chaos-to-brand: the browser rejected the font ${JSON.stringify(font)}`);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.direction = "ltr";
  };
  setup();
  const m = ctx.measureText(text);
  const width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * RASTER_PAD;
  const height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * RASTER_PAD;
  canvas.width = width;
  canvas.height = height;
  setup();
  const origin = { x: RASTER_PAD + m.actualBoundingBoxLeft, y: RASTER_PAD + m.actualBoundingBoxAscent };
  ctx.fillStyle = "rgb(0, 0, 0)";
  ctx.fillText(text, origin.x, origin.y);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const mask: Mask = { width, height, alpha };
  const ink = maskInk(mask);
  if (!ink) throw new Error(`chaos-to-brand: the text mark ${JSON.stringify(text)} drew no pixels in ${family}`);
  const raster: TextRaster = { shape: maskShape(mask), ink, origin, family, weight };
  RASTERS.set(key, raster);
  return raster;
};

type Geometry =
  | { kind: "path"; d: string; filled: boolean; shape: MarkShape; parts: readonly Subpath[]; vb: ViewBox }
  | { kind: "text"; text: string; shape: MarkShape; raster: TextRaster };

const buildGeometry = (mark: ChaosMark, theme: SceneTheme): Geometry => {
  if (mark.kind === "text") {
    const raster = rasterize(mark.text, theme);
    return { kind: "text", text: mark.text, shape: raster.shape, raster };
  }
  const vb = parseViewBox(mark.viewBox);
  if (!vb) throw new Error(`chaos-to-brand: bad viewBox ${JSON.stringify(mark.viewBox)}`);
  return { kind: "path", d: mark.d, filled: mark.filled === true, shape: pathShape(mark.d, mark.viewBox), parts: subpathsOf(mark.d), vb };
};



const Scene: React.FC<{ data: ChaosToBrandData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const colors = uiColors(theme);
  const shape = styleShape(theme);
  const geo = React.useMemo(() => buildGeometry(data.mark, theme), [data.mark, theme]);
  const L = layoutFor(box, { aspect: geo.shape.aspect });
  const S = stateAt(frame, duration, { mode, box, shape: geo.shape });

  const ink = colors.accentInk;
  const chaos = theme.dim;
  const round = shape.pillK >= 0.5;

  return (
    <>
      <svg width={FRAME.width} height={FRAME.height} viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {                                                                       }
        {S.solid > 0.001 && geo.kind === "path" ? (
          <g transform={`translate(${L.mark.x} ${L.mark.y}) scale(${L.mark.width / geo.vb.width} ${L.mark.height / geo.vb.height}) translate(${-geo.vb.x} ${-geo.vb.y})`}>
            {geo.filled && S.mark.fill > 0.001 ? <path d={geo.d} fill={ink} fillOpacity={S.mark.fill} stroke="none" /> : null}
            {S.mark.draw > 0.001
              ? geo.parts.map((part, i) => (
                  <path
                    key={i}
                    d={part.d}
                    fill="none"
                    stroke={ink}
                    strokeWidth={(STROKE_PX * 2) / (L.mark.width / geo.vb.width + L.mark.height / geo.vb.height)}
                    strokeLinecap={round ? "round" : "butt"}
                    strokeLinejoin={round ? "round" : "miter"}
                    {...(S.mark.draw < 1 ? { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - S.mark.draw } : {})}
                  />
                ))
              : null}
          </g>
        ) : null}
        {

                                                                                  }
        {S.solid > 0.001 && geo.kind === "text" ? (
          <svg x={S.mark.clip.x} y={S.mark.clip.y} width={S.mark.clip.width} height={S.mark.clip.height} overflow="hidden">
            <g transform={`translate(${-S.mark.clip.x} ${-S.mark.clip.y})`}>
              <text
                x={L.mark.x + ((geo.raster.origin.x - geo.raster.ink.x) * L.mark.width) / geo.raster.ink.width}
                y={L.mark.y + ((geo.raster.origin.y - geo.raster.ink.y) * L.mark.width) / geo.raster.ink.width}
                fontFamily={geo.raster.family}
                fontWeight={geo.raster.weight}
                fontSize={(RASTER_PX * L.mark.width) / geo.raster.ink.width}
                fill={ink}
                textAnchor="start"
                style={{ direction: "ltr", whiteSpace: "pre" }}
              >
                {geo.text}
              </text>
            </g>
          </svg>
        ) : null}

        {                                                                                       }
        {S.particles.map((p, i) =>
          p.opacity < 0.004 ? null : (
            <rect key={i} x={p.x - p.r} y={p.y - p.r} width={2 * p.r} height={2 * p.r} rx={p.r * shape.pillK} fill={tint(chaos, ink, p.tone)} opacity={p.opacity} />
          ),
        )}
      </svg>

      {                                                                           }
      {S.name.presence > 0.001 ? (
        <div style={{ ...rectStyle(L.name), display: "flex", alignItems: "center", justifyContent: "center", opacity: S.name.presence, transform: `translateY(${px(S.name.dy)}px)` }}>
          <ConceptText text={data.brandName} theme={theme} role="title" width={L.name.width} height={L.name.height} size={92} min={44} lines={1} align="center" />
        </div>
      ) : null}
      {S.tagline.presence > 0.001 ? (
        <div style={{ ...rectStyle(L.tagline), display: "flex", alignItems: "flex-start", justifyContent: "center", opacity: S.tagline.presence, transform: `translateY(${px(S.tagline.dy)}px)` }}>
          <ConceptText text={data.tagline} theme={theme} role="body" width={L.tagline.width} height={L.tagline.height} size={46} min={28} lines={2} align="center" color={theme.dim} />
        </div>
      ) : null}
    </>
  );
};


export const ChaosToBrand: React.FC<ConceptSceneProps<ChaosToBrandData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
