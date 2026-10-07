import React from "react";
import { Img, staticFile } from "remotion";
import { EASE, clamp01, px, useClock } from "./motion";
import { transformString } from "./organic";
import { Footage } from "./plate";
import { useProbe } from "./safe";
import { FAMILY } from "./fonts";
import { isArabic } from "./type";
import {
  DEFAULT_TILT,
  DEVICE_SHADOW,
  assertTilt,
  deviceLayout,
  enterPose,
  fitMedia,
  type DeviceKind,
  type Fit,
  type Rect,
  type Size,
  type Tilt,
} from "./device-geo";
import { PIP_RING, PIP_SHADOW, type PlateWindow } from "./pip";


export type DeviceMedia =
  | { kind: "image"; src: string; width: number; height: number; focus?: { x: number; y: number } }
  | { kind: "video"; src: string; width: number; height: number; startFromSec?: number; focus?: { x: number; y: number } };

export type DeviceTheme = { body: string; pill: string; ink: string; dim: string; dot: string; screen: string };

export const DEVICE_THEME_DARK: DeviceTheme = {
  body: "#1B1D22",
  pill: "#2A2D34",
  ink: "#E9EAEE",
  dim: "#9A9EA8",
  dot: "#4A4E57",
  screen: "#000000",
};

export const DEVICE_THEME_LIGHT: DeviceTheme = {
  body: "#F4F4F6",
  pill: "#E3E4E8",
  ink: "#1B1D22",
  dim: "#6B6F78",
  dot: "#C4C6CC",
  screen: "#FFFFFF",
};

const MONO = `"${FAMILY.plexMono}", monospace`;
const ARABIC = `"${FAMILY.cairo}", sans-serif`;





export const MediaFill: React.FC<{ media: DeviceMedia; box: Size; fit?: Fit }> = ({ media, box, fit = "cover" }) => {
  const probe = useProbe();
  if (probe) return <div style={{ position: "absolute", inset: 0, background: probe }} />;
  const placed = fitMedia({ width: media.width, height: media.height }, box, fit, media.focus);
  const style: React.CSSProperties = {
    position: "absolute",
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
  if (media.kind === "image") {
    return <Img src={staticFile(media.src)} style={{ ...style, maxWidth: "none", display: "block" }} />;
  }
  return (
    <div style={style}>
      <Footage src={media.src} startFromSec={media.startFromSec ?? 0} muted />
    </div>
  );
};

const Dots: React.FC<{ bar: Rect; color: string }> = ({ bar, color }) => {
  const d = Math.max(8, Math.round(bar.height * 0.2));
  const gap = Math.round(d * 0.7);
  return (
    <div
      style={{
        position: "absolute",
        left: Math.round(bar.height * 0.42),
        top: Math.round((bar.height - d) / 2),
        display: "flex",
        gap,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: d, height: d, borderRadius: d / 2, background: color, display: "block" }} />
      ))}
    </div>
  );
};

