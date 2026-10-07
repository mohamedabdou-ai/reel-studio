import React from "react";

/**
 * Adapted from av/remotion-bits StaggeredMotion.tsx and AnimatedCounter.tsx.
 *
 * The original source snapshots and immutable provenance live in
 * Motion-Kits/github-curated/manifest.json. The adaptations replace composition hooks and
 * the upstream random stagger option with explicit deterministic inputs. They
 * also keep each child intact instead of splitting text into characters.
 */

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3);

export type RemotionBitsFrameRevealProps = {
  children: React.ReactNode;
  frame: number;
  duration: number;
  distance?: number;
};

export const RemotionBitsFrameReveal: React.FC<RemotionBitsFrameRevealProps> = ({
  children,
  frame,
  duration,
  distance = 36,
}) => {
  const progress = easeOutCubic(clamp01(frame / Math.max(1, duration)));
  const offset = Math.max(0, distance) * (1 - progress);

  return (
    <span
      data-motion-source="remotion-bits"
      style={{display: "inline-block", overflow: "hidden", verticalAlign: "bottom"}}
    >
      <span
        style={{
          display: "inline-block",
          opacity: progress,
          translate: `0 ${offset}px`,
        }}
      >
        {children}
      </span>
    </span>
  );
};

export type RemotionBitsAnimatedNumberProps = {
  from: number;
  to: number;
  progress: number;
  prefix?: React.ReactNode;
  postfix?: React.ReactNode;
  toFixed?: number;
  className?: string;
  style?: React.CSSProperties;
};

export const RemotionBitsAnimatedNumber: React.FC<RemotionBitsAnimatedNumberProps> = ({
  from,
  to,
  progress,
  prefix,
  postfix,
  toFixed = 0,
  className,
  style,
}) => {
  const value = from + (to - from) * clamp01(progress);
  const precision = Math.max(0, Math.min(20, Math.trunc(toFixed)));

  return (
    <span
      className={className}
      data-motion-source="remotion-bits"
      style={{display: "inline-flex", alignItems: "center", ...style}}
    >
      {prefix}
      <span>{value.toFixed(precision)}</span>
      {postfix}
    </span>
  );
};
