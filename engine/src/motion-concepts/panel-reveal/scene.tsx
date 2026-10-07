import React from "react";
import { Img, staticFile } from "remotion";
import { px } from "../../core/motion";
import { ConceptStage, ConceptText, alpha, dirOf, rectStyle, styleShape, surfaceStyle, uiColors, useConcept, useConceptTimeline } from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { DIVIDER, MIN_FRAMES, PANEL_COUNT, layoutFor, panelFill, plateArt, plateBarFill, stateAt, type PanelRevealParams } from "./math.ts";
import type { PanelRevealData } from "./schema.ts";
import { balancedTitleWidth } from "./title-fit.ts";


const TITLE = { size: 76, min: 34, lines: 2 } as const;


const ARROW = "M10 32 H52 M36 16 L52 32 L36 48";


const PlateArt: React.FC<{ seed: string; width: number; height: number; ground: string; sun: string; bar: string }> = ({
  seed,
  width,
  height,
  ground,
  sun,
  bar,
}) => {
  const art = React.useMemo(() => plateArt(seed, width, height), [seed, width, height]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={height} fill={ground} />
      <circle cx={art.disc.cx} cy={art.disc.cy} r={art.disc.r} fill={sun} />
      {art.bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} fill={bar} />
      ))}
    </svg>
  );
};

const Scene: React.FC<{ data: PanelRevealData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = dirOf(data.title) === "rtl";
  const params: PanelRevealParams = { mode, box, rtl, pillK: shape.pillK, seed: data.title };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);

  const titleW = React.useMemo(
    () => balancedTitleWidth({ text: data.title, theme, width: L.title.width, height: L.title.height, ...TITLE }),
    [data.title, theme, L.title.width, L.title.height],
  );
  const W = L.card.width;
  const H = L.card.height;
  const ink = panelFill(theme.background, theme.text);
  const bar = plateBarFill(theme.background, theme.text);
  const seam = alpha(theme.background, 0.55);
  const layer: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: W, height: H };

  return (
    <div style={{ ...rectStyle(L.card), ...surfaceStyle(theme), overflow: "hidden", isolation: "isolate" }}>
      {                                                                                }
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: L.plate.height, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: L.plate.height, transform: `scale(${S.zoom})` }}>
          {data.visualSrc ? (
            <Img src={staticFile(data.visualSrc)} style={{ display: "block", width: W, height: L.plate.height, objectFit: "cover" }} />
          ) : (
            <PlateArt seed={data.title} width={W} height={L.plate.height} ground={theme.background} sun={theme.accent} bar={bar} />
          )}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: L.plate.height, width: W, height: DIVIDER, background: theme.border }} />

      {                                                                      }
      <div style={{ ...layer, opacity: S.title.presence, transform: `translateY(${px(S.title.dy)}px)` }}>
        <div style={{ ...rectStyle(L.title), display: "flex", alignItems: "center", justifyContent: rtl ? "flex-end" : "flex-start" }}>
          <ConceptText text={data.title} theme={theme} role="title" width={titleW} height={L.title.height} size={TITLE.size} min={TITLE.min} lines={TITLE.lines} />
        </div>
      </div>

      {                                                                                       }
      <div style={{ ...layer, opacity: S.cta.presence, transform: `translateY(${px(S.cta.dy)}px)` }}>
        <div
          style={{
            ...rectStyle(L.cta),
            boxSizing: "border-box",
            border: `2px solid ${theme.border}`,
            borderRadius: L.ctaRadius,
            background: colors.accentFill,
          }}
        />
        <div style={{ ...rectStyle(L.ctaText), display: "flex", alignItems: "center" }}>
          <ConceptText
            text={data.cta}
            theme={theme}
            role="label"
            width={L.ctaText.width}
            height={L.ctaText.height}
            size={40}
            min={24}
            lines={1}
            color={colors.onAccentFill}
            align={rtl ? "right" : "left"}
          />
        </div>
        <svg
          viewBox="0 0 64 64"
          width={L.arrow.width}
          height={L.arrow.height}
          style={{ ...rectStyle(L.arrow), transform: `translateX(${px(S.nudge * L.nudge)}px) scaleX(${rtl ? -1 : 1})` }}
        >
          <path d={ARROW} fill="none" stroke={colors.onAccentFill} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {                                                                                            }
      {S.panels.map((p, i) =>
        p.rect.height > 0 ? (
          <div
            key={i}
            style={{ position: "absolute", left: p.rect.x, top: p.rect.y, width: p.rect.width, height: p.rect.height, background: ink }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, width: p.rect.width, height: p.line, background: theme.accent }} />
            {i < PANEL_COUNT - 1 ? (
              <div style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: seam, ...(rtl ? { left: 0 } : { right: 0 }) }} />
            ) : null}
          </div>
        ) : null,
      )}
    </div>
  );
};


export const PanelReveal: React.FC<ConceptSceneProps<PanelRevealData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
