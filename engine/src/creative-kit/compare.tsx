// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { EASE, clamp01, mix, useClock } from "../core/motion";
import { useProbe } from "../core/safe";
import { isArabic } from "../core/type";
import { MediaFill, type DeviceMedia } from "../core/device";
import { splitBox, wipeGeometry, type Fit, type Rect, type WipeDir } from "../core/device-geo";
import { getSceneTheme, type SceneTheme } from "./primitives";

export const COMPARE_SHADOW = {
  css: "0 8px 22px rgba(0,0,0,0.22)",
  reach: { top: 14, right: 22, bottom: 30, left: 22 },
} as const;

const DEFAULT_THEME = getSceneTheme("kinetic-paper");
const DIVIDER = 6;
const KNOB = 44;

export const SIDE_STAGGER_F = 5;

const Label: React.FC<{ text: string; theme: SceneTheme; accent?: boolean; style: React.CSSProperties }> = ({
  text,
  theme,
  accent = false,
  style,
}) => {
  const arabic = isArabic(text);
  return (
    <div
      style={{
        position: "absolute",
        padding: "6px 18px",
        borderRadius: 999,
        background: accent ? theme.accent : theme.pill,
        color: accent ? (theme.onAccent ?? theme.pillText) : theme.pillText,
        fontFamily: arabic ? theme.ar : theme.display,
        fontWeight: 700,
        fontSize: 34,
        lineHeight: 1.35,
        letterSpacing: 0,
        direction: arabic ? "rtl" : "ltr",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </div>
  );
};

export type CompareWipeProps = {
  before: DeviceMedia;
  after: DeviceMedia;

  progress: number;
  dir?: WipeDir;

  box: Rect;
  labels?: { before: string; after: string };
  fit?: Fit;
  radius?: number;
  theme?: SceneTheme;
};

export const CompareWipe: React.FC<CompareWipeProps> = ({
  before,
  after,
  progress,
  dir = "rtl",
  box,
  labels,
  fit = "cover",
  radius = 28,
  theme = DEFAULT_THEME,
}) => {
  const probe = useProbe();
  const size = { width: box.width, height: box.height };
  const w = wipeGeometry(progress, dir, size);
  const p = w.cut / w.extent;
  const showDivider = w.cut > 0 && w.cut < w.extent;

  const afterSide: React.CSSProperties =
    dir === "rtl" ? { right: 20, top: 20 } : dir === "ltr" ? { left: 20, top: 20 } : dir === "ttb" ? { left: 20, top: 20 } : { left: 20, bottom: 20 };
  const beforeSide: React.CSSProperties =
    dir === "rtl" ? { left: 20, top: 20 } : dir === "ltr" ? { right: 20, top: 20 } : dir === "ttb" ? { left: 20, bottom: 20 } : { left: 20, top: 20 };
  const bar: React.CSSProperties =
    w.axis === "x"
      ? { left: w.divider - DIVIDER / 2, top: 0, width: DIVIDER, height: box.height }
      : { left: 0, top: w.divider - DIVIDER / 2, width: box.width, height: DIVIDER };
  const knob: React.CSSProperties =
    w.axis === "x"
      ? { left: w.divider - KNOB / 2, top: Math.round(box.height / 2 - KNOB / 2) }
      : { left: Math.round(box.width / 2 - KNOB / 2), top: w.divider - KNOB / 2 };
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: radius,
        overflow: "hidden",
        boxShadow: COMPARE_SHADOW.css,
        background: theme.card,
      }}
    >
      <MediaFill media={before} box={size} fit={fit} />
      <div style={{ position: "absolute", inset: 0, clipPath: w.clipPath }}>
        <MediaFill media={after} box={size} fit={fit} />
      </div>
      {showDivider ? (
        <>
          <div style={{ position: "absolute", ...bar, background: theme.card }} />
          <div
            style={{
              position: "absolute",
              ...knob,
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              background: theme.card,
              border: `4px solid ${theme.accent}`,
              boxSizing: "border-box",
            }}
          />
        </>
      ) : null}
      {labels ? (
        <>
          <Label text={labels.before} theme={theme} style={{ ...beforeSide, opacity: probe ? 1 : clamp01((1 - p) * 4) }} />
          <Label text={labels.after} theme={theme} accent style={{ ...afterSide, opacity: probe ? 1 : clamp01(p * 4) }} />
        </>
      ) : null}
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, border: `3px solid ${theme.border}`, pointerEvents: "none" }} />
    </div>
  );
};

export type SideBySideProps = {
  left: DeviceMedia;
  right: DeviceMedia;

  labels: readonly [string, string];
  box: Rect;
  gap?: number;
  stack?: "row" | "column";

  at?: number;
  durF?: number;

  order?: "rtl" | "ltr";

  highlight?: "left" | "right" | null;
  fit?: Fit;
  radius?: number;
  theme?: SceneTheme;
};

export const SideBySide: React.FC<SideBySideProps> = ({
  left,
  right,
  labels,
  box,
  gap = 24,
  stack = "row",
  at = 0,
  durF = 14,
  order = "rtl",
  highlight = null,
  fit = "cover",
  radius = 24,
  theme = DEFAULT_THEME,
}) => {
  const { frame } = useClock();
  const probe = useProbe();
  const panels = splitBox(box, gap, stack);
  const media = [left, right] as const;
  const firstIndex = stack === "row" && order === "rtl" ? 1 : 0;
  const ringIndex = highlight === "left" ? 0 : highlight === "right" ? 1 : -1;
  const ringStart = at + SIDE_STAGGER_F + durF;
  const ring = probe ? 1 : EASE.land((frame - ringStart + 1) / 10);
  return (
    <>
      {panels.map((panel, i) => {
        const rank = i === firstIndex ? 0 : 1;
        const start = at + rank * SIDE_STAGGER_F;
        if (frame < start) return null;
        const e = probe ? 1 : EASE.land((frame - start + 1) / Math.max(1, durF));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: panel.x,
              top: panel.y,
              width: panel.width,
              height: panel.height,
              borderRadius: radius,
              overflow: "hidden",
              background: theme.card,
              boxShadow: COMPARE_SHADOW.css,
              opacity: clamp01(e * 2.5),

              transform: `scale(${mix(0.94, 1, e)})`,
              transformOrigin: "50% 50%",
            }}
          >
            <MediaFill media={media[i]} box={panel} fit={fit} />
            <Label
              text={labels[i]}
              theme={theme}
              accent={i === ringIndex}
              style={{ top: 18, left: "50%", transform: "translateX(-50%)" }}
            />
            {i === ringIndex ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: radius,
                  boxShadow: `inset 0 0 0 5px ${theme.accent}`,
                  opacity: ring,
                }}
              />
            ) : (
              <div style={{ position: "absolute", inset: 0, borderRadius: radius, border: `3px solid ${theme.border}` }} />
            )}
          </div>
        );
      })}
    </>
  );
};
