import React from "react";
import { mix, px } from "../../core/motion";
import {
  ConceptStage,
  ConceptText,
  Dressing,
  alpha,
  dirOf,
  rectStyle,
  styleShape,
  surfaceStyle,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { MIN_FRAMES, layoutFor, stateAt, type DataMorphParams, type Trend } from "./math.ts";
import type { DataMorphData } from "./schema.ts";


const TREND_GLYPH: Record<Trend, { line: string; head: string }> = {
  up: { line: "M3 17 L9.5 10.5 L13.5 14.5 L21 7", head: "M15 7 H21 V13" },
  down: { line: "M3 7 L9.5 13.5 L13.5 9.5 L21 17", head: "M15 17 H21 V11" },
  flat: { line: "M3 12 H20", head: "M15 6.5 L20.5 12 L15 17.5" },
};

const Scene: React.FC<{ data: DataMorphData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = dirOf(data.metricLabel) === "rtl";


  const params: DataMorphParams = { mode, box, rtl, axis: "ltr", pillK: shape.pillK, windowRadius: shape.windowRadius, values: data.values };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const W = L.window.width;
  const H = L.window.height;



  const barFill = tint(theme.card, theme.dim, 0.3);
  const chipRadius = Math.round((L.chip.height * shape.pillK) / 2);
  const tagRadius = Math.round((L.tag.height * shape.pillK) / 2);
  const gridColor = alpha(theme.border, 0.32);
  const lineWidth = shape.pillK > 0.5 ? 8 : 7;
  const glyph = TREND_GLYPH[S.trend];
  const last = S.bars[S.bars.length - 1];
  const areaPath =
    `M ${S.bars.map((b) => `${b.cx} ${b.cy}`).join(" L ")} L ${last.cx} ${L.baseline} L ${S.bars[0].cx} ${L.baseline} Z`;

  return (
    <div style={{ ...rectStyle(L.window), ...surfaceStyle(theme) }}>
      {                                                                                                 }
      <div style={{ ...rectStyle(L.metric), display: "flex", alignItems: "center" }}>
        <ConceptText
          text={data.metricLabel}
          theme={theme}
          role="title"
          width={L.metric.width}
          height={L.metric.height}
          size={44}
          min={28}
          lines={1}
          align={rtl ? "right" : "left"}
        />
      </div>
      {data.unit ? (
        <div
          style={{
            ...rectStyle(L.chip),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: chipRadius,
            boxShadow: `0 0 0 ${shape.ring}px ${theme.border}`,
          }}
        >
          <ConceptText
            text={data.unit}
            theme={theme}
            role="body"
            width={L.chip.width - 34}
            height={L.chip.height - 6}
            size={26}
            min={20}
            lines={1}
            color={theme.dim}
            align="center"
          />
        </div>
      ) : null}
      <div style={{ ...rectStyle(L.rule), background: alpha(theme.border, 0.5) }} />

      {                                                                       }
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {L.grid.map((y, i) => (
          <line key={i} x1={L.plot.x} x2={L.plot.x + L.plot.width} y1={y} y2={y} stroke={gridColor} strokeWidth={2} strokeDasharray="4 12" />
        ))}
        {                                                                                                  }
        {S.hi > 0.001 ? <path d={areaPath} fill={alpha(colors.accentFill, 0.2)} opacity={S.hi} /> : null}
        <line x1={L.plot.x} x2={L.plot.x + L.plot.width} y1={L.baseline} y2={L.baseline} stroke={theme.border} strokeWidth={3} />
        {L.cx.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={L.baseline} y2={L.baseline + L.tick} stroke={theme.border} strokeWidth={3} />
        ))}
        {S.links.map((k, i) =>
          k.s > 0 ? (
            <line
              key={i}
              x1={k.x1}
              y1={k.y1}
              x2={k.x2}
              y2={k.y2}
              stroke={colors.accentInk}
              strokeWidth={lineWidth}
              strokeLinecap={shape.pillK > 0.5 ? "round" : "butt"}
            />
          ) : null,
        )}
        {S.bars.map((b, i) => {
          if (b.width <= 0 || b.height <= 0) return null;
          const m = S.m[i];
          let fill = tint(barFill, theme.card, m);
          let stroke = tint(theme.border, colors.accentInk, m);
          let strokeWidth = mix(shape.ring, 5, m);
          if (i === S.bars.length - 1) {
            fill = tint(fill, colors.accentFill, S.hi);
            stroke = tint(stroke, theme.text, S.hi);
            strokeWidth = mix(strokeWidth, 6, S.hi);
          }
          return <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx={b.radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
        })}
        {S.leader.p > 0 ? (
          <line
            x1={S.leader.x}
            x2={S.leader.x}
            y1={S.leader.y1}
            y2={S.leader.y2}
            stroke={colors.accentInk}
            strokeWidth={3}
            strokeDasharray="3 9"
            strokeLinecap="round"
          />
        ) : null}
        {S.halo.opacity > 0 ? (
          <Dressing>
            <rect
              x={S.halo.cx - S.halo.r}
              y={S.halo.cy - S.halo.r}
              width={2 * S.halo.r}
              height={2 * S.halo.r}
              rx={shape.pillK * S.halo.r}
              fill="none"
              stroke={colors.accentInk}
              strokeWidth={4}
              opacity={S.halo.opacity}
            />
          </Dressing>
        ) : null}
      </svg>

      {                                                                                              }
      {S.kpi > 0.001 ? (
        <div style={{ ...rectStyle(L.kpi), display: "flex", alignItems: "center", opacity: S.kpi, transform: `translateY(${px(S.kpiDy)}px)` }}>
          <ConceptText
            text={data.finalKpi}
            theme={theme}
            role="title"
            width={L.kpi.width}
            height={L.kpi.height}
            size={104}
            min={56}
            lines={1}
            align={L.chartRtl ? "left" : "right"}
          />
        </div>
      ) : null}

      {                                                                                   }
      {S.tag > 0.001 ? (
        <div
          style={{
            ...rectStyle(L.tag),
            background: colors.accentFill,
            borderRadius: tagRadius,
            boxShadow: `0 0 0 ${shape.ring}px ${theme.border}`,
            opacity: S.tag,
            transform: `translateY(${px(S.tagDy)}px)`,
          }}
        >
          {                                                                                                                        }
          <svg
            style={{ ...rectStyle(L.tagIcon), transform: L.chartRtl ? "scaleX(-1)" : undefined }}
            viewBox="0 0 24 24"
            width={L.tagIcon.width}
            height={L.tagIcon.height}
          >
            <path d={glyph.line} fill="none" stroke={colors.onAccentFill} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
            <path d={glyph.head} fill="none" stroke={colors.onAccentFill} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ ...rectStyle(L.tagText), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ConceptText
              text={data.resultLabel}
              theme={theme}
              role="body"
              width={L.tagText.width}
              height={L.tagText.height}
              size={30}
              min={22}
              lines={1}
              color={colors.onAccentFill}
              align="center"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};


export const DataMorph: React.FC<ConceptSceneProps<DataMorphData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
