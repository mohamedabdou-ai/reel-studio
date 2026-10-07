import React from "react";
import { px } from "../../core/motion";
import { fitTextLayout, type SceneTheme } from "../../creative-kit/primitives";
import {
  ConceptIcon,
  ConceptStage,
  ConceptText,
  alpha,
  dirOf,
  rectStyle,
  styleShape,
  surfaceShadow,
  surfaceStyle,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import {
  CARET_H,
  CARET_W,
  CURSOR_H,
  CURSOR_W,
  LABEL_FONT,
  LABEL_H,
  LABEL_MAX_W,
  LABEL_MIN_FONT,
  LABEL_MIN_W,
  LABEL_PAD_X,
  LABEL_TEXT_H,
  MIN_FRAMES,
  layoutFor,
  stateAt,
  type MagneticDockParams,
} from "./math.ts";
import type { MagneticDockData } from "./schema.ts";


const POINTER = "M0 0 L0 46 L12 35 L21 56 L30 52 L21 32 L38 32 Z";


const labelWidthOf = (text: string, theme: SceneTheme): number => {
  const fit = fitTextLayout({
    text,
    theme,
    width: LABEL_MAX_W - 2 * LABEL_PAD_X,
    height: LABEL_TEXT_H,
    size: LABEL_FONT,
    min: LABEL_MIN_FONT,
    lines: 1,
    role: "title",
  });
  return Math.min(LABEL_MAX_W, Math.max(LABEL_MIN_W, fit.width + 2 * LABEL_PAD_X));
};

const Scene: React.FC<{ data: MagneticDockData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = data.tools.some((t) => dirOf(t.name) === "rtl");
  const labelWidths = React.useMemo(() => data.tools.map((t) => labelWidthOf(t.name, theme)), [data.tools, theme]);
  const params: MagneticDockParams = { mode, box, rtl, labelWidths };
  const L = layoutFor(box);
  const S = stateAt(frame, duration, params);



  const iconRadiusK = theme.grammar?.card === "rounded-ui" || theme.grammar === undefined ? 0.26 : 0.08;
  const panelRadius = Math.round(shape.windowRadius * 1.2);
  const pillRadius = Math.round((LABEL_H * shape.pillK) / 2);
  const unlit = alpha(theme.dim, 0.4);

  return (
    <>
      <div style={{ ...rectStyle(S.panel), ...surfaceStyle(theme, panelRadius) }} />

      {                                                                       }
      {S.icons.map((icon, i) => (
        <div
          key={`dot${i}`}
          style={{
            position: "absolute",
            left: px(icon.rect.x + icon.rect.width / 2 - L.dotSize / 2),
            top: px(L.dotY - L.dotSize / 2),
            width: L.dotSize,
            height: L.dotSize,
            borderRadius: "50%",
            background: tint(unlit, colors.accentInk, icon.dot),
            transform: `scale(${1 + 0.25 * icon.dot})`,
          }}
        />
      ))}

      {


                                                                                                      }
      {S.icons.map((icon, i) => (
        <div key={`icon${i}`} style={rectStyle(icon.rect)}>
          <div style={{ position: "absolute", inset: 0, borderRadius: px(icon.rect.width * iconRadiusK), background: theme.card }} />
          <div style={{ position: "absolute", inset: 0, opacity: icon.opacity }}>
            <ConceptIcon
              src={data.tools[i].icon}
              name={data.tools[i].name}
              size={icon.rect.width}
              theme={theme}
              style={{ boxShadow: `0 0 0 ${shape.ring}px ${theme.border}` }}
            />
          </div>
        </div>
      ))}

      {                                                                                             }
      {S.icons.map((icon, i) => {
        const { presence, rect, tipX } = icon.label;
        if (presence <= 0.001) return null;
        return (
          <React.Fragment key={`label${i}`}>
            <div
              style={{
                ...rectStyle(rect),
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: colors.userBubble,
                borderRadius: pillRadius,
                boxShadow: surfaceShadow(theme, theme.border),
                opacity: presence,
              }}
            >
              <ConceptText
                text={data.tools[i].name}
                theme={theme}
                role="title"
                width={rect.width - 2 * LABEL_PAD_X}
                height={LABEL_TEXT_H}
                size={LABEL_FONT}
                min={LABEL_MIN_FONT}
                lines={1}
                color={colors.userText}
                align="center"
              />
            </div>
            {                                                                                              }
            <svg
              width={CARET_W}
              height={CARET_H}
              viewBox={`0 0 ${CARET_W} ${CARET_H}`}
              style={{ position: "absolute", left: px(tipX - CARET_W / 2), top: px(rect.y + rect.height), opacity: presence, overflow: "visible" }}
            >
              <polygon points={`0,0 ${CARET_W},0 ${CARET_W / 2},${CARET_H}`} fill={colors.userBubble} />
            </svg>
          </React.Fragment>
        );
      })}

      {                                                                     }
      {S.cursor.opacity > 0 ? (
        <svg
          width={CURSOR_W}
          height={CURSOR_H}
          viewBox={`0 0 ${CURSOR_W} ${CURSOR_H}`}
          style={{ position: "absolute", left: px(S.cursor.x), top: px(S.cursor.y), opacity: S.cursor.opacity, overflow: "visible" }}
        >
          <path d={POINTER} fill={theme.text} stroke={theme.card} strokeWidth={3} strokeLinejoin="round" />
        </svg>
      ) : null}
    </>
  );
};


export const MagneticDock: React.FC<ConceptSceneProps<MagneticDockData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
