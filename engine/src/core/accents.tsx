// SPDX-License-Identifier: MIT
// Reusable primitive from the original Reel Studio editing engine.
import React from "react";
import { Html5Video, OffthreadVideo, Video } from "remotion";
import { Video as MediaVideo } from "@remotion/media";
import { clamp01, useClock } from "./motion";
import { Smear, speedOf } from "./mblur";
import { CamPlate, ContinuousWindowPlate, Footage, WindowPlate } from "./plate";
import { FRAME, useProbe } from "./safe";
import { GLITCH_DEFAULTS, MAX_GLITCH_SLICES, glitchAt, glitchHolePath, impulse, particlesAt, velocityAt } from "./accents-math";
import type { Motion, ParticleOptions, Point, Seed } from "./accents-math";

export const MAX_GLOW_RADIUS = 48;

export const MAX_OUTLINE = 24;

export const PARTICLE_COLORS: readonly string[] = ["#DFA02E", "#D97757", "#4FA3FF", "#E9E7E2"];

export const ACCENT_COST = {
  recoil: { renders: 1, filters: 0 },
  glow: { renders: 1, filters: 2 },
  stickerOutline: { renders: 1, filters: 1 },
  particles: { renders: 0, filters: 0 },
  glitchIdle: { renders: 1, filters: 0 },
} as const;

export const glitchCost = (slices: number = GLITCH_DEFAULTS.slices): { renders: number; filters: number } => ({
  renders: 3 + Math.max(0, Math.min(MAX_GLITCH_SLICES, Math.round(slices))),
  filters: 2,
});

const LAYER: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };

const svgId = (raw: string, prefix: string): string => `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, "") || "x"}`;

const n3 = (n: number): number => Math.round(n * 1000) / 1000 || 0;

const FOOTAGE_TYPES: ReadonlySet<unknown> = new Set<unknown>([
  Footage, WindowPlate, ContinuousWindowPlate, CamPlate, OffthreadVideo, Video, Html5Video, MediaVideo,
]);

export const containsFootage = (node: React.ReactNode): boolean => {
  let found = false;
  React.Children.forEach(node, (child) => {
    if (found || !React.isValidElement(child)) return;
    if (FOOTAGE_TYPES.has(child.type)) {
      found = true;
      return;
    }
    const inner = (child.props as { children?: React.ReactNode }).children;
    if (inner !== undefined && containsFootage(inner)) found = true;
  });
  return found;
};

const refuseFootage = (children: React.ReactNode, who: string): void => {
  if (!containsFootage(children)) return;
  throw new Error(
    `core/accents <${who}>: footage passed as a child. Accents are graphics-only (CLAUDE.md rule 15: never on his face), ` +
      "and a copy-rendering wrapper around a plate is one decode per copy per frame (core/mblur.tsx header). Wrap the graphic, not the plate.",
  );
};

export type RecoilProps = {
  children?: React.ReactNode;

  hits: readonly number[];
  seed: Seed;

  ampPx?: number;

  rotateDeg?: number;

  decayF?: number;

  origin?: Point;
};

export const Recoil: React.FC<RecoilProps> = ({ children, hits, seed, ampPx, rotateDeg, decayF, origin }) => {
  const probe = useProbe();
  const { frame } = useClock();
  refuseFootage(children, "Recoil");
  const pose = probe ? null : impulse(frame, hits, { seed, ampPx, rotateDeg, decayF });
  const transform =
    pose && (pose.x !== 0 || pose.y !== 0 || pose.rot !== 0)
      ? `translate(${n3(pose.x)}px, ${n3(pose.y)}px) rotate(${n3(pose.rot)}deg)`
      : undefined;
  return (
    <div style={{ ...LAYER, transform, transformOrigin: origin ? `${origin.x}px ${origin.y}px` : undefined }}>
      {children}
    </div>
  );
};

export type AutoBlurProps = {
  children?: React.ReactNode;

  motion: Motion;

  enabled?: boolean;
};

export const AutoBlur: React.FC<AutoBlurProps> = ({ children, motion, enabled = true }) => {
  const { frame } = useClock();
  refuseFootage(children, "AutoBlur");
  const shutter = speedOf(velocityAt(motion, frame));
  return (
    <Smear shutter={shutter} enabled={enabled && shutter !== "off"}>
      {children}
    </Smear>
  );
};

export type GlowProps = {
  children?: React.ReactNode;

  color: string;

  radius: number;

  intensity?: number;

  style?: React.CSSProperties;
};

export const Glow: React.FC<GlowProps> = ({ children, color, radius, intensity = 1, style }) => {
  const probe = useProbe();
  refuseFootage(children, "Glow");
  const k = probe ? 1 : Number.isFinite(intensity) ? clamp01(intensity) : 0;
  const r = Math.min(MAX_GLOW_RADIUS, Math.max(0, Number.isFinite(radius) ? radius : 0)) * k;
  const glow = r > 0 ? `drop-shadow(0 0 ${n3(r * 0.35)}px ${color}) drop-shadow(0 0 ${n3(r)}px ${color})` : undefined;
  const filter = [style?.filter, glow].filter(Boolean).join(" ") || undefined;
  return (
    <div style={{ display: "inline-block", position: "relative", verticalAlign: "top", ...style, filter }}>
      {children}
    </div>
  );
};

