import React from "react";
import { CardMorph } from "../../core/transitions-dir";
import { formatNumber } from "../../core/numbers";
import { px } from "../../core/motion";
import { seg } from "../timeline.ts";
import {
  Bidi,
  ConceptStage,
  ConceptText,
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
import { MIN_FRAMES, layoutFor, panelZ, stateAt, type BriefToWorkspaceParams } from "./math.ts";
import type { BriefToWorkspaceData } from "./schema.ts";

const Scene: React.FC<{ data: BriefToWorkspaceData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = dirOf(data.briefTitle) === "rtl";
  const params: BriefToWorkspaceParams = { mode, box, rtl, pillK: shape.pillK, windowRadius: shape.windowRadius };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const W = L.window.width;
  const H = L.window.height;
  const align = rtl ? "right" : "left";
  const digits = digitsFor(data.briefTitle);
  const numFont = numberFont(theme, digits);
  const cx = L.window.x + W / 2;
  const cy = L.window.y + H / 2;


  const ring = tint(shape.soft ? colors.accentFill : theme.border, theme.border, seg(S.p, 0.1, 0.6));
  const panelFill = tint(theme.card, theme.background, 0.6);

  const meterFill = tint(colors.accentFill, theme.good, S.done);
  const round = (h: number) => px((h * shape.pillK) / 2);

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", transform: `scale(${S.scale})`, transformOrigin: `${cx}px ${cy}px` }}>
      <CardMorph
        from={{ ...L.brief, radius: L.radius }}
        to={{ ...L.window, radius: L.radius }}
        progress={S.p}
        fit="crop"
        background={theme.card}
        shadow={surfaceShadow(theme, ring)}
      >
        {                                                                            }
        {S.bars > 0.001
          ? L.bars.map((r, j) => (
              <div key={j} style={{ ...rectStyle(r), borderRadius: round(r.height), background: tint(theme.dim, theme.card, 0.72), opacity: S.bars }} />
            ))
          : null}

        {
                                                                                                   }
        {S.rule > 0.001 ? <div style={{ ...rectStyle(L.rule), background: theme.border, opacity: S.rule }} /> : null}

        {                                                                                              }
        {S.chrome > 0.001 ? (
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: S.chrome }}>
            {L.segments.map((r, i) => (
              <div
                key={i}
                style={{
                  ...rectStyle(r),
                  boxSizing: "border-box",
                  border: `2px solid ${theme.border}`,
                  borderRadius: round(r.height),
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    ...(rtl ? { right: 0 } : { left: 0 }),
                    width: px((r.width - 4) * S.segments[i]),
                    background: meterFill,
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}

        {                                                                              }
        <div style={{ ...rectStyle(S.title), display: "flex", alignItems: "center" }}>
          <ConceptText
            text={data.briefTitle}
            theme={theme}
            role="title"
            width={S.title.width}
            height={S.title.height}
            size={44}
            min={26}
            lines={2}
            align={align}
          />
        </div>

        {                                                                      }
        {data.panels.map((panel, i) => {
          const st = S.panels[i];
          if (st.presence <= 0.001) return null;
          const pl = L.panels[i];
          return (
            <div
              key={i}
              style={{
                ...rectStyle(st.rect),
                overflow: "hidden",
                borderRadius: L.panelRadius,
                background: panelFill,
                boxShadow: `0 0 0 ${shape.ring}px ${theme.border}`,
                opacity: st.fade,

                zIndex: panelZ(i),
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: pl.slot.width,
                  height: pl.slot.height,
                  transformOrigin: "0 0",
                  transform: `scale(${st.zoom})`,
                  opacity: st.content,
                }}
              >
                <div
                  style={{
                    ...rectStyle(pl.chip),
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `2px solid ${theme.border}`,
                    borderRadius: round(pl.chip.height),
                    background: colors.accentFill,
                    color: colors.onAccentFill,
                    fontFamily: numFont,
                    fontWeight: 700,
                    fontSize: pl.hero ? 30 : 26,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Bidi dir={digits === "latin" ? "ltr" : "rtl"}>{formatNumber(i + 1, { digits })}</Bidi>
                </div>
                <div style={{ ...rectStyle(pl.label), display: "flex", alignItems: "center" }}>
                  <ConceptText
                    text={panel.label}
                    theme={theme}
                    role="title"
                    width={pl.label.width}
                    height={pl.label.height}
                    size={pl.hero ? 42 : 34}
                    min={pl.hero ? 26 : 22}
                    lines={1}
                    align={align}
                  />
                </div>
                <div style={{ ...rectStyle(pl.detail), display: "flex", alignItems: "flex-start" }}>
                  <ConceptText
                    text={panel.detail}
                    theme={theme}
                    role="body"
                    width={pl.detail.width}
                    height={pl.detail.height}
                    size={pl.hero ? 34 : 29}
                    min={22}
                    lines={pl.detailLines}
                    color={theme.dim}
                    align={align}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardMorph>
    </div>
  );
};


export const BriefToWorkspace: React.FC<ConceptSceneProps<BriefToWorkspaceData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
