import React from "react";
import { Audio, OffthreadVideo, interpolate, staticFile, useRemotionEnvironment, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { getStaticFiles } from "@remotion/studio";
import proxyRegistry from "../../proxies.json";
import { resolvePreviewSource, type ProxyRegistry } from "./preview-source";
import { EASE, px, toFrame, useClock } from "./motion";
import { useProbe } from "./safe";


export type WindowGeo = {
  windowTop: number;
  windowHeight: number;
  videoWidth: number;
  videoLeft: number;
  videoTop: number;
};


export type Cam = { scale: number; ax?: number; ay?: number };







export const Footage: React.FC<{
  src: string;
  startFromSec?: number;
  muted?: boolean;
  transparent?: boolean;

  style?: React.CSSProperties;


  playbackRate?: number;
}> = ({ src, startFromSec = 0, muted = false, transparent = false, style, playbackRate }) => {
  const probe = useProbe();
  const { fps } = useClock();
  const environment = useRemotionEnvironment();
  const { props } = useVideoConfig();




  if (props.noPlates === true) {
    throw new Error(`Footage ${src}: this composition is registered withoutPlates() but mounts footage; use withPlates([...]) in Root.tsx`);
  }
  const isPreview = props.__editorPreview === true || (!environment.isRendering && (environment.isStudio || environment.isPlayer));

  const assets = isPreview && !environment.isPlayer ? Object.fromEntries(getStaticFiles().map((file) => [file.name, file])) : {};
  const selectedSrc = resolvePreviewSource({ source: src, transparent, isPreview, registry: proxyRegistry as ProxyRegistry, assets });
  const hasProxy = selectedSrc !== src;
  const useWebCodecs = props.__editorMediaEngine === "webcodecs" && !transparent;
  const videoStyle: React.CSSProperties = { width: "100%", height: "100%", maxWidth: "none", display: "block", ...style };
  if (playbackRate !== undefined && playbackRate !== 1 && !muted) {
    throw new Error(`Footage ${src}: playbackRate ${playbackRate} needs muted — a retimed plate must never carry his speech (CLAUDE.md rule 5)`);
  }
  const rate = playbackRate === undefined ? {} : { playbackRate };
  if (probe) {
    if (transparent) return null;
    return <div style={{ width: "100%", height: "100%", background: probe, ...style }} />;
  }
  return (
    <>
    {useWebCodecs ? <Video src={staticFile(selectedSrc)} trimBefore={toFrame(startFromSec, fps)} muted={muted || hasProxy} style={videoStyle} {...rate} /> : <OffthreadVideo
      src={staticFile(selectedSrc)}
      startFrom={toFrame(startFromSec, fps)}
      muted={muted || hasProxy}
      transparent={transparent}
      style={videoStyle}
      {...rate}
    />}
    {hasProxy && !muted ? <Audio src={staticFile(src)} startFrom={toFrame(startFromSec, fps)} /> : null}
    </>
  );
};


export const useWindowGeo = (keys: [number, WindowGeo][], morph: "bezier" | "snap" = "bezier", outOffsetSec = 0): WindowGeo => {
  const { frame, fps, t: local } = useClock();
  const t = local + outOffsetSec;
  if (keys.length === 1) return keys[0][1];
  if (morph === "snap") {



    const f = frame + toFrame(outOffsetSec, fps);
    let geo = keys[0][1];
    for (const [at, g] of keys) if (f >= toFrame(at, fps)) geo = g;
    return geo;
  }
  const times = keys.map(([at]) => at);
  const pick = (k: keyof WindowGeo) =>
    px(
      interpolate(
        t,
        times,
        keys.map(([, g]) => g[k]),
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.bezierMorph },
      ),
    );
  return { windowTop: pick("windowTop"), windowHeight: pick("windowHeight"), videoWidth: pick("videoWidth"), videoLeft: pick("videoLeft"), videoTop: pick("videoTop") };
};





export const WindowPlate: React.FC<{
  src: string;
  geo: WindowGeo;
  sourceAspect?: number;
  startFromSec?: number;
  muted?: boolean;
}> = ({ src, geo, sourceAspect = 16 / 9, startFromSec = 0, muted = false }) => (
  <div style={{ position: "absolute", left: 0, width: "100%", top: geo.windowTop, height: geo.windowHeight, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: geo.videoLeft, top: geo.videoTop, width: geo.videoWidth, height: px(geo.videoWidth * sourceAspect) }}>
      <Footage src={src} startFromSec={startFromSec} muted={muted} />
    </div>
  </div>
);


export const ContinuousWindowPlate: React.FC<{
  src:string;geo:WindowGeo;visible?:boolean;sourceAspect?:number;startFromSec?:number;
}> = ({src,geo,visible=true,sourceAspect=16/9,startFromSec=0}) => {
  const probe=useProbe();
  const {fps}=useClock();
  return <>
    {!probe?<Audio src={staticFile(src)} startFrom={toFrame(startFromSec,fps)}/>:null}
    {visible?<WindowPlate src={src} geo={geo} sourceAspect={sourceAspect} startFromSec={startFromSec} muted/>:null}
  </>;
};






export const useCamBox = (cams: [number, Cam][], W: number, H: number) => {
  const { t } = useClock();
  const times = cams.map(([at]) => at);
  const pick = (k: keyof Cam, dflt: number) =>
    cams.length === 1
      ? (cams[0][1][k] ?? dflt)
      : interpolate(
          t,
          times,
          cams.map(([, c]) => c[k] ?? dflt),
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.bezierCam },
        );
  const s = pick("scale", 1);
  const ax = pick("ax", 0.5);
  const ay = pick("ay", 0.29);
  const w = px(W * s);
  const h = px(H * s);
  return { w, h, left: px(ax * (W - w)), top: px(ay * (H - h)), scale: s };
};


export const CamPlate: React.FC<{
  src: string;
  cams: [number, Cam][];
  W: number;
  H: number;
  transparent?: boolean;
  muted?: boolean;
  style?: React.CSSProperties;
  background?: string;
}> = ({ src, cams, W, H, transparent = false, muted = false, style, background }) => {
  const box = useCamBox(cams, W, H);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: transparent ? undefined : background, ...style }}>
      <div style={{ position: "absolute", width: box.w, height: box.h, left: box.left, top: box.top }}>
        <Footage src={src} transparent={transparent} muted={transparent ? true : muted} />
      </div>
    </div>
  );
};





export const joinSteps = (joins: number[], fps: number, base: Cam, punch: Cam, first: Cam = base): [number, Cam][] => {
  const out: [number, Cam][] = [[0, first]];
  joins.forEach((j, i) => {
    const f = toFrame(j, fps);
    const prev = out[out.length - 1][1];
    out.push([(f - 1) / fps, { ...prev }]);
    out.push([f / fps, i % 2 === 0 ? punch : base]);
  });
  return out;
};
