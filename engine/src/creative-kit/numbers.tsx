import React from "react";
import { makePie, makeTriangle } from "@remotion/shapes";
import { circlePath, DrawPath, VectorLayer } from "../core/draw";
import { assertFontsReady, FAMILY } from "../core/fonts";
import { EASE, clamp01, mix, px, useClock, useEnterF } from "../core/motion";
import type { SpringLike } from "../core/motion";
import {
  ARABIC_INDIC_DIGITS,
  assertPlans,
  assertPriceDrop,
  countUpValue,
  defaultGaugeFormat,
  deltaDirection,
  formatNumber,
  gaugeFraction,
  priceDropPhases,
  widthTemplate,
  type DigitSet,
  type NumberFormat,
  type PlanData,
} from "../core/numbers";
import { useProbe } from "../core/safe";
import {
  fitToWidth,
  isArabic,
  isRtlDominant,
  measure,
  type MeasuredStyle,
  type TypeStyle,
} from "../core/type";
import { FitText, type SceneTheme } from "./primitives";

export type NumberAlign = "left" | "center" | "right";


const LABEL_H = 56;
const NOTE_H = 52;





const useLand = (atF: number, preset: SpringLike, fadeF = 4): { lift: number; alpha: number } => {
  const { frame } = useClock();
  const probe = useProbe();
  const lift = useEnterF(atF, preset);
  if (probe) return { lift: 1, alpha: 1 };
  return { lift, alpha: clamp01((frame - atF + 1) / Math.max(1, fadeF)) };
};


const useRampF = (atF: number, durF: number, ease: (p: number) => number = EASE.land): number => {
  const { frame } = useClock();
  const probe = useProbe();
  if (probe) return 1;
  if (frame < atF) return 0;
  return clamp01(ease((frame - atF) / Math.max(1, durF)));
};



export type NumberBoxSpec = {

  values: number[];
  format: NumberFormat;
  maxWidth: number;

  size: number;

  min: number;
};


export type NumberBox = { width: number; height: number; fontSize: number; style: MeasuredStyle };

const DIGITS: Record<DigitSet, readonly string[]> = {
  latin: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  "arabic-indic": ARABIC_INDIC_DIGITS,
};

const fitNumberBox = (spec: NumberBoxSpec, face: { ar: string; display: string; adapted: boolean }): NumberBox => {
  assertFontsReady();
  if (spec.values.length === 0) throw new Error("creative-kit/numbers: a number box needs at least one value");

  const arabic = spec.values.some((v) => isArabic(formatNumber(v, spec.format)));
  const base: TypeStyle = {
    fontFamily: arabic ? face.ar : face.display,
    fontSize: spec.size,

    fontWeight: face.adapted ? (arabic && face.ar === FAMILY.cairo ? 900 : 700) : 800,
    fontVariantNumeric: "tabular-nums",
  };

  const set = DIGITS[spec.format.digits ?? "latin"];
  let glyph = set[8];
  let widest = measure(glyph, base).width;
  for (const d of set) {
    const w = measure(d, base).width;
    if (w > widest + 0.01) {
      widest = w;
      glyph = d;
    }
  }
  const templates = spec.values.map((v) => widthTemplate(v, spec.format, glyph));
  let size = Math.round(spec.size);
  for (const t of templates) {
    const fit = fitToWidth(t, base, spec.maxWidth, { min: spec.min, max: spec.size });
    if (!fit.fits) {
      throw new Error(
        `creative-kit/numbers: ${JSON.stringify(t)} does not fit ${spec.maxWidth}px even at ${spec.min}px. ` +
          `Shorten the prefix/suffix or give the number a wider box.`,
      );
    }
    size = Math.min(size, fit.fontSize);
  }
  let width = 0;
  let height = 1;
  let style: MeasuredStyle | null = null;
  for (const t of templates) {
    const m = measure(t, { ...base, fontSize: size });
    width = Math.max(width, Math.ceil(m.width));
    height = Math.max(height, m.lineBox);
    style = style ?? m.style;
  }
  if (style === null) throw new Error("creative-kit/numbers: no template was measured");
  return {
    width,
    height,
    fontSize: size,
    style: { ...style, lineHeight: `${height}px`, ...(face.adapted ? { fontSynthesis: "none" as const } : {}) },
  };
};





