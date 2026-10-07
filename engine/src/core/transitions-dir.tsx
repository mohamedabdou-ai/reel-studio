import React from "react";
import { AbsoluteFill } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { EASE, clamp01, inWindow, px, useClock } from "./motion";
import { CameraBlur, Smear, speedDevice, speedOf, type ShutterLike } from "./mblur";
import { FRAME, useProbe } from "./safe";
import type { ProbeRole } from "./draw";
import { LayerBox } from "./mask";
import {
  cardFit,
  lightBand,
  presentationCall,
  rectMorph,
  scanGradient,
  scanOpacity,
  toRemotionDirection,
  whipFade,
  whipOffset,
  whipPeakSpeed,
  whipProgress,
  windowProgress,
  type CardFit,
  type Dir,
  type Ease,
  type MaskMode,
  type MorphRect,
  type PresentationName,
  type PresentationPhase,
  type Rect,
} from "./mask-geo";



export type WhipPanProps = {

  dir: Dir;

  at: number;

  durF?: number;

  mode?: MaskMode;


  distance?: number;


  fadeF?: number;



  device?: "smear" | "camera";

  shutter?: ShutterLike;

  box?: Rect;
  children?: React.ReactNode;
};

const WhipPanBody: React.FC<{
  dir: Dir;
  at: number;
  durF: number;
  mode: MaskMode;
  distance: number;
  fadeF: number;
  children?: React.ReactNode;
}> = ({ dir, at, durF, mode, distance, fadeF, children }) => {

  const { frame } = useClock();
  const o = whipOffset(dir, distance, whipProgress(frame, at, durF, mode), mode);
  const opacity = whipFade(frame, at, durF, fadeF, mode);
  return <AbsoluteFill style={{ transform: `translate(${px(o.x)}px, ${px(o.y)}px)`, opacity }}>{children}</AbsoluteFill>;
};






export const WhipPan: React.FC<WhipPanProps> = ({
  dir,
  at,
  durF = 8,
  mode = "in",
  distance = 240,
  fadeF = 2,
  device = "smear",
  shutter,
  box,
  children,
}) => {
  const probe = useProbe();
  const { frame } = useClock();
  const a = Math.round(at);
  const d = Math.max(1, Math.round(durF));
  const present = mode === "in" ? frame >= a : frame < a + d;
  if (!present) return null;
  if (probe !== null) {
    return (
      <LayerBox box={box}>
        <AbsoluteFill>{children}</AbsoluteFill>
      </LayerBox>
    );
  }

  const peak = whipPeakSpeed(distance, d, mode);
  const live = inWindow(frame, a, a + d) && speedDevice(peak) !== "off";
  const s = shutter ?? speedOf(peak);
  const body = (
    <WhipPanBody dir={dir} at={a} durF={d} mode={mode} distance={distance} fadeF={fadeF}>
      {children}
    </WhipPanBody>
  );
  return (
    <LayerBox box={box}>
      {device === "camera" ? (
        <CameraBlur shutter={s} enabled={live}>
          {body}
        </CameraBlur>
      ) : (
        <Smear shutter={s} enabled={live}>
          {body}
        </Smear>
      )}
    </LayerBox>
  );
};



export type LightScanProps = {

  bounds: Rect;

  at: number;

  durF?: number;

  dir?: Dir;

  color?: string;

  core?: string;

  thickness?: number;

  peak?: number;

  ease?: Ease;
  blend?: React.CSSProperties["mixBlendMode"];
};






export const LightScan: React.FC<LightScanProps> = ({
  bounds,
  at,
  durF = 12,
  dir = "rtl",
  color = "#FFFFFF",
  core,
  thickness = 44,
  peak = 1,
  ease = EASE.inOut,
  blend,
}) => {
  const probe = useProbe();
  const { frame } = useClock();
  const opacity = clamp01(peak) * scanOpacity(frame, at, durF);
  if (probe !== null || opacity <= 0) return null;
  const band = lightBand(dir, windowProgress(frame, at, durF, ease), bounds, thickness);
  return (
    <div
      style={{
        position: "absolute",
        left: px(bounds.x),
        top: px(bounds.y),
        width: px(bounds.width),
        height: px(bounds.height),
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: px(band.x - bounds.x),
          top: px(band.y - bounds.y),
          width: px(band.width),
          height: px(band.height),
          background: scanGradient(band.gradientDeg, color, core),
          opacity,
          mixBlendMode: blend,
        }}
      />
    </div>
  );
};



