import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";
import { px, useClock } from "../core/motion";
import type { DigitSet } from "../core/numbers";
import { CanvasFill, FRAME, contentBox, useProbe, zone, type ProfileId } from "../core/safe";
import { isArabic } from "../core/type";
import { CreativeFonts, FitText, SceneCaption, getSceneTheme, type SceneTheme } from "../creative-kit/primitives";
import type { StyleFamily } from "../creative-kit/schema";
import { uiColors } from "../creative-kit/ui-chat";
import { mixColor, withAlpha } from "./color.ts";
import { captionIssues } from "./fields.ts";
import { captionCenterY, type ConceptBox, type Rect } from "./geometry.ts";
import { minFramesAtFps } from "./timeline.ts";
import { CONCEPT_FPS, type ConceptBackdrop, type ConceptMode, type ConceptSceneProps } from "./types.ts";

export type { ConceptBox, Rect } from "./geometry.ts";
export { mixColor as tint, withAlpha as alpha, uiColors };


export const CONCEPT_PROFILE: ProfileId = "ig-reels-organic";

export const CONCEPT_BOX: ConceptBox = { ...contentBox(CONCEPT_PROFILE), rail: zone(CONCEPT_PROFILE).rail };

export const DEFAULT_CONCEPT_STYLE: StyleFamily = "kinetic-paper";



export type ConceptContext = {
  style: StyleFamily;
  theme: SceneTheme;
  box: ConceptBox;
  mode: ConceptMode;
  backdrop: ConceptBackdrop;
};

const Ctx = React.createContext<ConceptContext | null>(null);

export const useConcept = (): ConceptContext => {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("motion-concepts: useConcept() called outside <ConceptStage>");
  return c;
};
export const useConceptBox = (): ConceptBox => useConcept().box;








export const useConceptTimeline = (minFrames = 1): { frame: number; fps: number; duration: number } => {
  const { frame, fps } = useClock();
  const { durationInFrames, width, height } = useVideoConfig();
  if (width !== FRAME.width || height !== FRAME.height) {
    throw new Error(`motion-concepts: needs a ${FRAME.width}x${FRAME.height} canvas, got ${width}x${height}`);
  }
  const floor = minFramesAtFps(minFrames, fps);
  if (durationInFrames < floor) {
    const at30 = fps === CONCEPT_FPS ? "" : ` (${minFrames} frames at ${CONCEPT_FPS} fps = ${(minFrames / CONCEPT_FPS).toFixed(1)} s, ${floor} at ${fps} fps)`;
    throw new Error(`motion-concepts: this Sequence is ${durationInFrames} frames; the concept needs at least ${floor}${at30}`);
  }
  return { frame, fps, duration: durationInFrames };
};

export type ConceptStageProps = Omit<ConceptSceneProps<unknown>, "data"> & { children: React.ReactNode };







export const ConceptStage: React.FC<ConceptStageProps> = ({
  style = DEFAULT_CONCEPT_STYLE,
  mode = "once",
  backdrop = "canvas",
  caption,
  children,
}) => {


  if (caption) {
    const problems = captionIssues(caption);
    if (problems.length > 0) throw new Error(`motion-concepts: ${problems.join("; ")}: ${JSON.stringify(caption)}`);
  }
  const theme = React.useMemo(() => getSceneTheme(style), [style]);
  const value = React.useMemo<ConceptContext>(() => ({ style, theme, box: CONCEPT_BOX, mode, backdrop }), [style, theme, mode, backdrop]);
  return (
    <Ctx.Provider value={value}>
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
        {backdrop === "canvas" ? <CanvasFill background={theme.background} /> : null}
        <CreativeFonts>
          {children}
          {caption ? <ConceptCaption text={caption} /> : null}
        </CreativeFonts>
      </div>
    </Ctx.Provider>
  );
};













export const ConceptCaption: React.FC<{ text: string }> = ({ text }) => {
  const { theme, box } = useConcept();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, direction: dirOf(text), unicodeBidi: "isolate" }}>
      <SceneCaption text={text} theme={theme} center={captionCenterY(box)} />
    </div>
  );
};




export const Dressing: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const probe = useProbe();
  return probe === null ? <>{children}</> : null;
};




export const dirOf = (text: string): "rtl" | "ltr" => (isArabic(text) ? "rtl" : "ltr");