export const useNumberBox = (spec: NumberBoxSpec, theme: SceneTheme): NumberBox => {
  const key = JSON.stringify(spec);
  const { ar, display } = theme;
  const adapted = Boolean(theme.grammar);
  return React.useMemo(
    () => fitNumberBox(JSON.parse(key) as NumberBoxSpec, { ar, display, adapted }),
    [key, ar, display, adapted],
  );
};

export type NumberTextProps = {
  box: NumberBox;
  text: string;
  color: string;
  align?: NumberAlign;
  style?: React.CSSProperties;
};


export const NumberText: React.FC<NumberTextProps> = ({ box, text, color, align = "right", style }) => (
  <div
    style={{
      ...box.style,
      width: box.width,
      height: box.height,
      color,
      textAlign: align,
      direction: isRtlDominant(text) ? "rtl" : "ltr",
      ...style,
    }}
  >
    {text}
  </div>
);


const Caption: React.FC<{
  kind: "label" | "note";
  text?: string;
  theme: SceneTheme;
  top: number;
  width: number;
  align?: NumberAlign;
}> = ({ kind, text, theme, top, width, align }) => {
  if (text === undefined || text.trim().length === 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, top, width }}>
      {kind === "label" ? (
        <FitText text={text} theme={theme} role="title" width={width} height={LABEL_H} size={40} min={22} lines={1} align={align} />
      ) : (
        <FitText text={text} theme={theme} role="label" width={width} height={NOTE_H} size={18} min={13} lines={2} align={align} color={theme.dim} />
      )}
    </div>
  );
};



export type CountUpProps = {
  theme: SceneTheme;

  to: number;

  from?: number;

  at: number;

  durF?: number;

  ease?: (p: number) => number;
  format?: NumberFormat;
  left: number;
  top: number;
  width: number;

  size?: number;

  min?: number;

  align?: NumberAlign;

  color?: string;
  label?: string;
  sourceNote?: string;
};

export const COUNT_UP_LEAD_F = 4;

export const CountUp: React.FC<CountUpProps> = ({
  theme,
  to,
  from = 0,
  at,
  durF = 36,
  ease = EASE.land,
  format,
  left,
  top,
  width,
  size = 160,
  min = 48,
  align = "right",
  color,
  label,
  sourceNote,
}) => {
  const atF = Math.round(at);
  const fmt = format ?? {};
  const { frame } = useClock();
  const probe = useProbe();
  const box = useNumberBox({ values: [from, to], format: fmt, maxWidth: width, size, min }, theme);
  const land = useLand(atF - COUNT_UP_LEAD_F, "card");
  const value = probe ? to : countUpValue(frame, { from, to, atF, durF, ease });
  const numberLeft = align === "left" ? 0 : align === "center" ? px((width - box.width) / 2) : width - box.width;
  const labelTop = box.height + 10;
  const noteTop = labelTop + (label ? LABEL_H + 8 : 0);
  return (
    <div
      style={{
        position: "absolute",
        left: px(left),
        top: px(top),
        width,
        opacity: land.alpha,
        transform: `translateY(${px((1 - land.lift) * 28)}px)`,
      }}
    >
      <NumberText
        box={box}
        text={formatNumber(value, fmt)}
        color={color ?? theme.accentInk ?? theme.accent}
        align={align}
        style={{ position: "absolute", left: numberLeft, top: 0 }}
      />
      <Caption kind="label" text={label} theme={theme} top={labelTop} width={width} align={align} />
      <Caption kind="note" text={sourceNote} theme={theme} top={noteTop} width={width} align={align} />
    </div>
  );
};



export type PriceDropProps = {
  theme: SceneTheme;

  from: number;

  to: number;

  currency?: string;

  suffix?: string;
  decimals?: number;
  digits?: DigitSet;

  at: number;
  holdF?: number;
  strikeDurF?: number;
  labelDelayF?: number;

  toLabel?: string;
  left: number;
  top: number;
  width: number;

  oldSize?: number;

  newSize?: number;
  sourceNote?: string;
};

const STRIKE_PAD = 16;
const PILL_H = 76;
const PILL_MAX_W = 460;