export type CardMorphProps = {

  from: MorphRect;

  to: MorphRect;

  at?: number;

  durF?: number;

  progress?: number;

  ease?: Ease;


  fit?: CardFit;

  background?: string;



  backgroundRole?: ProbeRole;

  shadow?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};


export const CardMorph: React.FC<CardMorphProps> = ({
  from,
  to,
  at = 0,
  durF = 14,
  progress,
  ease = EASE.bezierMorph,
  fit = "scale",
  background,
  backgroundRole = "content",
  shadow,
  style,
  children,
}) => {
  const probe = useProbe();
  const { frame } = useClock();
  const raw = progress !== undefined ? progress : windowProgress(frame, at, durF, ease);
  const p = probe !== null ? 1 : Number.isFinite(raw) ? clamp01(raw) : 0;
  const r = rectMorph(from, to, p);
  const w = Math.max(1, px(r.width));
  const h = Math.max(1, px(r.height));
  const f = cardFit(w, h, to, fit);
  let fill = background;
  if (probe !== null && background !== undefined) {
    fill = backgroundRole === "ground" ? probe : backgroundRole === "decoration" ? undefined : background;
  }
  return (
    <div
      style={{
        ...style,
        position: "absolute",
        left: px(r.x),
        top: px(r.y),
        width: w,
        height: h,
        borderRadius: px(r.radius),
        overflow: "hidden",
        background: fill,
        boxShadow: shadow,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: px(to.width),
          height: px(to.height),
          transformOrigin: "0 0",
          transform: `translate(${px(f.dx)}px, ${px(f.dy)}px) scale(${f.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
};



export type PresentationLayerProps = {
  presentation: PresentationName;


  direction?: Dir;

  phase?: PresentationPhase;

  progress?: number;

  at?: number;

  durF?: number;

  ease?: Ease;


  box?: Rect;

  perspective?: number;
  children?: React.ReactNode;
};

const noop = (): void => undefined;


const renderPresentation = <P extends Record<string, unknown>>(
  pres: TransitionPresentation<P>,
  call: { presentationDirection: PresentationPhase; presentationProgress: number },
  durationInFrames: number,
  children: React.ReactNode,
): React.ReactNode => {
  const Comp = pres.component as React.ComponentType<TransitionPresentationComponentProps<P>>;
  const props: TransitionPresentationComponentProps<P> = {
    presentationProgress: call.presentationProgress,
    presentationDirection: call.presentationDirection,
    presentationDurationInFrames: durationInFrames,
    passedProps: pres.props,
    onElementImage: noop,
    onUnmount: noop,
    bothEnteringAndExiting: false,
    children,
  };
  return <Comp {...props} />;
};







export const PresentationLayer: React.FC<PresentationLayerProps> = ({
  presentation,
  direction = "rtl",
  phase = "entering",
  progress,
  at = 0,
  durF = 15,
  ease = EASE.inOut,
  box,
  perspective,
  children,
}) => {
  const probe = useProbe();
  const { frame } = useClock();
  const d = Math.max(1, Math.round(durF));
  const raw = progress !== undefined ? progress : windowProgress(frame, at, d, ease);
  const p = Number.isFinite(raw) ? clamp01(raw) : 0;
  if (phase === "entering" ? p <= 0 : p >= 1) return null;
  const shown = probe !== null ? (phase === "entering" ? 1 : 0) : p;
  const call = presentationCall(presentation, phase, shown);
  const width = box?.width ?? FRAME.width;
  const height = box?.height ?? FRAME.height;
  const rd = toRemotionDirection(direction);
  let layer: React.ReactNode;
  switch (presentation) {
    case "slide":
      layer = renderPresentation(slide({ direction: rd }), call, d, children);
      break;
    case "wipe":
      layer = renderPresentation(wipe({ direction: rd }), call, d, children);
      break;
    case "flip":
      layer = renderPresentation(flip({ direction: rd, perspective }), call, d, children);
      break;
    case "clockWipe":
      layer = renderPresentation(clockWipe({ width, height }), call, d, children);
      break;
    case "iris":
      layer = renderPresentation(iris({ width, height }), call, d, children);
      break;
    case "fade":
      layer = renderPresentation(fade(), call, d, children);
      break;
    default:
      throw new Error(`core/transitions-dir: unknown presentation ${JSON.stringify(presentation)}`);
  }
  return (
    <LayerBox box={box} clip={box !== undefined}>
      {layer}
    </LayerBox>
  );
};
