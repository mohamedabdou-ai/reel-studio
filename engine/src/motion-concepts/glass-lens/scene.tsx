import React from "react";
import { px } from "../../core/motion";
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
import { MIN_FRAMES, RECEDE_OPACITY, layoutFor, stateAt, type GlassLensParams } from "./math.ts";
import type { GlassLensData } from "./schema.ts";


const ink = (color: string, focus: number, blur: number): React.CSSProperties => ({
  color: alpha(color, focus),
  textShadow: blur > 0 ? `0 0 ${blur}px ${alpha(color, 1 - focus)}` : "none",
});

const Scene: React.FC<{ data: GlassLensData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = data.rows.filter((r) => dirOf(r.label) === "rtl").length >= 3;
  const params: GlassLensParams = { mode, box, rtl, keyIndex: data.keyIndex };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);

  const rowRadius = px(shape.windowRadius * 0.6);
  const lensRadius = px(Math.min(shape.windowRadius * 0.7, L.lens.height / 2));
  const rowFill = tint(theme.card, theme.background, 0.6);

  const ring = tint(alpha(theme.text, 0.4), colors.accentInk, S.lock);

  const veil = alpha(theme.text, 0.06);
  const skeleton = { borderRadius: px(shape.windowRadius * 0.2) };

  return (
    <>
      {                      }
      <div style={{ ...rectStyle(L.card), boxSizing: "border-box", ...surfaceStyle(theme) }} />
      <Dressing>
        <div style={{ ...rectStyle(L.header.title), ...skeleton, background: alpha(theme.border, 0.3) }} />
        <div style={{ ...rectStyle(L.header.chip), ...skeleton, background: alpha(theme.border, 0.22) }} />
        <div style={{ ...rectStyle(L.header.rule), background: alpha(theme.border, 0.35) }} />
      </Dressing>

      {                                                                                          }
      {data.rows.map((row, i) => {
        const R = L.rows[i];
        const s = S.rows[i];
        return (
          <div key={i} style={{ ...rectStyle(R.rect), opacity: 1 - RECEDE_OPACITY * s.recede, transform: `scale(${s.scale})` }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: R.rect.width,
                height: R.rect.height,
                boxSizing: "border-box",
                border: `2px solid ${alpha(theme.border, 0.45 + 0.55 * s.focus)}`,
                borderRadius: rowRadius,
                background: tint(rowFill, colors.accentFill, 0.16 * s.key),
              }}
            />
            {s.key > 0.001 ? (
              <div style={{ ...rectStyle(R.bar), background: colors.accentInk, borderRadius: px(R.bar.width / 2), transform: `scaleY(${s.key})` }} />
            ) : null}
            <div style={{ ...rectStyle(R.label), display: "flex", alignItems: "center" }}>
              <ConceptText
                text={row.label}
                theme={theme}
                role="body"
                width={R.label.width}
                height={R.label.height}
                size={40}
                min={26}
                lines={2}
                align={rtl ? "right" : "left"}
                style={ink(tint(theme.dim, theme.text, s.focus), s.focus, s.blur)}
              />
            </div>
            <div style={{ ...rectStyle(R.value), display: "flex", alignItems: "center" }}>
              <ConceptText
                text={row.value}
                theme={theme}
                role="title"
                width={R.value.width}
                height={R.value.height}
                size={62}
                min={28}
                lines={1}
                align={rtl ? "left" : "right"}
                style={ink(theme.text, s.focus, s.blur)}
              />
            </div>
          </div>
        );
      })}

      {                                     }
      {S.lens.opacity > 0.001 ? (
        <div
          style={{
            ...rectStyle(S.lens.rect),
            boxSizing: "border-box",
            opacity: S.lens.opacity,
            borderRadius: lensRadius,

            background: `linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 55%, ${alpha(colors.accentFill, 0.1 + 0.16 * S.lock)} 100%), linear-gradient(${veil}, ${veil})`,

            boxShadow: [
              `0 0 0 ${shape.ring}px ${ring}`,
              "inset 0 0 0 2px rgba(255, 255, 255, 0.4)",
              "inset 0 4px 0 0 rgba(255, 255, 255, 0.3)",
              "inset 0 -4px 0 0 rgba(0, 0, 0, 0.1)",
            ].join(", "),
          }}
        />
      ) : null}
    </>
  );
};


export const GlassLens: React.FC<ConceptSceneProps<GlassLensData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