export const PriceDrop: React.FC<PriceDropProps> = ({
  theme,
  from,
  to,
  currency = "$",
  suffix,
  decimals,
  digits,
  at,
  holdF,
  strikeDurF,
  labelDelayF,
  toLabel,
  left,
  top,
  width,
  oldSize = 110,
  newSize = 200,
  sourceNote,
}) => {
  assertPriceDrop(from, to);
  const ph = priceDropPhases(at, { holdF, strikeDurF, labelDelayF });
  const fmt: NumberFormat = { prefix: currency, suffix, decimals, digits };
  const oldBox = useNumberBox({ values: [from], format: fmt, maxWidth: width - 2 * (STRIKE_PAD + 8), size: oldSize, min: 40 }, theme);
  const newBox = useNumberBox({ values: [to], format: fmt, maxWidth: width, size: newSize, min: 60 }, theme);
  const oldLand = useLand(ph.oldInF, "card");
  const strike = useRampF(ph.strikeF, ph.strikeEndF - ph.strikeF, EASE.inOut);
  const newLand = useLand(ph.newInF, "stamp", 3);
  const pillLand = useLand(ph.labelInF, "snap");
  const round = !theme.grammar || theme.grammar.card === "rounded-ui";
  const oldLeft = px((width - oldBox.width) / 2);
  const strikeW = oldBox.width + 2 * STRIKE_PAD;
  const strikeH = oldBox.height;
  const newTop = oldBox.height + 12;
  const pillTop = newTop + newBox.height + 14;
  const pillW = Math.min(width, PILL_MAX_W);

  const noteTop = pillTop + (toLabel ? PILL_H + 24 : 0);
  return (
    <div style={{ position: "absolute", left: px(left), top: px(top), width }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          opacity: oldLand.alpha,
          transform: `translateY(${px((1 - oldLand.lift) * 24)}px)`,
        }}
      >
        <NumberText
          box={oldBox}
          text={formatNumber(from, fmt)}
          color={theme.dim}
          align="center"
          style={{ position: "absolute", left: oldLeft, top: 0, opacity: mix(1, 0.6, strike) }}
        />
        <VectorLayer x={oldLeft - STRIKE_PAD} y={0} width={strikeW} height={strikeH}>
          <DrawPath
            d={`M 0 ${px(strikeH * 0.62)} L ${strikeW} ${px(strikeH * 0.4)}`}
            progress={strike}
            stroke={theme.badInk ?? theme.bad}
            strokeWidth={Math.max(6, px(oldBox.fontSize * 0.08))}
          />
        </VectorLayer>
      </div>
      <NumberText
        box={newBox}
        text={formatNumber(to, fmt)}
        color={theme.accentInk ?? theme.accent}
        align="center"
        style={{
          position: "absolute",
          left: px((width - newBox.width) / 2),
          top: newTop,
          opacity: newLand.alpha,

          transform: `scale(${1 + 0.3 * (1 - newLand.lift)})`,
          transformOrigin: "50% 50%",
        }}
      />
      {toLabel ? (
        <div
          style={{
            position: "absolute",
            left: px((width - pillW) / 2),
            top: pillTop,
            width: pillW,
            height: PILL_H,
            boxSizing: "border-box",
            background: theme.accent,
            border: `3px solid ${theme.border}`,
            borderRadius: round ? PILL_H / 2 : 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: pillLand.alpha,
            transform: `rotate(-2deg) scale(${mix(0.6, 1, pillLand.lift)})`,
          }}
        >
          <FitText
            text={toLabel}
            theme={theme}
            role="title"
            width={pillW - 48}
            height={PILL_H - 16}
            size={46}
            min={22}
            lines={1}
            align="center"
            color={theme.onAccent ?? theme.text}
          />
        </div>
      ) : null}
      {                                                                                  }
      <div style={{ position: "absolute", left: 0, top: 0, width, opacity: oldLand.alpha }}>
        <Caption kind="note" text={sourceNote} theme={theme} top={noteTop} width={width} align="center" />
      </div>
    </div>
  );
};



export type DeltaProps = {
  theme: SceneTheme;

  value: number;

  unit?: string;
  decimals?: number;
  digits?: DigitSet;

  goodWhen?: "up" | "down";

  at: number;

  durF?: number;
  left: number;
  top: number;
  width: number;

  size?: number;

  min?: number;

  align?: "left" | "right";
  label?: string;
  sourceNote?: string;
};

const ARROW_GAP = 20;

