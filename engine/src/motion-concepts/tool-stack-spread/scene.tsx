import React from "react";
import { formatNumber } from "../../core/numbers";
import { ConceptIcon, ConceptStage, ConceptText, dirOf, rectStyle, styleShape, surfaceShadow, uiColors, useConcept, useConceptTimeline } from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import { MIN_FRAMES, PAINT_ORDER, layoutFor, stateAt, type ToolStackParams } from "./math.ts";
import type { ToolStackSpreadData } from "./schema.ts";


const CHIP_POP = 0.1;

const Scene: React.FC<{ data: ToolStackSpreadData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);


  const arabicLines = data.tools.filter((t) => dirOf(t.function) === "rtl").length;
  const rtl = arabicLines * 2 > data.tools.length;
  const digits = rtl ? "arabic-indic" : "latin";
  const align = rtl ? "right" : "left";
  const params: ToolStackParams = { mode, box, rtl };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const radius = Math.round(shape.windowRadius * 0.7);
  const opaque = `linear-gradient(${theme.card}, ${theme.card}), ${theme.background}`;
  const shadow = surfaceShadow(theme, theme.border);

  return (
    <>
      {PAINT_ORDER.map((i) => {
        const tool = data.tools[i];
        const slot = L.slots[i];
        const card = S.cards[i];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: slot.x,
              top: slot.y,
              width: slot.width,
              height: slot.height,
              boxSizing: "border-box",
              background: opaque,
              borderRadius: radius,
              boxShadow: shadow,
              transform: `translateY(${card.dy}px) scale(${card.scale})`,
              transformOrigin: "50% 50%",
            }}
          >
            <div style={{ ...rectStyle(L.chip), transform: `scale(${1 + CHIP_POP * card.glance})` }}>
              <ConceptIcon src={tool.icon} name={formatNumber(i + 1, { digits })} size={L.chip.width} theme={theme} />
            </div>
            <div style={{ ...rectStyle(L.name), display: "flex", alignItems: "center" }}>
              <ConceptText
                text={tool.name}
                theme={theme}
                role="title"
                width={L.name.width}
                height={L.name.height}
                size={44}
                min={26}
                lines={1}
                color={colors.text}
                align={align}
              />
            </div>
            <div style={{ ...rectStyle(L.fn), display: "flex", alignItems: "center" }}>
              <ConceptText
                text={tool.function}
                theme={theme}
                role="body"
                width={L.fn.width}
                height={L.fn.height}
                size={32}
                min={22}
                lines={1}
                color={colors.dim}
                align={align}
              />
            </div>
          </div>
        );
      })}
    </>
  );
};


export const ToolStackSpread: React.FC<ConceptSceneProps<ToolStackSpreadData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