const DeviceBar: React.FC<{ kind: DeviceKind; bar: Rect; url?: string; title?: string; theme: DeviceTheme }> = ({
  kind,
  bar,
  url,
  title,
  theme,
}) => {
  const text = kind === "browser" ? url : title;
  const arabic = text !== undefined && isArabic(text);
  const pillH = Math.round(bar.height * 0.56);
  const pillW = Math.round(bar.width * 0.56);
  return (
    <div style={{ position: "absolute", left: bar.x, top: bar.y, width: bar.width, height: bar.height }}>
      <Dots bar={bar} color={theme.dot} />
      {text ? (
        <div
          style={{
            position: "absolute",
            left: Math.round((bar.width - pillW) / 2),
            top: Math.round((bar.height - pillH) / 2),
            width: pillW,
            height: pillH,
            borderRadius: kind === "browser" ? pillH / 2 : 0,
            background: kind === "browser" ? theme.pill : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            whiteSpace: "nowrap",
            fontFamily: arabic ? ARABIC : MONO,
            fontWeight: arabic ? 700 : 400,
            fontSize: Math.round(bar.height * 0.3),
            letterSpacing: 0,
            direction: arabic ? "rtl" : "ltr",
            color: kind === "browser" ? theme.dim : theme.ink,
          }}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
};

export type DeviceFrameProps = {
  kind: DeviceKind;
  media: DeviceMedia;

  x: number;
  y: number;
  width: number;

  screenAspect?: number;

  url?: string;

  title?: string;

  tilt?: Tilt;

  at?: number;

  durF?: number;
  fit?: Fit;
  theme?: DeviceTheme;


  children?: React.ReactNode;
};

export const DeviceFrame: React.FC<DeviceFrameProps> = ({
  kind,
  media,
  x,
  y,
  width,
  screenAspect,
  url,
  title,
  tilt = DEFAULT_TILT,
  at = 0,
  durF = 18,
  fit = "cover",
  theme = DEVICE_THEME_DARK,
  children,
}) => {
  const { frame } = useClock();
  const probe = useProbe();
  assertTilt(tilt);

  if (frame < at) return null;
  const L = deviceLayout(kind, width, screenAspect);

  const e = probe ? 1 : EASE.land((frame - at + 1) / Math.max(1, durF));
  const pose = enterPose(e, tilt);
  const r = L.screenRadius;
  return (
    <div
      style={{
        position: "absolute",
        left: px(x),
        top: px(y),
        width: L.width,
        height: L.height,
        transform: transformString({ perspective: pose.perspective, rotateX: pose.rx, rotateY: pose.ry, scale: pose.scale }),
        transformOrigin: "50% 50%",
        opacity: pose.opacity,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: L.radius, background: theme.body, boxShadow: DEVICE_SHADOW.css }} />
      {L.bar ? <DeviceBar kind={kind} bar={L.bar} url={url} title={title} theme={theme} /> : null}
      <div
        style={{
          position: "absolute",
          left: L.screen.x,
          top: L.screen.y,
          width: L.screen.width,
          height: L.screen.height,
          borderRadius: L.bar ? `0 0 ${r}px ${r}px` : r,
          overflow: "hidden",
          background: probe ?? theme.screen,
        }}
      >
        <MediaFill media={media} box={L.screen} fit={fit} />
        <div style={{ position: "absolute", inset: 0 }}>{children}</div>
      </div>
      {kind === "phone" && !probe ? (
        <div
          style={{
            position: "absolute",
            left: L.screen.x + Math.round(L.screen.width * 0.33),
            top: L.screen.y + L.screen.height - 16,
            width: Math.round(L.screen.width * 0.34),
            height: 5,
            borderRadius: 3,
            background: "rgba(255,255,255,0.72)",
          }}
        />
      ) : null}
    </div>
  );
};

export type PipPlateProps = {

  src: string;

  win: PlateWindow;
  startFromSec?: number;
  muted?: boolean;

  ring?: number;
  ringColor?: string;
};

export const PipPlate: React.FC<PipPlateProps> = ({ src, win, startFromSec = 0, muted = false, ring = 0, ringColor = "#FFFFFF" }) => {
  const probe = useProbe();

  const ringOpacity = probe ? 0 : clamp01(ring);
  return (
    <>
      {
                                                                 }
      <div
        style={{
          position: "absolute",
          left: win.x - PIP_RING,
          top: win.y - PIP_RING,
          width: win.width + 2 * PIP_RING,
          height: win.height + 2 * PIP_RING,
          borderRadius: win.radius + PIP_RING,
          background: ringColor,
          boxShadow: PIP_SHADOW.css,
          opacity: ringOpacity,
        }}
      />
      <div style={{ position: "absolute", left: win.x, top: win.y, width: win.width, height: win.height, borderRadius: win.radius, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: win.plate.left, top: win.plate.top, width: win.plate.width, height: win.plate.height }}>
          <Footage src={src} startFromSec={startFromSec} muted={muted} />
        </div>
      </div>
    </>
  );
};