export const Delta: React.FC<DeltaProps> = ({
  theme,
  value,
  unit,
  decimals,
  digits,
  goodWhen = "up",
  at,
  durF = 18,
  left,
  top,
  width,
  size = 110,
  min = 40,
  align = "right",
  label,
  sourceNote,
}) => {
  const dir = deltaDirection(value, decimals ?? 0);
  const atF = Math.round(at);
  const magnitude = Math.abs(value);
  const fmt: NumberFormat = { suffix: unit, decimals, digits };
  const arrow = px(size * 0.5);
  const { frame } = useClock();
  const probe = useProbe();
  const box = useNumberBox({ values: [0, magnitude], format: fmt, maxWidth: width - arrow - ARROW_GAP - 8, size, min }, theme);
  const land = useLand(atF - 2, "snap");
  const draw = useRampF(atF, 8, EASE.land);
  const fill = useRampF(atF + 6, 5, EASE.land);
  const shown = probe ? magnitude : countUpValue(frame, { from: 0, to: magnitude, atF: atF + 2, durF, ease: EASE.land });
  const color = dir === "flat" ? theme.dim : dir === goodWhen ? theme.good : theme.badInk ?? theme.bad;
  const triH = arrow * Math.sqrt(0.75);


  const tri = dir === "flat" ? null : makeTriangle({ length: arrow, direction: dir, cornerRadius: px(arrow * 0.1) });

  const d = tri
    ? tri.path
    : `M 0 ${px(triH * 0.3)} L ${arrow} ${px(triH * 0.3)} M 0 ${px(triH * 0.7)} L ${arrow} ${px(triH * 0.7)}`;
  const groupW = arrow + ARROW_GAP + box.width;
  const groupLeft = align === "right" ? width - groupW - 4 : 4;
  const captionTop = box.height + 6;
  return (
    <div
      style={{
        position: "absolute",
        left: px(left),
        top: px(top),
        width,
        opacity: land.alpha,
        transform: `translateY(${px((1 - land.lift) * 20)}px)`,
      }}
    >
      <VectorLayer x={groupLeft} y={px((box.height - triH) / 2)} width={arrow} height={px(triH)}>
        <DrawPath
          d={d}
          progress={draw}
          stroke={color}
          strokeWidth={tri ? 4 : Math.max(5, px(arrow * 0.12))}
          fill={tri ? color : "none"}
          fillOpacity={tri ? fill : undefined}
        />
      </VectorLayer>
      <NumberText
        box={box}
        text={formatNumber(shown, fmt)}
        color={color}
        align="left"
        style={{ position: "absolute", left: groupLeft + arrow + ARROW_GAP, top: 0 }}
      />
      <Caption kind="label" text={label} theme={theme} top={captionTop} width={width} align={align} />
      <Caption kind="note" text={sourceNote} theme={theme} top={captionTop + (label ? LABEL_H + 8 : 0)} width={width} align={align} />
    </div>
  );
};



export type RingGaugeProps = {
  theme: SceneTheme;

  value: number;
  max: number;

  at: number;

  durF?: number;

  ease?: (p: number) => number;

  format?: NumberFormat;
  digits?: DigitSet;
  left: number;
  top: number;
  width: number;

  radius?: number;

  thickness?: number;

  color?: string;
  label?: string;
  sourceNote?: string;
};

export const RingGauge: React.FC<RingGaugeProps> = ({
  theme,
  value,
  max,
  at,
  durF = 40,
  ease = EASE.land,
  format,
  digits,
  left,
  top,
  width,
  radius,
  thickness = 28,
  color,
  label,
  sourceNote,
}) => {
  const fraction = gaugeFraction(value, max);
  const fmt = format ?? defaultGaugeFormat(max, digits);
  const atF = Math.round(at);
  const t = Math.max(4, px(thickness));
  const r = px(radius ?? Math.min(170, Math.floor((width - t) / 2)));
  const D = 2 * r + t;
  const { frame } = useClock();
  const probe = useProbe();
  const box = useNumberBox(
    { values: [0, value], format: fmt, maxWidth: px(2 * (r - t / 2) * 0.74), size: px(r * 0.6), min: 24 },
    theme,
  );
  const land = useLand(atF - 6, "card");
  const drawn = useRampF(atF, durF, ease);
  const shown = probe ? value : countUpValue(frame, { from: 0, to: value, atF, durF, ease });
  const ringLeft = px((width - D) / 2);


  const arc = fraction > 0 ? makePie({ radius: r, progress: fraction, closePath: false }).path : null;
  const captionTop = D + 14;
  return (
    <div
      style={{
        position: "absolute",
        left: px(left),
        top: px(top),
        width,
        opacity: land.alpha,
        transform: `translateY(${px((1 - land.lift) * 24)}px)`,
      }}
    >
      <VectorLayer x={ringLeft} y={0} width={D} height={D}>
        <g transform={`translate(${t / 2} ${t / 2})`}>
          <DrawPath d={circlePath({ radius: r }).d} progress={1} stroke={theme.border} strokeOpacity={0.18} strokeWidth={t} />
          {arc ? <DrawPath d={arc} progress={drawn} stroke={color ?? theme.accentInk ?? theme.accent} strokeWidth={t} /> : null}
        </g>
      </VectorLayer>
      <NumberText
        box={box}
        text={formatNumber(shown, fmt)}
        color={theme.text}
        align="center"
        style={{ position: "absolute", left: ringLeft + px((D - box.width) / 2), top: px((D - box.height) / 2) }}
      />
      <Caption kind="label" text={label} theme={theme} top={captionTop} width={width} align="center" />
      <Caption kind="note" text={sourceNote} theme={theme} top={captionTop + (label ? LABEL_H + 8 : 0)} width={width} align="center" />
    </div>
  );
};



