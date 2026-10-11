// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { Freeze, Sequence } from "remotion";
import { EASE, clamp01, toFrame, useClock, useEnterF } from "./motion";
import { Footage, useCamBox, type Cam } from "./plate";
import { useProbe } from "./safe";
import { FAMILY } from "./fonts";
import {
  badgeStateAt,
  constantSegments,
  formatRate,
  freezeMap,
  insertGeometry,
  rampTotals,
  sourceFrameAt,
  validateFreeze,
  validateSpeedPlan,
  type BadgeRate,
  type CropRect,
  type FreezePush,
  type FreezeSpec,
  type RampSegment,
  type Size,
} from "./speed-math";

export type BadgeTheme = { bg: string; fg: string; accent: string; muted: string };
export const BADGE_THEME: BadgeTheme = { bg: "rgba(8, 19, 31, 0.86)", fg: "#f2f6fc", accent: "#70e6df", muted: "#a9bbd1" };

export const PUNCH_F = 6;

export type SpeedBadgeProps = {

  rate: BadgeRate;

  sinceFrame?: number;

  mode?: "stamp" | "punch";

  label?: string;

  holdLabel?: string;

  size?: number;
  theme?: Partial<BadgeTheme>;

  origin?: string;

  style?: React.CSSProperties;
};

const Glyph: React.FC<{ kind: "ff" | "hold"; size: number; color: string }> = ({ kind, size, color }) => {
  const h = Math.round(size);
  if (kind === "hold") {
    const bar = Math.max(2, Math.round(size * 0.28));
    return (
      <div style={{ display: "flex", gap: bar, height: h }}>
        <div style={{ width: bar, height: h, background: color, borderRadius: 2 }} />
        <div style={{ width: bar, height: h, background: color, borderRadius: 2 }} />
      </div>
    );
  }
  const w = Math.round(size * 0.62);
  const half = Math.round(h / 2);
  const tri: React.CSSProperties = { width: 0, height: 0, borderTop: `${half}px solid transparent`, borderBottom: `${half}px solid transparent`, borderLeft: `${w}px solid ${color}` };
  return (
    <div style={{ display: "flex", alignItems: "center", height: h, direction: "ltr" }}>
      <div style={tri} />
      <div style={{ ...tri, marginLeft: -Math.round(w * 0.2) }} />
    </div>
  );
};

export const SpeedBadge: React.FC<SpeedBadgeProps> = ({ rate, sinceFrame = 0, mode = "stamp", label, holdLabel, size = 44, theme, origin = "left top", style }) => {
  const probe = useProbe();
  const { frame } = useClock();

  const stamp = useEnterF(sinceFrame - 1, "stamp");
  const t = { ...BADGE_THEME, ...theme };
  const fs = Math.round(size);
  const scale = probe ? 1 : mode === "stamp" ? 0.55 + 0.45 * stamp : 1 + 0.14 * EASE.bloom(clamp01((frame - sinceFrame) / PUNCH_F));
  const opacity = probe ? 1 : mode === "stamp" ? clamp01(stamp * 1.6) : 1;
  const caption = rate === "hold" ? holdLabel : label;
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        gap: Math.round(fs * 0.28),
        padding: `${Math.round(fs * 0.2)}px ${Math.round(fs * 0.34)}px`,
        borderRadius: Math.round(fs * 0.34),
        background: t.bg,
        border: `2px solid ${t.accent}`,
        direction: "ltr",
        whiteSpace: "nowrap",
        transformOrigin: origin,
        transform: `scale(${scale})`,
        opacity,
        ...style,
      }}
    >
      <Glyph kind={rate === "hold" ? "hold" : "ff"} size={fs * 0.62} color={t.accent} />
      {typeof rate === "number" ? (
        <span style={{ fontFamily: FAMILY.cairo, fontWeight: 900, fontSize: fs, lineHeight: 1, color: t.fg, letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
          {formatRate(rate)}
        </span>
      ) : null}
      {caption ? (

        <div dir="rtl" style={{ fontFamily: FAMILY.cairo, fontWeight: 700, fontSize: Math.round(fs * 0.5), lineHeight: 1.2, color: t.muted, letterSpacing: 0 }}>
          {caption}
        </div>
      ) : null}
    </div>
  );
};

export type FreezeHoldProps = FreezeSpec & {

  width: number;
  height: number;

  push?: FreezePush;

  flash?: boolean;
  children: React.ReactNode;
};

