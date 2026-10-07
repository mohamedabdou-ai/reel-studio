import React from "react";
import { useClock } from "./motion";
import { ContinuousWindowPlate, WindowPlate } from "./plate";
import { CanvasFill, DEFAULT_PROFILE, FRAME, useProbe, zone, type ProfileId } from "./safe";
import {
  curtainAt,
  settleCurtainForProbe,
  sourceBoxToCanvas,
  type CurtainOptions,
  type CurtainState,
  type NormBox,
} from "./window-geo.ts";


export const useCurtain = (options: CurtainOptions): CurtainState => {
  const { frame } = useClock();
  const probe = useProbe();
  const state = curtainAt(frame, options);
  return probe ? settleCurtainForProbe(state, options) : state;
};

export type CurtainPlateProps = {
  src: string;
  options: CurtainOptions;

  sourceAspect?: number;
  startFromSec?: number;


  audio?: "continuous" | "plate" | "muted";
};


export const CurtainPlate: React.FC<CurtainPlateProps> = ({
  src,
  options,
  sourceAspect = 16 / 9,
  startFromSec = 0,
  audio = "continuous",
}) => {
  const { geo } = useCurtain(options);
  if (audio === "continuous")
    return <ContinuousWindowPlate src={src} geo={geo} sourceAspect={sourceAspect} startFromSec={startFromSec} />;
  return <WindowPlate src={src} geo={geo} sourceAspect={sourceAspect} startFromSec={startFromSec} muted={audio === "muted"} />;
};



export type CurtainHeadGuard = { box: NormBox; sourceAspect: number; marginPx?: number };

export type CurtainPanelProps = {
  options: CurtainOptions;

  background: string;

  contentTop?: number;
  profile?: ProfileId;

  head?: CurtainHeadGuard;


  children?: React.ReactNode;
};


export const CurtainPanel: React.FC<CurtainPanelProps> = ({
  options,
  background,
  contentTop,
  profile = DEFAULT_PROFILE,
  head,
  children,
}) => {
  const probe = useProbe();
  const { frame } = useClock();
  const s = useCurtain(options);
  if (head) {
    const headTop = sourceBoxToCanvas(s.geo, head.sourceAspect, head.box).y;
    if (headTop < s.seamY + (head.marginPx ?? 0))
      throw new Error(
        `core/curtain: the panel seam (${s.seamY}px) enters the head box (top ${headTop.toFixed(1)}px) at frame ${frame}. ` +
          "Move the crop down (split.videoTop closer to 0) or the seam up (smaller split.windowTop).",
      );
  }
  if (s.seamY <= 0) return null;
  const panelHeight = options.panelHeight ?? options.split.windowTop;
  const canvasHeight = options.canvasHeight ?? FRAME.height;
  const clipTop = contentTop ?? Math.ceil(zone(profile).top) + 4;
  const clipSeam = probe && s.upperOpacity > 0 ? options.split.windowTop : s.seamY;
  return (
    <>
      <CanvasFill background={background} style={{ height: s.seamY, bottom: "auto" }} />
      {children !== undefined && s.upperOpacity > 0 ? (
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(${clipTop}px 0 ${canvasHeight - clipSeam}px 0)` }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: panelHeight,
              transform: `translateY(${s.panelY}px)`,
              opacity: s.upperOpacity,
            }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
};
