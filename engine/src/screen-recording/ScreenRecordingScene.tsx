import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CanvasFill, useProbe } from "../core/safe";
import { Footage } from "../core/plate";
import { clamp01, EASE, toFrame } from "../core/motion";
import { calloutState, circleAround, CALLOUT_PAD, CLICK_RIPPLE_SEC } from "../motion-library/capture";
import { useSceneTheme } from "../creative-kit/chapter-theme";
import type { StyleFamily } from "../creative-kit/schema";
import type { ScreenRecordingSceneData } from "./schema";
import { screenRectToFrame, screenTrackPose, SCREEN_VIEWPORT_TOP } from "./pose";

export type PreparedPlate = { src: string; width: number; height: number };
const PlateContext = React.createContext<PreparedPlate | null>(null);


export const PreparedPlateProvider: React.FC<{ plate: PreparedPlate; children?: React.ReactNode }> = ({ plate, children }) => (
  <PlateContext.Provider value={plate}>{children}</PlateContext.Provider>
);

const EDGE = 4;
const RIPPLE_R0 = 12;
const RIPPLE_R1 = 48;

export const ScreenRecordingScene: React.FC<{ scene: ScreenRecordingSceneData; style: StyleFamily }> = ({ scene, style }) => {
  const plate = React.useContext(PlateContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const probe = useProbe();
  const theme = useSceneTheme(style);
  if (!plate) throw new Error("screen-recording scenes render inside PreparedEdit (PreparedPlateProvider is missing).");
  const pose = screenTrackPose(frame, scene.data.keys, { width: plate.width, height: plate.height });
  const top = SCREEN_VIEWPORT_TOP + pose.top;
  const rippleF = Math.max(2, toFrame(CLICK_RIPPLE_SEC, fps));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <CanvasFill background={theme.background} />
      <div style={{ position: "absolute", left: pose.left, top, width: pose.width, height: pose.height, overflow: "hidden" }}>
        {
                                                                   }
        <Footage src={plate.src} muted startFromSec={scene.fromFrame / fps} style={{ width: "100%", height: "100%" }} />
      </div>
      {probe ? null : (
        <div style={{ position: "absolute", left: pose.left - EDGE, top: top - EDGE, width: pose.width + 2 * EDGE, height: pose.height + 2 * EDGE, border: `${EDGE}px solid ${theme.text}`, boxSizing: "border-box" }} />
      )}
      <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {scene.data.callouts.map((callout, index) => {
          const state = calloutState({ atFrame: callout.atFrame, untilFrame: callout.untilFrame, kind: callout.kind, rect: callout.rect }, frame, fps, !!probe);
          if (!state) return null;
          const box = screenRectToFrame(callout.rect, pose);
          let d: string;
          if (callout.kind === "circle") {
            const c = circleAround(box);
            const cx = c.left + c.radius, cy = c.top + c.radius;
            d = `M ${cx + c.radius} ${cy} A ${c.radius} ${c.radius} 0 1 0 ${cx - c.radius} ${cy} A ${c.radius} ${c.radius} 0 1 0 ${cx + c.radius} ${cy}`;
          } else {
            const x0 = box.x - CALLOUT_PAD, y0 = box.y - CALLOUT_PAD, x1 = box.x + box.width + CALLOUT_PAD, y1 = box.y + box.height + CALLOUT_PAD;
            d = `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`;
          }
          const dash = { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - state.draw } as const;
          return (
            <g key={`callout-${index}`} opacity={state.opacity}>
              <path d={d} fill="none" stroke={theme.accent} strokeWidth={14} strokeLinejoin="round" strokeLinecap="round" {...dash} />
              <path d={d} fill="none" stroke={theme.text} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" {...dash} />
            </g>
          );
        })}
        {probe
          ? null
          : scene.data.clicks.map((click, index) => {
              const p = clamp01((frame - click.atFrame + 1) / rippleF);
              if (frame < click.atFrame || p >= 1) return null;
              const e = EASE.land(p);
              const r = RIPPLE_R0 + (RIPPLE_R1 - RIPPLE_R0) * e;
              const cx = pose.left + click.x * pose.width, cy = top + click.y * pose.height;
              return (
                <g key={`click-${index}`} opacity={1 - e}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.accent} strokeWidth={12} />
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.text} strokeWidth={4} />
                </g>
              );
            })}
      </svg>
    </AbsoluteFill>
  );
};
