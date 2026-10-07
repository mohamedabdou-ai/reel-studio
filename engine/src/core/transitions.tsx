import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, clamp01, toFrame, useClock } from "./motion";
import { useProbe } from "./safe";










export const Gate: React.FC<{
  from: number;
  to: number;
  fadeInF?: number;
  fadeOutF?: number;
  children?: React.ReactNode;
}> = ({ from, to, fadeInF = 3, fadeOutF = 0, children }) => {
  const { frame, fps } = useClock();
  const fromF = toFrame(from, fps);
  const toF = toFrame(to, fps);
  const start = fromF - fadeInF;
  if (frame < start || frame >= toF) return null;
  const aIn = fadeInF === 0 ? 1 : clamp01((frame - start + 1) / (fadeInF + 1));
  const aOut = fadeOutF === 0 ? 1 : clamp01((toF - frame) / (fadeOutF + 1));
  const a = Math.min(aIn, aOut);
  if (a >= 0.999) return <>{children}</>;
  return <AbsoluteFill style={{ opacity: a }}>{children}</AbsoluteFill>;
};



const useDressingClock = () => {
  const probe = useProbe();
  const { frame, fps, t } = useClock();
  return { probe, frame, fps, t };
};

export const Whiteout: React.FC<{
  at: number;
  shape?: "bell" | "flash";

  dur?: number;

  up?: number;
  down?: number;
  peak?: number;
  color?: string;
}> = ({ at, shape = "bell", dur = 0.34, up = 0.07, down = 0.22, peak, color = "#fff" }) => {
  const { probe, t } = useDressingClock();
  if (probe) return null;
  let a: number;
  if (shape === "bell") {
    const p = (t - (at - dur / 2)) / dur;
    if (p < 0 || p > 1) return null;
    a = EASE.bell(p) * (peak ?? 1);
  } else {
    a = (t < at ? clamp01((t - (at - up)) / up) : 1 - clamp01((t - at) / down)) * (peak ?? 0.96);
    if (a <= 0.001) return null;
  }
  return <AbsoluteFill style={{ background: color, opacity: a, pointerEvents: "none" }} />;
};

export const LightLeak: React.FC<{ at: number; variant?: "split" | "streak"; dur?: number; hue?: string }> = ({
  at,
  variant = "streak",
  dur,
  hue,
}) => {
  const { probe, t } = useDressingClock();
  if (probe) return null;
  if (variant === "split") {
    const d = dur ?? 0.42;
    const p = (t - (at - d / 2)) / d;
    if (p < 0 || p > 1) return null;
    const a = EASE.bell(p);
    const slide = interpolate(p, [0, 1], [-40, 40]);
    const h = hue ?? "#FFD9A0";
    return (
      <AbsoluteFill
        style={{
          background: `linear-gradient(${112 + slide}deg, rgba(255,255,255,0) 18%, ${h} 46%, #fff 56%, rgba(255,255,255,0) 84%)`,
          opacity: a,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    );
  }
  const d = dur ?? 0.5;
  const p = clamp01((t - at) / d);
  if (p <= 0 || p >= 1) return null;
  const x = interpolate(p, [0, 1], [-60, 160]);
  const fade = EASE.bell(p);
  const h = hue ?? "255,168,90";
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: fade }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(105deg, transparent ${x - 42}%, rgba(${h},0.85) ${x}%, rgba(${h},0.15) ${x + 16}%, transparent ${x + 44}%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const FilmBurn: React.FC<{ at: number; dur?: number }> = ({ at, dur = 0.34 }) => {
  const { probe, t } = useDressingClock();
  if (probe) return null;
  const p = clamp01((t - at) / dur);
  if (p <= 0 || p >= 1) return null;
  const a = EASE.bell(p);
  const r = interpolate(p, [0, 1], [10, 130]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: a }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 62% 46%, rgba(255,236,180,0.95) 0%, rgba(255,150,60,0.75) ${r * 0.35}%, rgba(190,60,20,0.25) ${r * 0.7}%, transparent ${r}%)`,
        }}
      />
    </AbsoluteFill>
  );
};






export const BlurWash: React.FC<{
  at: number;
  dur?: number;
  target?: "backdrop" | "layer";
  tint?: string;
  children?: React.ReactNode;
}> = ({ at, dur = 0.36, target = "backdrop", tint = "243,238,230", children }) => {
  const { probe, t } = useDressingClock();
  const p = (t - (at - dur / 2)) / dur;
  const live = p >= 0 && p <= 1;
  const a = live ? EASE.bell(p) : 0;
  if (target === "layer") {
    if (probe || !live) return <>{children}</>;
    return <AbsoluteFill style={{ filter: `blur(${a * 26}px)` }}>{children}</AbsoluteFill>;
  }
  if (probe || !live) return null;
  return <AbsoluteFill style={{ backdropFilter: `blur(${a * 26}px)`, background: `rgba(${tint},${a * 0.42})`, pointerEvents: "none" }} />;
};


export const FlashBloom: React.FC<{ at: number; decaySec?: number; peak?: number }> = ({ at, decaySec = 0.27, peak = 0.8 }) => {
  const { probe, frame, fps } = useDressingClock();
  if (probe) return null;



  const atF = toFrame(at, fps);
  const decayF = Math.max(1, Math.round(decaySec * fps));
  if (frame < atF || frame > atF + decayF) return null;
  const p = (frame - atF) / decayF;
  return <AbsoluteFill style={{ background: "#fff", opacity: peak * EASE.bloom(p, 1.7), pointerEvents: "none" }} />;
};


export const Whip: React.FC<{ at: number; dur?: number; children?: React.ReactNode }> = ({ at, dur = 0.2, children }) => {
  const { probe, t } = useDressingClock();
  const p = clamp01((t - at) / dur);
  const live = !probe && t >= at - 0.001 && p < 1;
  const blur = live ? EASE.bell(p) * 26 : 0;
  const dx = live ? (1 - EASE.land(p)) * 70 : 0;
  return <div style={{ position: "absolute", inset: 0, filter: live ? `blur(${blur}px)` : undefined, transform: `translateX(${dx}px)` }}>{children}</div>;
};




export const Grain: React.FC<{ opacity?: number; scale?: number; seed?: number }> = ({ opacity = 0.06, scale = 1, seed = 7 }) => {
  const probe = useProbe();
  const frame = useCurrentFrame();
  if (probe) return null;
  const shift = (frame % 4) * 37;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency={0.85 / scale} numOctaves={2} seed={seed} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} transform={`translate(${shift} ${shift})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.42 }) => {
  const probe = useProbe();
  if (probe) return null;
  return (
    <AbsoluteFill
      style={{ pointerEvents: "none", background: `radial-gradient(ellipse at 50% 42%, transparent 45%, rgba(0,0,0,${strength}) 100%)` }}
    />
  );
};


export const useSparkleField = (seed: number, count: number) =>
  React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const h = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
        const f = h - Math.floor(h);
        const h2 = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345;
        const f2 = h2 - Math.floor(h2);
        return { x: 4 + f * 92, y: 6 + f2 * 88, size: 12 + ((i * 7) % 12), phase: f * 6.28 };
      }),
    [seed, count],
  );


export const useFps = (): number => useVideoConfig().fps;
