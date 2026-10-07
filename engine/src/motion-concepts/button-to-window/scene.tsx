import React from "react";
import { CardMorph } from "../../core/transitions-dir";
import { ARABIC_PERCENT, formatNumber } from "../../core/numbers";
import { px } from "../../core/motion";
import { seg } from "../timeline.ts";
import {
  Bidi,
  ConceptIcon,
  ConceptStage,
  ConceptText,
  Dressing,
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
import { MIN_FRAMES, layoutFor, stateAt, type ButtonToWindowParams } from "./math.ts";
import type { ButtonToWindowData } from "./schema.ts";


const POINTER = "M0 0 L0 46 L12 35 L21 56 L30 52 L21 32 L38 32 Z";

const TICK = "M19 33 L28 42 L45 23";

const BADGE_BORDER = 2;
const BADGE_PAD = 8;

const Scene: React.FC<{ data: ButtonToWindowData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);

  const rtl = dirOf(data.ctaLabel) === "rtl";
  const params: ButtonToWindowParams = { mode, box, rtl, pillK: shape.pillK, windowRadius: shape.windowRadius };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const W = L.window.width;
  const H = L.window.height;


  const q = seg(S.p, 0.1, 0.6);
  const fill = tint(colors.accentFill, theme.card, q);
  const ring = tint(shape.soft ? colors.accentFill : theme.border, theme.border, q);
  const digits = digitsFor(data.ctaLabel);
  const numFont = numberFont(theme, digits);
  const radius = (h: number) => Math.round((h * shape.pillK) / 2);
  const cx = L.window.x + W / 2;
  const cy = L.window.y + H / 2;
  const dip = 1 - 0.05 * S.press * (1 - S.p);

  return (
    <>
      {                                                                                      }
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", transform: `scale(${dip})`, transformOrigin: `${cx}px ${cy}px` }}>
        <CardMorph
          from={{ ...L.button, radius: L.buttonRadius }}
          to={{ ...L.window, radius: shape.windowRadius }}
          progress={S.p}
          fit="crop"
          background={fill}
          shadow={surfaceShadow(theme, ring)}
        >
          {                                             }
          {S.label > 0.001 ? (
            <div
              style={{
                ...rectStyle(L.label),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: S.label,
                transform: `scale(${S.labelScale})`,
              }}
            >
              <ConceptText
                text={data.ctaLabel}
                theme={theme}
                role="title"
                width={L.label.width}
                height={L.label.height}
                size={50}
                min={28}
                lines={1}
                color={colors.onAccentFill}
                align="center"
              />
            </div>
          ) : null}

          {                                     }
          {S.chrome > 0.001 ? (
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: S.chrome }}>
              <div style={{ position: "absolute", left: 0, top: L.bar.height - 2, width: W, height: 2, background: theme.border }} />
              <div style={rectStyle(L.icon)}>
                <ConceptIcon src={data.productIcon} name={data.productName} size={L.icon.width} theme={theme} />
              </div>
              <div style={{ ...rectStyle(L.name), display: "flex", alignItems: "center" }}>
                <ConceptText
                  text={data.productName}
                  theme={theme}
                  role="title"
                  width={L.name.width}
                  height={L.name.height}
                  size={40}
                  min={24}
                  lines={1}
                  align={rtl ? "right" : "left"}
                />
              </div>
              {                                                                                                                           }
              {data.badge ? (
                <div
                  style={{
                    ...rectStyle(L.badge),
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `${BADGE_BORDER}px solid ${theme.good}`,
                    borderRadius: radius(L.badge.height),
                    background: alpha(theme.good, 0.14),
                  }}
                >
                  <ConceptText
                    text={data.badge}
                    theme={theme}
                    role="label"
                    width={L.badge.width - 2 * (BADGE_BORDER + BADGE_PAD)}
                    height={L.badge.height - 2 * BADGE_BORDER}
                    size={22}
                    min={14}
                    lines={1}
                    color={theme.good}
                    align="center"
                  />
                </div>
              ) : null}

              {data.progressLabel ? (
                <div style={rectStyle(L.progressLabel)}>
                  <ConceptText
                    text={data.progressLabel}
                    theme={theme}
                    role="label"
                    width={L.progressLabel.width}
                    height={L.progressLabel.height}
                    size={30}
                    min={20}
                    lines={1}
                    color={theme.dim}
                    align={rtl ? "right" : "left"}
                  />
                </div>
              ) : null}
              <div
                style={{
                  ...rectStyle(L.pct),
                  display: "flex",
                  alignItems: "center",


                  justifyContent: rtl ? "flex-start" : "flex-end",
                  fontFamily: numFont,
                  fontWeight: 700,
                  fontSize: 34,
                  fontVariantNumeric: "tabular-nums",
                  color: theme.text,
                }}
              >
                <Bidi dir={digits === "latin" ? "ltr" : "rtl"}>
                  {formatNumber(S.pct, { digits, suffix: digits === "arabic-indic" ? ARABIC_PERCENT : "%" })}
                </Bidi>
              </div>
              <div
                style={{
                  ...rectStyle(L.track),
                  boxSizing: "border-box",
                  border: `2px solid ${theme.border}`,
                  borderRadius: radius(L.track.height),
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    ...(rtl ? { right: 0 } : { left: 0 }),
                    width: px((L.track.width - 4) * S.fill),
                    background: colors.accentFill,
                  }}
                />
              </div>
            </div>
          ) : null}

          {                                                                                  }
          {data.previewLines.map((line, i) => {
            const row = S.rows[i];
            if (row.presence <= 0.001) return null;
            const r = L.rows[i];
            return (
              <div key={i} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: row.presence, transform: `translateY(${px(row.dy)}px)` }}>
                <div
                  style={{
                    ...rectStyle(r.card),
                    boxSizing: "border-box",
                    border: `2px solid ${theme.border}`,
                    borderRadius: Math.round(shape.windowRadius * 0.6),
                    background: tint(theme.card, theme.background, 0.6),
                  }}
                />
                <svg style={rectStyle(r.icon)} viewBox="0 0 64 64" width={r.icon.width} height={r.icon.height}>
                  <circle cx={32} cy={32} r={28} fill={alpha(theme.good, 0.18 * row.check)} stroke={tint(theme.dim, theme.good, row.check)} strokeWidth={4} />
                  <path d={TICK} fill="none" stroke={theme.good} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - row.check} />
                </svg>
                <div style={{ ...rectStyle(r.text), display: "flex", alignItems: "center" }}>
                  {                                                                                                                                                }
                  <ConceptText text={line} theme={theme} role="body" width={r.text.width} height={r.text.height} size={44} min={26} lines={2} align={rtl ? "right" : "left"} />
                </div>
              </div>
            );
          })}
        </CardMorph>
      </div>

      {                                                                        }
      {S.ripple.opacity > 0 ? (
        <Dressing>
          <div
            style={{
              position: "absolute",
              left: px(L.tip.x - L.rippleRadius * S.ripple.p),
              top: px(L.tip.y - L.rippleRadius * S.ripple.p),
              width: px(2 * L.rippleRadius * S.ripple.p),
              height: px(2 * L.rippleRadius * S.ripple.p),
              boxSizing: "border-box",
              border: `4px solid ${colors.accentInk}`,
              borderRadius: "50%",
              opacity: S.ripple.opacity,
            }}
          />
        </Dressing>
      ) : null}
      {S.cursor.opacity > 0 ? (
        <svg
          width={52}
          height={64}
          viewBox="0 0 52 64"
          style={{ position: "absolute", left: px(L.tip.x), top: px(L.tip.y), opacity: S.cursor.opacity, transform: `scale(${S.cursor.scale})`, transformOrigin: "0 0", overflow: "visible" }}
        >
          <path d={POINTER} fill={theme.text} stroke={theme.card} strokeWidth={3} strokeLinejoin="round" />
        </svg>
      ) : null}
    </>
  );
};


export const ButtonToWindow: React.FC<ConceptSceneProps<ButtonToWindowData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