export const FreezeHold: React.FC<FreezeHoldProps> = ({ atFrame, durF, width, height, push, flash = false, children }) => {
  const probe = useProbe();
  const { frame, fps } = useClock();
  const m = freezeMap(frame, atFrame, durF);
  const ax = push?.ax ?? 0.5;
  const ay = push?.ay ?? 0.5;
  const pushF = Math.max(1, Math.min(durF, push?.pushF ?? toFrame(0.6, fps)));
  const cams: [number, Cam][] = [
    [atFrame / fps, { scale: 1, ax, ay }],
    [(atFrame + pushF) / fps, { scale: push?.scale ?? 1, ax, ay }],
  ];
  const box = useCamBox(cams, width, height);
  const errors = validateFreeze({ atFrame, durF, push });
  if (errors.length) throw new Error(`FreezeHold: ${errors.join(" | ")}`);
  const pushing = !probe && push !== undefined && m.phase === "hold";
  const flashOn = flash && !probe && m.phase === "hold" && m.holdElapsed < 4;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transformOrigin: "0 0",
          transform: pushing ? `translate(${box.left}px, ${box.top}px) scale(${box.w / width}, ${box.h / height})` : undefined,
        }}
      >
        {probe ? children : <Freeze frame={m.childFrame} active={m.phase !== "before"}>{children}</Freeze>}
      </div>
      {flashOn ? <div style={{ position: "absolute", inset: 0, background: "#ffffff", opacity: 0.5 * EASE.bloom(m.holdElapsed / 4) }} /> : null}
    </div>
  );
};

export type BadgeCorner = "tl" | "tr" | "bl" | "br";
export type SpeedBadgeOptions = {
  corner?: BadgeCorner;
  inset?: number;
  label?: string;
  holdLabel?: string;
  size?: number;
  theme?: Partial<BadgeTheme>;
};

type SpeedTiming =
  | { rate: number; durationInFrames: number; segments?: undefined }
  | { segments: readonly RampSegment[]; rate?: undefined; durationInFrames?: undefined };

export type SpeedInsertProps = SpeedTiming & {

  src: string;

  trimBefore: number;

  source: Size;

  window: { left: number; top: number; width: number; height: number };

  crop?: CropRect;
  radius?: number;
  border?: string;
  background?: string;
  badge?: boolean | SpeedBadgeOptions;
  freeze?: FreezeSpec & { push?: FreezePush; flash?: boolean };
  speechPlates?: readonly string[];
  speechRanges?: readonly (readonly [number, number])[];
};

export const SpeedInsert: React.FC<SpeedInsertProps> = (props) => {
  const probe = useProbe();
  const { frame, fps } = useClock();
  const segments: readonly RampSegment[] = props.segments !== undefined ? props.segments : constantSegments(props.rate, props.durationInFrames);
  const errors = [
    ...validateSpeedPlan({ src: props.src, segments, trimBefore: props.trimBefore, speechPlates: props.speechPlates, speechRanges: props.speechRanges }),
    ...(props.freeze ? validateFreeze(props.freeze, rampTotals(segments).outFrames) : []),
  ];
  if (errors.length) throw new Error(`SpeedInsert ${props.src}: ${errors.join(" | ")}`);
  const win = props.window;
  const geo = insertGeometry({ width: win.width, height: win.height }, props.source, props.crop);
  const opts: SpeedBadgeOptions | null = props.badge === true ? {} : props.badge || null;
  const state = badgeStateAt(frame, segments, props.freeze);
  const corner = opts?.corner ?? "tl";
  const inset = opts?.inset ?? 20;
  const place: React.CSSProperties = {
    ...(corner[0] === "t" ? { top: inset } : { bottom: inset }),
    ...(corner[1] === "l" ? { left: inset } : { right: inset }),
  };
  const origin = `${corner[1] === "l" ? "left" : "right"} ${corner[0] === "t" ? "top" : "bottom"}`;
  const plate = (
    <div style={{ position: "absolute", left: geo.left, top: geo.top, width: geo.width, height: geo.height }}>
      {segments.map((s) => (
        <Sequence key={s.fromF} from={s.fromF} durationInFrames={s.toF - s.fromF} layout="none" name={`speed ${formatRate(s.rate)}`}>
          <Footage src={props.src} startFromSec={(props.trimBefore + sourceFrameAt(s.fromF, segments)) / fps} playbackRate={s.rate} muted />
        </Sequence>
      ))}
    </div>
  );
  const f = props.freeze;
  return (
    <div
      style={{
        position: "absolute",
        left: win.left,
        top: win.top,
        width: win.width,
        height: win.height,
        overflow: "hidden",
        borderRadius: props.radius ?? 24,
        background: probe ?? props.background ?? "#eaf0f4",
        border: props.border ?? "2px solid #3c566a",
      }}
    >
      {f ? (
        <FreezeHold atFrame={f.atFrame} durF={f.durF} push={f.push} flash={f.flash} width={win.width} height={win.height}>
          {plate}
        </FreezeHold>
      ) : (
        plate
      )}
      {opts && state.show ? (
        <SpeedBadge
          rate={state.rate}
          sinceFrame={state.sinceFrame}
          mode={state.fresh ? "stamp" : "punch"}
          label={opts.label}
          holdLabel={opts.holdLabel}
          size={opts.size}
          theme={opts.theme}
          origin={origin}
          style={place}
        />
      ) : null}
    </div>
  );
};
