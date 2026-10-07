import React from "react";
import {Easing, interpolate} from "remotion";

/**
 * Adapted from RemotionUI's masked-slide-reveal.tsx, path-draw.tsx and
 * simulated-cursor.tsx. The original source snapshots and immutable
 * provenance live in Motion-Kits/github-curated/manifest.json.
 *
 * Composition hooks and internal alias imports were replaced with explicit
 * normalized props so these primitives are deterministic and dependency-free.
 */

const ENTER_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export type RemotionUiMaskedBlockRevealProps = {
  children: React.ReactNode;
  frame: number;
  duration: number;
  distance?: number;
  style?: React.CSSProperties;
};

export const RemotionUiMaskedBlockReveal: React.FC<RemotionUiMaskedBlockRevealProps> = ({
  children,
  frame,
  duration,
  distance = 108,
  style,
}) => {
  const progress = interpolate(frame, [0, Math.max(1, duration)], [0, 1], {
    easing: ENTER_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(progress, [0, 1], [Math.max(0, distance), 0]);

  return (
    <span
      data-motion-source="remotion-ui"
      style={{display: "inline-block", overflow: "hidden", ...style}}
    >
      <span style={{display: "inline-block", translate: `0 ${y}%`}}>{children}</span>
    </span>
  );
};

export type RemotionUiDrawProgressProps = {
  progress: number;
  color: string;
  width: number;
  height: number;
};

export const RemotionUiDrawProgress: React.FC<RemotionUiDrawProgressProps> = ({
  progress,
  color,
  width,
  height,
}) => {
  const value = clamp01(progress);
  const strokeWidth = Math.max(1, height);
  const safeWidth = Math.max(strokeWidth, width);
  const halfStroke = strokeWidth / 2;

  return (
    <svg
      data-motion-source="remotion-ui"
      width={safeWidth}
      height={strokeWidth}
      viewBox={`0 0 ${safeWidth} ${strokeWidth}`}
      role="presentation"
    >
      <path
        d={`M ${halfStroke} ${halfStroke} H ${safeWidth - halfStroke}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - value}
      />
    </svg>
  );
};

export type RemotionUiFocusCursorProps = {
  x: number;
  y: number;
  progress: number;
  color: string;
};

export const RemotionUiFocusCursor: React.FC<RemotionUiFocusCursorProps> = ({
  x,
  y,
  progress,
  color,
}) => {
  const safeX = clamp01(x);
  const safeY = clamp01(y);
  const clickProgress = clamp01(progress);
  const size = 28;
  const ringSize = 12 + clickProgress * 52;
  const ringOffset = size * 0.2 - clickProgress * 26;

  return (
    <div
      data-click-progress={clickProgress}
      data-motion-source="remotion-ui"
      style={{
        position: "absolute",
        left: `${safeX * 100}%`,
        top: `${safeY * 100}%`,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {clickProgress > 0 && clickProgress < 1 ? (
        <div
          style={{
            position: "absolute",
            left: ringOffset,
            top: ringOffset,
            width: ringSize,
            height: ringSize,
            borderRadius: 999,
            border: `2px solid ${color}`,
            opacity: Math.max(0, 0.8 - clickProgress * 0.8),
          }}
        />
      ) : null}

      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          display: "block",
          scale: clickProgress > 0 && clickProgress < 0.32 ? 0.88 : 1,
          filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.45))",
        }}
      >
        <path
          d="M5 3L19 12L12 13L9 20L5 3Z"
          fill={color}
          stroke="#080810"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