export const Bidi: React.FC<{ children: React.ReactNode; dir?: "ltr" | "rtl" | "auto"; style?: React.CSSProperties }> = ({
  children,
  dir = "auto",
  style,
}) => (
  <bdi dir={dir} style={{ unicodeBidi: "isolate", ...style }}>
    {children}
  </bdi>
);

type FitTextProps = React.ComponentProps<typeof FitText>;








export const ConceptText: React.FC<FitTextProps> = (props) => {
  const dir = dirOf(props.text);
  return (
    <FitText
      {...props}
      align={props.align ?? (dir === "rtl" ? "right" : "left")}
      style={{ direction: dir, unicodeBidi: "isolate", ...props.style }}
    />
  );
};





export const digitsFor = (text: string): DigitSet => (isArabic(text) ? "arabic-indic" : "latin");
export const numberFont = (theme: SceneTheme, digits: DigitSet): string => (digits === "arabic-indic" ? theme.ar : theme.display);









export type ConceptGlyph = (props: { size?: number; strokeWidth?: number; color?: string }) => React.ReactNode;





export const ConceptIcon: React.FC<{
  src?: string;
  name: string;
  size: number;
  theme: SceneTheme;
  glyph?: ConceptGlyph;
  style?: React.CSSProperties;
}> = ({ src, name, size, theme, glyph: Glyph, style }) => {
  const radius = px(size * (theme.grammar?.card === "rounded-ui" || theme.grammar === undefined ? 0.26 : 0.08));
  if (src) {
    return <Img src={staticFile(src)} style={{ width: size, height: size, objectFit: "contain", borderRadius: radius, ...style }} />;
  }
  const { accentFill, onAccentFill } = uiColors(theme);
  const letter = Array.from(name.trim())[0] ?? "•";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: accentFill,
        color: onAccentFill,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        ...style,
      }}
    >
      {Glyph ? (
        <Glyph size={px(size * 0.56)} strokeWidth={2.4} color={onAccentFill} />
      ) : (
        <span style={{ fontFamily: isArabic(letter) ? theme.ar : theme.display, fontWeight: 700, fontSize: px(size * 0.52), lineHeight: 1 }}>
          {letter.toLocaleUpperCase("en")}
        </span>
      )}
    </div>
  );
};



export type StyleShape = {

  pillK: number;

  windowRadius: number;

  ring: number;

  hardOffset: number;

  soft: boolean;
};


export const styleShape = (theme: SceneTheme): StyleShape => {
  switch (theme.grammar?.card) {
    case "ink-frame":
      return { pillK: 0.16, windowRadius: 0, ring: 3, hardOffset: 7, soft: false };
    case "offset-plate":
      return { pillK: 0, windowRadius: 0, ring: 2, hardOffset: 7, soft: false };
    case "receipt-sheet":
      return { pillK: 0.1, windowRadius: 4, ring: 2, hardOffset: 0, soft: false };
    case "taped-paper":
      return { pillK: 0.06, windowRadius: 2, ring: 2, hardOffset: 5, soft: false };
    case "verdict-board":
      return { pillK: 0.08, windowRadius: 4, ring: 2, hardOffset: 0, soft: false };
    default:
      return { pillK: 1, windowRadius: 36, ring: 2, hardOffset: 0, soft: true };
  }
};








export const SOFT_SHADOW = { offsetY: 8, blur: 20, alpha: 0.16 } as const;






export const surfaceShadow = (theme: SceneTheme, ringColor: string): string => {
  const s = styleShape(theme);
  const parts = [`0 0 0 ${s.ring}px ${ringColor}`];
  if (s.hardOffset > 0) parts.push(`${s.hardOffset}px ${s.hardOffset}px 0 ${s.ring}px ${theme.border}`);
  else if (s.soft) parts.push(`0 ${SOFT_SHADOW.offsetY}px ${SOFT_SHADOW.blur}px rgba(0, 0, 0, ${SOFT_SHADOW.alpha})`);
  return parts.join(", ");
};


export const surfaceStyle = (theme: SceneTheme, radius?: number): React.CSSProperties => ({
  background: theme.card,
  borderRadius: radius ?? styleShape(theme).windowRadius,
  boxShadow: surfaceShadow(theme, theme.border),
});


export const rectStyle = (r: Rect): React.CSSProperties => ({
  position: "absolute",
  left: px(r.x),
  top: px(r.y),
  width: px(r.width),
  height: px(r.height),
});