export type PlanCardsProps = {
  theme: SceneTheme;

  plans: readonly PlanData[];

  currency?: string;
  decimals?: number;
  digits?: DigitSet;

  at: number;

  stagger?: number;

  featureStagger?: number;

  direction?: "rtl" | "ltr";
  left: number;
  top: number;
  width: number;

  cardHeight?: number;
  sourceNote?: string;
};

export const PLAN_FEATURE_DELAY_F = 10;
const CARD_GAP = 18;
const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;
const NAME_H = 50;
const PERIOD_H = 32;
const BADGE_H = 40;
const BADGE_RESERVE = 40;
const HIGHLIGHT_LIFT = 14;
const ROW_MAX = 84;
const ROW_MIN = 44;
const CHECK_W = 24;
const CHECK_H = 20;
const CHECK_GAP = 10;
const CHECK_D = "M 2 11 L 9 18 L 22 3";

type CardRows = { priceTop: number; periodTop: number; ruleTop: number; featuresTop: number };


const cardRows = (priceHeight: number): CardRows => {
  const priceTop = PAD_TOP + NAME_H + 6;
  const periodTop = priceTop + priceHeight + 2;
  const ruleTop = periodTop + PERIOD_H + 12;
  return { priceTop, periodTop, ruleTop, featuresTop: ruleTop + 16 };
};

const FeatureRow: React.FC<{
  theme: SceneTheme;
  text: string;
  top: number;
  rowH: number;
  innerW: number;
  rtl: boolean;
  atF: number;
}> = ({ theme, text, top, rowH, innerW, rtl, atF }) => {
  const land = useLand(atF, "tight");
  const tick = useRampF(atF, 6, EASE.land);
  return (
    <div
      style={{
        position: "absolute",
        left: PAD_X,
        top,
        width: innerW,
        height: rowH,
        opacity: land.alpha,
        transform: `translateX(${px((1 - land.lift) * (rtl ? 16 : -16))}px)`,
      }}
    >
      <VectorLayer x={rtl ? innerW - CHECK_W : 0} y={8} width={CHECK_W} height={CHECK_H}>
        <DrawPath d={CHECK_D} progress={tick} stroke={theme.good} strokeWidth={4} />
      </VectorLayer>
      <div style={{ position: "absolute", left: rtl ? 0 : CHECK_W + CHECK_GAP, top: 0 }}>
        <FitText
          text={text}
          theme={theme}
          role="body"
          width={innerW - CHECK_W - CHECK_GAP}
          height={rowH - 10}
          size={26}
          min={16}
          lines={2}
          align={rtl ? "right" : "left"}
        />
      </div>
    </div>
  );
};

