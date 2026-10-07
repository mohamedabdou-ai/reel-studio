import React from "react";
import { mix, px } from "../../core/motion";
import { formatNumber } from "../../core/numbers";
import { FRAME } from "../../core/safe";
import {
  Bidi,
  ConceptStage,
  ConceptText,
  Dressing,
  dirOf,
  numberFont,
  rectStyle,
  styleShape,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { FL, FR, LAYER_COUNT, MIN_FRAMES, NL, NR, flatten, layoutFor, roundedPath, stateAt, type Pt, type SystemLayersParams } from "./math.ts";
import type { SystemLayersData } from "./schema.ts";


const CORNER_CAP = 14;

const TINT_TOP = 0.32;
const TINT_DEEP = 0.06;

const TINT_READ = 0.16;

const FOG_STEP = 0.05;

const FRONT_SHADE = 0.3;

const Scene: React.FC<{ data: SystemLayersData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);


  const arabicLabels = data.layers.filter((l) => dirOf(l.label) === "rtl").length;
  const rtl = arabicLabels * 2 > data.layers.length;
  const digits = rtl ? "arabic-indic" : "latin";
  const numFont = numberFont(theme, digits);
  const params: SystemLayersParams = { mode, box, rtl };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);

  const bg = theme.background;
  const edge = flatten(theme.border, bg);
  const card = flatten(theme.card, bg);
  const accent = flatten(colors.accentFill, bg);
  const corner = Math.min(CORNER_CAP, Math.round(shape.windowRadius * 0.4));
  const strokeW = shape.ring + 1;

  const topFill = (i: number, active: number): string =>
    tint(tint(card, accent, mix(TINT_TOP, TINT_DEEP, i / (LAYER_COUNT - 1)) + TINT_READ * active), bg, FOG_STEP * i);


  const order = Array.from({ length: LAYER_COUNT }, (_, k) => LAYER_COUNT - 1 - k);
  const shift = (pts: Pt[], d: number): Pt[] => pts.map((p) => ({ x: p.x + d, y: p.y + d }));

  return (
    <>
      <svg width={FRAME.width} height={FRAME.height} viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {                                                                                          }
        <Dressing>
          <g stroke={theme.dim} strokeWidth={2} strokeLinecap="round" opacity={0.6}>
            {S.rails.map((r, i) => (
              <line key={i} x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} />
            ))}
          </g>
        </Dressing>
        {order.map((i) => {
          const layer = S.layers[i];
          const top = topFill(i, layer.active);
          const front = tint(top, edge, FRONT_SHADE);
          const silhouette = [layer.top[FL], layer.top[FR], layer.top[NR], layer.front[2], layer.front[3], layer.top[NL]];
          return (
            <g key={i}>
              {shape.hardOffset > 0 ? <path d={roundedPath(shift(silhouette, shape.hardOffset), corner)} fill={edge} /> : null}
              <path d={roundedPath(layer.front, corner)} fill={front} stroke={edge} strokeWidth={strokeW} strokeLinejoin="round" />
              <path d={roundedPath(layer.top, corner)} fill={top} stroke={edge} strokeWidth={strokeW} strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>

      {                                                                                 }
      {data.layers.map((item, i) => {
        const layer = S.layers[i];
        if (layer.label <= 0.001) return null;
        const l = L.layers[i];
        const titleRect = item.detail ? l.title : l.titleSolo;
        return (
          <div
            key={i}
            style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: layer.label, transform: `translateY(${px(layer.dy)}px)` }}
          >
            <div
              style={{
                ...rectStyle(l.chip),
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: colors.accentFill,
                color: colors.onAccentFill,
                border: `${strokeW}px solid ${edge}`,
                borderRadius: Math.round((shape.pillK * l.chip.width) / 2),
                fontFamily: numFont,
                fontWeight: 700,
                fontSize: px(l.chip.width * 0.5),
                lineHeight: 1,
              }}
            >
              <Bidi dir={digits === "latin" ? "ltr" : "rtl"}>{formatNumber(i + 1, { digits })}</Bidi>
            </div>
            <div style={{ ...rectStyle(titleRect), display: "flex", alignItems: "center" }}>
              <ConceptText
                text={item.label}
                theme={theme}
                role="title"
                width={titleRect.width}
                height={titleRect.height}
                size={42}
                min={26}
                lines={1}
                color={theme.text}
                align={rtl ? "right" : "left"}
              />
            </div>
            {item.detail ? (
              <div style={{ ...rectStyle(l.detail), display: "flex", alignItems: "center" }}>
                <ConceptText
                  text={item.detail}
                  theme={theme}
                  role="body"
                  width={l.detail.width}
                  height={l.detail.height}
                  size={28}
                  min={20}
                  lines={1}
                  color={theme.dim}
                  align={rtl ? "right" : "left"}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
};


export const SystemLayers: React.FC<ConceptSceneProps<SystemLayersData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