export type GlitchBurstProps = {
  children?: React.ReactNode;

  at: number;

  durF: number;
  seed: Seed;

  region?: { top: number; height: number };

  slices?: number;

  shiftPx?: number;

  splitPx?: number;
};

const CHANNEL_R = "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
const CHANNEL_GB = "0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0";

export const GlitchBurst: React.FC<GlitchBurstProps> = ({ children, at, durF, seed, region, slices, shiftPx, splitPx }) => {
  const probe = useProbe();
  const { frame } = useClock();
  const rawId = React.useId();
  refuseFootage(children, "GlitchBurst");
  const band = region ?? { top: 0, height: FRAME.height };
  const g = probe ? null : glitchAt(frame, { at, durF, seed, region: band, slices, shiftPx, splitPx });
  const on = g && g.active ? g : null;
  const id = svgId(rawId, "acc-glitch");
  return (
    <div style={{ ...LAYER, isolation: on ? "isolate" : undefined }}>
      <div style={{ ...LAYER, clipPath: on && on.slices.length > 0 ? glitchHolePath(on.slices, FRAME.width, FRAME.height) : undefined }}>
        {children}
      </div>
      {on ? (
        <>
          <svg aria-hidden width={0} height={0} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
            <defs>
              <filter id={`${id}-r`} filterUnits="userSpaceOnUse" x={0} y={band.top} width={FRAME.width} height={band.height} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values={CHANNEL_R} />
              </filter>
              <filter id={`${id}-gb`} filterUnits="userSpaceOnUse" x={0} y={band.top} width={FRAME.width} height={band.height} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values={CHANNEL_GB} />
              </filter>
            </defs>
          </svg>
          {on.slices.map((s, i) => (
            <div
              key={i}
              style={{ ...LAYER, clipPath: `inset(${s.top}px 0px ${FRAME.height - s.top - s.height}px 0px)`, transform: `translateX(${s.dx}px)` }}
            >
              {children}
            </div>
          ))}
          <div style={{ ...LAYER, transform: `translateX(${-on.split}px)`, filter: `url(#${id}-r)`, mixBlendMode: "screen" }}>{children}</div>
          <div style={{ ...LAYER, transform: `translateX(${on.split}px)`, filter: `url(#${id}-gb)`, mixBlendMode: "screen" }}>{children}</div>
        </>
      ) : null}
    </div>
  );
};

export type ParticlesProps = ParticleOptions & {

  at: number;

  colors?: readonly string[];
};

export const Particles: React.FC<ParticlesProps> = ({ at, colors, ...opts }) => {
  const probe = useProbe();
  const { frame } = useClock();
  if (probe) return null;
  const list = particlesAt(frame - Math.round(at), opts);
  if (list.length === 0) return null;
  const palette = colors && colors.length > 0 ? colors : PARTICLE_COLORS;
  return (
    <div style={{ ...LAYER, pointerEvents: "none" }}>
      {list.map((p) => {
        const h = opts.kind === "confetti" ? p.size * 0.55 : p.size;
        return (
          <div
            key={p.i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: p.size,
              height: h,
              borderRadius: opts.kind === "confetti" ? 2 : h / 2,
              background: palette[p.colorIndex % palette.length],
              opacity: p.opacity,
              transform: `translate(${n3(p.x - p.size / 2)}px, ${n3(p.y - h / 2)}px) rotate(${n3(p.rot)}deg) scale(${n3(p.scaleX)}, ${n3(p.scaleY)})`,
            }}
          />
        );
      })}
    </div>
  );
};

export type StickerOutlineProps = {
  children?: React.ReactNode;

  width?: number;

  color?: string;

  probeRole?: "content" | "decoration";

  style?: React.CSSProperties;
};

export const StickerOutline: React.FC<StickerOutlineProps> = ({ children, width = 8, color = "#FFFFFF", probeRole = "content", style }) => {
  const probe = useProbe();
  const rawId = React.useId();
  refuseFootage(children, "StickerOutline");
  if (probe && probeRole === "decoration") return null;
  const w = Math.min(MAX_OUTLINE, Math.max(0, Math.round(Number.isFinite(width) ? width : 0)));
  const box: React.CSSProperties = { display: "inline-block", position: "relative", verticalAlign: "top", ...style };
  if (w === 0) return <div style={box}>{children}</div>;
  const id = svgId(rawId, "acc-ring");
  const pad = w + 2;
  return (
    <div style={box}>
      <svg aria-hidden width={0} height={0} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <defs>
          <filter id={id} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius={w} result="grown" />
            <feFlood floodColor={color} result="ink" />
            <feComposite in="ink" in2="grown" operator="in" result="ring" />
            <feMerge>
              <feMergeNode in="ring" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <div style={{ padding: pad, margin: -pad, filter: `url(#${id})` }}>{children}</div>
    </div>
  );
};
