import React from "react";
import { CameraMotionBlur, Trail } from "@remotion/motion-blur";
import { AbsoluteFill, Freeze } from "remotion";
import { clamp01, useClock } from "./motion";
import { useProbe } from "./safe";













export const SUB_EXPOSURE_HZ = 360;






export const MAX_SAMPLES = 9;
export const MAX_LAYERS = 5;



export const MAX_ANGLE = 1440;









export const SHUTTER = {
  off: 0,
  crisp90: 90,
  film180: 180,
  smear270: 270,
  open360: 360,
  echo720: 720,
} as const;
export type ShutterPreset = keyof typeof SHUTTER;



export const SPEED = {
  still: 8,
  quick: 18,
  fast: 45,
} as const;


export const BLUR_THRESHOLD_PX = SPEED.still;




export type Shutter = {

  readonly angle: number;



  readonly fps: number;

  readonly spanFrames: number;

  readonly spanSec: number;

  readonly samples: number;


  readonly layers: number;

  readonly lagInFrames: number;



  readonly reachFrames: number;








  readonly trailOpacity: number;






  readonly subFrame: boolean;
};


export type ShutterLike = ShutterPreset | number | Shutter;





























export const shutterFor = (fps: number, angle: number | ShutterPreset = "film180"): Shutter => {
  const requested = typeof angle === "number" ? angle : SHUTTER[angle];
  const deg = Math.min(MAX_ANGLE, Math.max(0, Number.isFinite(requested) ? requested : 0));
  const spanFrames = deg / 360;
  const spanSec = spanFrames / fps;
  const reach = Math.round(spanFrames);
  const layers = reach < 1 ? 0 : Math.min(MAX_LAYERS, reach + 1);
  const samples = deg <= 0 ? 1 : Math.min(MAX_SAMPLES, Math.max(1, Math.round((spanFrames * SUB_EXPOSURE_HZ) / fps)));
  const lagInFrames = layers >= 2 ? 1 : 0;
  return {
    angle: deg,
    fps,
    spanFrames,
    spanSec,
    samples,
    layers,
    lagInFrames,
    reachFrames: layers >= 2 ? lagInFrames * (layers - 1) : 0,



    trailOpacity: layers >= 2 ? clamp01(spanFrames / (lagInFrames * (layers - 1))) : 0,
    subFrame: deg > 0 && reach < 1,
  };
};



const resolveShutter = (fps: number, s: ShutterLike): Shutter => (typeof s === "object" ? s : shutterFor(fps, s));


export const useShutter = (angle: number | ShutterPreset = "film180"): Shutter => {
  const { fps } = useClock();
  return shutterFor(fps, angle);
};





export const subtreeRenders = (s: Shutter, device: "smear" | "camera"): number =>
  device === "smear" ? (s.layers >= 2 ? s.layers + 1 : 1) : Math.max(1, s.samples);

























export const speedOf = (pxPerFrame: number): ShutterPreset => {
  const v = Math.abs(pxPerFrame);

  if (!(v > SPEED.still)) return "off";
  if (v < SPEED.fast) return "film180";
  return "smear270";
};







export const speedDevice = (pxPerFrame: number): "off" | "camera" | "smear" => {
  const v = Math.abs(pxPerFrame);
  if (!(v > SPEED.still)) return "off";
  return v < SPEED.quick ? "camera" : "smear";
};



export const shutterForSpeed = (fps: number, pxPerFrame: number): Shutter => shutterFor(fps, speedOf(pxPerFrame));



export type SmearProps = {
  children?: React.ReactNode;

  shutter?: ShutterLike;


  layers?: number;

  lagInFrames?: number;

  trailOpacity?: number;

  enabled?: boolean;
};















export const Smear: React.FC<SmearProps> = ({ children, shutter = "film180", layers, lagInFrames, trailOpacity, enabled = true }) => {

  const probe = useProbe();
  const { frame, fps } = useClock();
  const s = resolveShutter(fps, shutter);



  const asked = Math.round(layers ?? s.layers);
  const capped = Number.isFinite(asked) ? Math.min(MAX_LAYERS, Math.max(0, asked)) : 0;




  const lagAsked = Math.round(lagInFrames ?? s.lagInFrames);
  const lag = Number.isFinite(lagAsked) ? Math.max(1, lagAsked) : 1;
  const n = Math.min(capped, Math.max(0, Math.floor(frame / lag) + 1));
  const weight = clamp01(trailOpacity ?? s.trailOpacity);
  const live = enabled && n >= 2 && weight > 0.001;
  if (probe) {


    const back = live ? lag * (n - 1) : 0;
    return (
      <AbsoluteFill>
        {back > 0 ? <Freeze frame={frame - back}>{children}</Freeze> : null}
        {children}
      </AbsoluteFill>
    );
  }
  if (!live) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <Trail layers={n} lagInFrames={lag} trailOpacity={weight}>
      {children}
    </Trail>
  );
};

export type CameraBlurProps = {
  children?: React.ReactNode;


  shutter?: ShutterLike;

  samples?: number;

  enabled?: boolean;
};


















export const CameraBlur: React.FC<CameraBlurProps> = ({ children, shutter = "film180", samples, enabled = true }) => {
  const probe = useProbe();
  const { frame, fps } = useClock();
  const s = resolveShutter(fps, shutter);
  const angle = Math.min(360, Math.max(0, s.angle));
  const asked = Math.round(samples ?? s.samples);
  const n = Number.isFinite(asked) ? Math.min(MAX_SAMPLES, Math.max(1, asked)) : 1;

  const live = enabled && angle > 0 && n >= 2;
  const shell = (inner: React.ReactNode) => (
    <AbsoluteFill style={{ isolation: "isolate" }}>
      <AbsoluteFill>{inner}</AbsoluteFill>
    </AbsoluteFill>
  );
  if (probe) {




    return shell(
      <>
        {live ? <Freeze frame={frame + 1}>{children}</Freeze> : null}
        {children}
      </>,
    );
  }
  if (!live) return shell(children);
  return (
    <CameraMotionBlur shutterAngle={angle} samples={n}>
      {children}
    </CameraMotionBlur>
  );
};
