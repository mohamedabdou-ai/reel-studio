import React from "react";
import { AbsoluteFill } from "remotion";
import { EASE, clamp01, px, useClock } from "./motion";
import { FRAME, useProbe } from "./safe";
import { clipPathAt, windowProgress, type Dir, type Ease, type MaskMode, type MaskShape, type Rect } from "./mask-geo";







export const LayerBox: React.FC<{ box?: Rect; clip?: boolean; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  box,
  clip = false,
  style,
  children,
}) => {
  const overflow = clip ? "hidden" : style?.overflow;
  if (!box) return <AbsoluteFill style={{ ...style, overflow }}>{children}</AbsoluteFill>;
  return (
    <div
      style={{
        ...style,
        position: "absolute",
        left: px(box.x),
        top: px(box.y),
        width: px(box.width),
        height: px(box.height),
        overflow,
      }}
    >
      {children}
    </div>
  );
};

export type ClipRevealProps = {

  dir?: Dir;

  shape?: MaskShape;

  mode?: MaskMode;

  progress?: number;

  at?: number;

  durF?: number;

  ease?: Ease;

  box?: Rect;

  slantDeg?: number;

  origin?: { x: number; y: number };
  style?: React.CSSProperties;
  children?: React.ReactNode;
};











export const ClipReveal: React.FC<ClipRevealProps> = ({
  dir = "rtl",
  shape = "inset",
  mode = "in",
  progress,
  at = 0,
  durF = 12,
  ease = EASE.inOut,
  box,
  slantDeg,
  origin,
  style,
  children,
}) => {

  const probe = useProbe();
  const { frame } = useClock();
  const raw = progress !== undefined ? progress : windowProgress(frame, at, durF, ease);
  const p = Number.isFinite(raw) ? clamp01(raw) : 0;
  if (mode === "in" ? p <= 0 : p >= 1) return null;
  const rest = probe !== null || (mode === "in" ? p >= 1 : p <= 0);
  const clipPath = rest
    ? undefined
    : clipPathAt({
        dir,
        shape,
        p,
        mode,
        slantDeg,
        origin,
        width: box?.width ?? FRAME.width,
        height: box?.height ?? FRAME.height,
      });
  return (
    <LayerBox box={box} style={{ ...style, clipPath }}>
      {children}
    </LayerBox>
  );
};
