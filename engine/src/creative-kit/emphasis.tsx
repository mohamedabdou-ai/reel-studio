// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { DrawPath, VectorLayer } from "../core/draw";
import { useClock } from "../core/motion";
import { AXIS_LANE, jitter } from "../core/organic";
import { useProbe } from "../core/safe";
import {
  drawProgress,
  markGeometry,
  type LineDirection,
  type MarkKind,
  type MarkRect,
  type Wobble,
} from "./kinetic-words-logic.ts";

export const MARK_DEFAULTS: Record<MarkKind, { dur: number; stroke: (height: number) => number }> = {
  underline: { dur: 8, stroke: (h) => Math.max(4, Math.round(h * 0.08)) },
  strike: { dur: 7, stroke: (h) => Math.max(4, Math.round(h * 0.08)) },
  band: { dur: 9, stroke: (h) => Math.max(8, Math.round(h * 0.6)) },
  circle: { dur: 14, stroke: (h) => Math.max(4, Math.round(h * 0.06)) },
  arrow: { dur: 12, stroke: (h) => Math.max(4, Math.round(h * 0.06)) },
};

export const markWobble = (seed: string): Wobble => [
  jitter(seed, 0, 1, { lane: 0 }),
  jitter(seed, 0, 1, { lane: AXIS_LANE }),
  jitter(seed, 0, 1, { lane: 2 * AXIS_LANE }),
];

export type MarkProps = {
  kind: MarkKind;
  dir: LineDirection;
  target: MarkRect;
  at: number;
  dur?: number;
  color: string;
  strokeWidth?: number;
  seed?: string;
  probeRole?: "content" | "decoration";
};

export const Mark: React.FC<MarkProps> = ({ kind, dir, target, at, dur, color, strokeWidth, seed, probeRole = "content" }) => {
  const { frame } = useClock();
  const probe = useProbe();
  const stroke = strokeWidth ?? MARK_DEFAULTS[kind].stroke(target.height);
  const key = seed ?? `${kind}:${target.x}:${target.y}:${target.width}:${target.height}`;
  const { x, y, width, height } = target;
  const geo = React.useMemo(
    () => markGeometry(kind, { x, y, width, height }, dir, { strokeWidth: stroke, wobble: markWobble(key) }),
    [kind, x, y, width, height, dir, stroke, key],
  );
  const progress = probe ? 1 : drawProgress(frame, at, dur ?? MARK_DEFAULTS[kind].dur);
  if (progress <= 0) return null;
  return (
    <VectorLayer>
      <DrawPath
        d={geo.d}
        progress={progress}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap={kind === "band" ? "butt" : "round"}
        probeRole={probeRole}
      />
    </VectorLayer>
  );
};
