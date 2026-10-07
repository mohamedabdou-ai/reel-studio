import React from "react";
import { px } from "../../core/motion";
import { formatNumber, type DigitSet } from "../../core/numbers";
import { NumberText, useNumberBox } from "../../creative-kit/numbers";
import {
  Bidi,
  ConceptStage,
  ConceptText,
  alpha,
  digitsFor,
  dirOf,
  numberFont,
  styleShape,
  surfaceShadow,
  tint,
  uiColors,
  useConcept,
  useConceptTimeline,
} from "../shared";
import type { ConceptSceneProps } from "../types.ts";
import {
  CHIP_ARROW,
  CHIP_SIZE,
  HERO_WASH,
  MIN_FRAMES,
  NAME_MIN,
  NAME_SIZE,
  TILE_COUNT,
  VALUE_MIN,
  VALUE_SIZE,
  changeDirection,
  changeText,
  layoutFor,
  pickInk,
  stateAt,
  valueFormat,
  type KpiZoomParams,
  type Layout,
  type PartPose,
  type Size,
  type TileState,
} from "./math.ts";
import type { KpiTileData, KpiZoomData } from "./schema.ts";


const ARROW_UP = "M12 5 L21 19 L3 19 Z";
const ARROW_DOWN = "M12 19 L21 5 L3 5 Z";
const ARROW_FLAT = "M4 12 L20 12";


const Placed: React.FC<{ slot: Size; pose: PartPose; rtl: boolean; opacity?: number; children: React.ReactNode }> = ({ slot, pose, rtl, opacity = 1, children }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: slot.w,
      height: slot.h,
      display: "flex",
      alignItems: "center",

      justifyContent: rtl ? "flex-end" : "flex-start",
      transformOrigin: "0 0",
      transform: `translate(${px(pose.x)}px, ${px(pose.y)}px) scale(${pose.scale})`,
      opacity,
    }}
  >
    {children}
  </div>
);

const Arrow: React.FC<{ dir: "up" | "down" | "flat"; color: string }> = ({ dir, color }) => (
  <svg width={CHIP_ARROW} height={CHIP_ARROW} viewBox="0 0 24 24" style={{ flex: "none" }}>
    {dir === "flat" ? (
      <path d={ARROW_FLAT} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
    ) : (
      <path d={dir === "up" ? ARROW_UP : ARROW_DOWN} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
    )}
  </svg>
);

type TileProps = {
  tile: KpiTileData;

  unit: string | undefined;
  T: TileState;
  L: Layout;
  rtl: boolean;
  digits: DigitSet;

  ink: string;
};

const Tile: React.FC<TileProps> = ({ tile, unit, T, L, rtl, digits, ink }) => {
  const { theme } = useConcept();
  const colors = uiColors(theme);
  const shape = styleShape(theme);
  const fmt = valueFormat(tile.value, unit, digits);

  const box = useNumberBox({ values: [0, tile.value], format: fmt, maxWidth: L.slots.number.w, size: VALUE_SIZE, min: VALUE_MIN }, theme);
  if (T.presence <= 0.001) return null;

  const u = T.u;
  const fill = tint(theme.card, colors.accentFill, HERO_WASH * u);
  const ring = tint(theme.border, colors.accentInk, u);
  const dir = changeDirection(tile.change);
  const tone = dir === "up" ? theme.good : dir === "down" ? (theme.badInk ?? theme.bad) : theme.dim;
  const align = rtl ? "right" : "left";
  const chipDir = digits === "arabic-indic" ? "rtl" : "ltr";

  return (
    <div
      style={{
        position: "absolute",
        left: T.rect.x,
        top: T.rect.y,
        width: T.rect.width,
        height: T.rect.height,
        borderRadius: px(T.radius),
        overflow: "hidden",

        background: `linear-gradient(${fill}, ${fill}), ${theme.background}`,
        boxShadow: surfaceShadow(theme, ring),
        opacity: T.opacity,
        transform: `translate(${px(T.shift.x)}px, ${px(T.shift.y)}px) scale(${T.scale})`,
      }}
    >
      <Placed slot={L.slots.name} pose={T.parts.name} rtl={rtl}>
        <ConceptText
          text={tile.name}
          theme={theme}
          role="body"
          width={L.slots.name.w}
          height={L.slots.name.h}
          size={NAME_SIZE}
          min={NAME_MIN}
          lines={1}
          color={tint(theme.dim, theme.text, u)}
          align={align}
        />
      </Placed>

      {

                                                                                                            }
      <Placed slot={L.slots.number} pose={T.parts.number} rtl={rtl} opacity={1 - T.dim}>
        <NumberText box={box} text={formatNumber(T.value, fmt)} color={tint(theme.text, ink, u)} align={align} />
      </Placed>

      <Placed slot={L.slots.chip} pose={T.parts.chip} rtl={rtl}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            height: L.slots.chip.h,
            boxSizing: "border-box",
            padding: "0 24px",
            border: `2px solid ${tone}`,
            borderRadius: Math.round((L.slots.chip.h * shape.pillK) / 2),
            background: alpha(tone, 0.14),
            color: tone,
            direction: chipDir,
            fontFamily: numberFont(theme, digits),
            fontWeight: 700,
            fontSize: CHIP_SIZE,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          <Arrow dir={dir} color={tone} />
          <Bidi dir={chipDir}>{changeText(tile.change, T.change, digits)}</Bidi>
        </div>
      </Placed>
    </div>
  );
};

const Scene: React.FC<{ data: KpiZoomData }> = ({ data }) => {
  const { theme, box, mode } = useConcept();
  const { frame, duration } = useConceptTimeline(MIN_FRAMES);
  const shape = styleShape(theme);
  const colors = uiColors(theme);


  const names = data.tiles.map((t) => t.name).join(" ");
  const rtl = dirOf(names) === "rtl";
  const digits = digitsFor(names);
  const params: KpiZoomParams = {
    mode,
    box,
    rtl,
    focusIndex: data.focusIndex,
    values: data.tiles.map((t) => t.value),
    changes: data.tiles.map((t) => t.change),
    windowRadius: shape.windowRadius,
  };
  const L = layoutFor(box, params);
  const S = stateAt(frame, duration, params);
  const ink = pickInk([colors.accentInk, theme.text], tint(theme.card, colors.accentFill, HERO_WASH), theme.background);


  const order = Array.from({ length: TILE_COUNT }, (_, i) => i)
    .filter((i) => i !== data.focusIndex)
    .concat(data.focusIndex);

  return (
    <>
      {order.map((i) => (
        <Tile key={i} tile={data.tiles[i]} unit={i === data.focusIndex ? data.unit : undefined} T={S.tiles[i]} L={L} rtl={rtl} digits={digits} ink={ink} />
      ))}
    </>
  );
};


export const KpiZoom: React.FC<ConceptSceneProps<KpiZoomData>> = ({ style, data, mode, backdrop, caption }) => (
  <ConceptStage style={style} mode={mode} backdrop={backdrop} caption={caption}>
    <Scene data={data} />
  </ConceptStage>
);