const PlanCard: React.FC<{
  theme: SceneTheme;
  plan: PlanData;
  left: number;
  top: number;
  width: number;
  height: number;
  atF: number;
  featureStagger: number;
  rows: CardRows;
  rowH: number;
  priceBox: NumberBox;
  priceFormat: NumberFormat;
  rtl: boolean;
  round: boolean;
}> = ({ theme, plan, left, top, width, height, atF, featureStagger, rows, rowH, priceBox, priceFormat, rtl, round }) => {
  const land = useLand(atF, "card");
  const ink = theme.accentInk ?? theme.accent;
  const innerW = width - 2 * PAD_X;
  const radius = round ? 20 : 3;
  const badgeW = Math.min(width - 24, 220);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        background: theme.card,
        borderRadius: radius,
        opacity: land.alpha,
        transform: `translateY(${px((1 - land.lift) * 48)}px)`,
      }}
    >
      {                                                                                   }
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          border: `${plan.highlight ? 4 : 2}px solid ${plan.highlight ? ink : theme.border}`,
          borderRadius: radius,
        }}
      />
      {plan.badge ? (
        <div
          style={{
            position: "absolute",
            left: px((width - badgeW) / 2),
            top: -BADGE_H / 2,
            width: badgeW,
            height: BADGE_H,
            boxSizing: "border-box",
            background: theme.accent,
            border: `2px solid ${theme.border}`,
            borderRadius: BADGE_H / 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FitText
            text={plan.badge}
            theme={theme}
            role="label"
            width={badgeW - 24}
            height={28}
            size={20}
            min={13}
            lines={1}
            align="center"
            color={theme.onAccent ?? theme.text}
          />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: PAD_X, top: PAD_TOP }}>
        <FitText text={plan.name} theme={theme} role="title" width={innerW} height={NAME_H} size={36} min={20} lines={1} align="center" />
      </div>
      <NumberText
        box={priceBox}
        text={formatNumber(plan.price, priceFormat)}
        color={plan.highlight ? ink : theme.text}
        align="center"
        style={{ position: "absolute", left: PAD_X + px((innerW - priceBox.width) / 2), top: rows.priceTop }}
      />
      {plan.period ? (
        <div style={{ position: "absolute", left: PAD_X, top: rows.periodTop }}>
          <FitText text={plan.period} theme={theme} role="label" width={innerW} height={PERIOD_H} size={20} min={14} lines={1} align="center" color={theme.dim} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: PAD_X, top: rows.ruleTop, width: innerW, height: 2, background: theme.border, opacity: 0.35 }} />
      {plan.features.map((feature, j) => (
        <FeatureRow
          key={j}
          theme={theme}
          text={feature}
          top={rows.featuresTop + j * rowH}
          rowH={rowH}
          innerW={innerW}
          rtl={rtl}
          atF={atF + PLAN_FEATURE_DELAY_F + j * featureStagger}
        />
      ))}
    </div>
  );
};

export const PlanCards: React.FC<PlanCardsProps> = ({
  theme,
  plans,
  currency = "$",
  decimals,
  digits,
  at,
  stagger = 6,
  featureStagger = 3,
  direction = "rtl",
  left,
  top,
  width,
  cardHeight = 600,
  sourceNote,
}) => {
  assertPlans(plans);
  const n = plans.length;
  const colW = Math.floor((width - CARD_GAP * (n - 1)) / n);
  const innerW = colW - 2 * PAD_X;
  const priceFormat: NumberFormat = { prefix: currency, decimals, digits };

  const priceBox = useNumberBox({ values: plans.map((p) => p.price), format: priceFormat, maxWidth: innerW, size: 88, min: 32 }, theme);
  const atF = Math.round(at);

  const noteLand = useLand(atF, "card");
  const rows = cardRows(priceBox.height);
  const maxFeatures = Math.max(...plans.map((p) => p.features.length));
  const rowH = Math.min(ROW_MAX, Math.floor((cardHeight - rows.featuresTop - PAD_BOTTOM) / maxFeatures));
  if (rowH < ROW_MIN) {
    throw new Error(
      `creative-kit/numbers PlanCards: cardHeight ${cardHeight} leaves ${rowH}px per feature row (< ${ROW_MIN}); raise cardHeight or cut features.`,
    );
  }
  const rtl = direction === "rtl";
  const round = !theme.grammar || theme.grammar.card === "rounded-ui";
  const badgeReserve = plans.some((p) => p.badge !== undefined) ? BADGE_RESERVE : 0;
  const step = Math.max(0, Math.round(stagger));
  const featureStep = Math.max(0, Math.round(featureStagger));
  return (
    <div style={{ position: "absolute", left: px(left), top: px(top), width }}>
      {plans.map((plan, i) => (
        <PlanCard
          key={i}
          theme={theme}
          plan={plan}
          left={rtl ? width - colW - i * (colW + CARD_GAP) : i * (colW + CARD_GAP)}
          top={badgeReserve - (plan.highlight ? HIGHLIGHT_LIFT : 0)}
          width={colW}
          height={cardHeight}
          atF={atF + i * step}
          featureStagger={featureStep}
          rows={rows}
          rowH={rowH}
          priceBox={priceBox}
          priceFormat={priceFormat}
          rtl={rtl}
          round={round}
        />
      ))}
      <div style={{ position: "absolute", left: 0, top: 0, width, opacity: noteLand.alpha }}>
        <Caption kind="note" text={sourceNote} theme={theme} top={badgeReserve + cardHeight + 16} width={width} align="center" />
      </div>
    </div>
  );
};
