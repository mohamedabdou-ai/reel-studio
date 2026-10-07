import React from "react";
import { px } from "../../core/motion";
import { formatNumber } from "../../core/numbers";
import { CardMorph } from "../../core/transitions-dir";
import { fitTextLayout } from "../../creative-kit/primitives";
import {
  ConceptStage,
  ConceptText,
  alpha,
  dirOf,
  digitsFor,
  numberFont,
  rectStyle,
  styleShape,
  surfaceShadow,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { MIN_FRAMES, layoutFor, roundedPath, stateAt, type HeadlineToSystemParams, type Pt } from "./math.ts";
import type { HeadlineToSystemData } from "./schema.ts";


const LINE_W = 4;

const HUB_TINT = 0.26;

const WIRE_INK = 0.3;

const Scene: React.FC<{ data: HeadlineToSystemData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = dirOf(data.coreIdea) === "rtl";
  const params: HeadlineToSystemParams = { mode, box, rtl, pillK: shape.pillK, windowRadius: shape.windowRadius };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const digits = digitsFor(data.coreIdea);
  const numFont = numberFont(theme, digits);
  const round = (h: number) => Math.round((h * shape.pillK) / 2);
  const hubFill = tint(theme.card, colors.accentFill, HUB_TINT);
  const wire = tint(colors.accentInk, theme.text, WIRE_INK);



  const labelSize = React.useMemo(
    () =>
      Math.min(
        ...data.assets.map(
          (asset, i) =>
            fitTextLayout({ text: asset.label, theme, width: L.cards[i].label.width, height: L.cards[i].label.height, size: 38, min: 22, lines: 2, role: "body" }).fontSize,
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.assets, theme, L.cards.map((c) => `${c.label.width}x${c.label.height}`).join(",")],
  );

  const port = (q: Pt, s: number, key: string) =>
    s > 0.001 ? (
      <rect
        key={key}
        x={-L.port}
        y={-L.port}
        width={2 * L.port}
        height={2 * L.port}
        rx={L.port * shape.pillK}
        transform={`translate(${q.x} ${q.y}) scale(${s})`}
        fill={wire}
        stroke={theme.card}
        strokeWidth={3}
      />
    ) : null;

  return (
    <>
      {
                                                                                                                             }
      {data.assets.map((asset, i) => {
        const c = S.cards[i];
        if (c.presence <= 0.001) return null;
        const lay = L.cards[i];
        return (
          <CardMorph
            key={i}
            from={{ ...lay.seed, radius: L.cardRadius }}
            to={{ ...lay.card, radius: L.cardRadius }}
            progress={c.presence}
            fit="crop"
            background={theme.card}
            shadow={surfaceShadow(theme, theme.border)}
            style={{ opacity: c.fade }}
          >
            {c.content > 0.001 ? (
              <>
                <div
                  style={{
                    ...rectStyle(lay.badge),
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: colors.accentFill,
                    color: colors.onAccentFill,
                    border: `${shape.ring}px solid ${theme.border}`,
                    borderRadius: round(lay.badge.height),
                    fontFamily: numFont,
                    fontWeight: 700,
                    fontSize: 30,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                    opacity: c.content,
                  }}
                >
                  {formatNumber(i + 1, { digits })}
                </div>
                <div style={{ ...rectStyle(lay.label), display: "flex", alignItems: "center", opacity: c.content }}>
                  <ConceptText
                    text={asset.label}
                    theme={theme}
                    role="body"
                    width={lay.label.width}
                    height={lay.label.height}
                    size={labelSize}
                    min={22}
                    lines={2}
                    align={rtl ? "right" : "left"}
                  />
                </div>
              </>
            ) : null}
            {[lay.barA, lay.barB].map((bar, k) => {
              const v = c.bars[k];
              if (v <= 0.001) return null;
              const w = px(bar.width * v);
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",

                    left: rtl ? bar.x + bar.width - w : bar.x,
                    top: bar.y,
                    width: w,
                    height: bar.height,
                    background: alpha(theme.dim, 0.38),
                    borderRadius: round(bar.height),
                  }}
                />
              );
            })}
          </CardMorph>
        );
      })}

      {                                                                                                                                                       }
      {S.cardIn > 0.001 ? (
        <div
          style={{
            ...rectStyle(S.hub),
            background: hubFill,
            borderRadius: px(S.radius),
            boxShadow: surfaceShadow(theme, theme.border),
            opacity: S.cardIn,
          }}
        />
      ) : null}

      {                                                                                   }
      <svg
        width={L.region.width}
        height={L.region.height}
        viewBox={`${L.region.x} ${L.region.y} ${L.region.width} ${L.region.height}`}
        style={{ position: "absolute", left: L.region.x, top: L.region.y, overflow: "visible" }}
      >
        {S.cards.map((c, i) => {
          if (c.line <= 0.001) return null;
          const route = L.cards[i].route;
          return (
            <g key={i}>
              <path
                d={roundedPath(route, L.corner)}
                fill="none"
                stroke={wire}
                strokeWidth={LINE_W}
                pathLength={1}
                strokeDasharray={`${c.line} 2`}
              />
              {port(route[0], c.portFrom, "from")}
              {port(route[3], c.portTo, "to")}
            </g>
          );
        })}
      </svg>

      {                                                                                                 }
      <div
        style={{
          ...rectStyle(L.text),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${S.textScale})`,
          transformOrigin: "50% 50%",
        }}
      >
        <ConceptText text={data.coreIdea} theme={theme} role="title" width={L.text.width} height={L.text.height} size={52} min={30} lines={3} align="center" />
      </div>
    </>
  );
};


export const HeadlineToSystem: React.FC<ConceptSceneProps<HeadlineToSystemData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
