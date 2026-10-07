import React from "react";
import {
  crossfadePalette,
  crossfadeProgress,
  describeIssues,
  mergeTheme,
  themeContrastIssues,
  validateChapter,
  type ChapterPalette,
} from "../core/chapters";
import { px, useClock } from "../core/motion";
import { CanvasFill, FRAME } from "../core/safe";
import { getSceneTheme, type SceneTheme } from "./primitives";
import type { StyleFamily } from "./schema";
import type {PreferredFont} from '../core/preference-options.ts';

const ChapterCtx = React.createContext<ChapterPalette | null>(null);
const TypographyCtx = React.createContext<PreferredFont | null>(null);
export const TypographyProvider: React.FC<{fontFamily: PreferredFont | null; children?: React.ReactNode}> = ({fontFamily, children}) =>
  <TypographyCtx.Provider value={fontFamily}>{children}</TypographyCtx.Provider>;

const assertChapter = (chapter: ChapterPalette, where: string): void => {
  const verdict = validateChapter(chapter);
  if (!verdict.ok) {
    throw new Error(
      `creative-kit ${where}: chapter ${JSON.stringify(chapter)} fails ${describeIssues(verdict.issues)}. Choose chapter colours with at least 4.5:1 contrast.`,
    );
  }
};


export const ChapterThemeProvider: React.FC<{
  chapter: ChapterPalette | null;
  children?: React.ReactNode;
}> = ({ chapter, children }) => {
  if (chapter) assertChapter(chapter, "ChapterThemeProvider");
  return <ChapterCtx.Provider value={chapter}>{children}</ChapterCtx.Provider>;
};


export const useChapter = (): ChapterPalette | null => React.useContext(ChapterCtx);

export type SceneThemeOptions = {

  inkOnAccent?: boolean;
};






export const useSceneTheme = (
  style: StyleFamily,
  opts: SceneThemeOptions = {},
): SceneTheme => {
  const chapter = React.useContext(ChapterCtx);
  const fontFamily = React.useContext(TypographyCtx);
  const inkOnAccent = opts.inkOnAccent === true;
  return React.useMemo(() => {
    const base = getSceneTheme(style);
    const merged = chapter ? mergeTheme(base, chapter) : base;

    if (chapter) {
      const issues = themeContrastIssues(merged, {
        inkOnAccent: inkOnAccent || base.grammar?.annotation === "signal-strip",
      });
      if (issues.length) {
        throw new Error(
          `creative-kit useSceneTheme(${style}): chapter ${JSON.stringify(chapter)} fails ${describeIssues(issues)}.`,
        );
      }
    }
    return fontFamily ? {...merged, ar: fontFamily, display: fontFamily} : merged;
  }, [style, chapter, inkOnAccent, fontFamily]);
};

export type ChapterCrossfadeProps = {
  from: ChapterPalette;
  to: ChapterPalette;

  atFrame: number;

  durF: number;

  height?: number;
};







export const ChapterCrossfade: React.FC<ChapterCrossfadeProps> = ({
  from,
  to,
  atFrame,
  durF,
  height = FRAME.height,
}) => {
  const { frame } = useClock();
  if (!Number.isInteger(atFrame) || !Number.isInteger(durF) || durF < 1) {
    throw new Error(
      `creative-kit ChapterCrossfade: atFrame (${atFrame}) and durF (${durF}) must be whole frames, durF >= 1.`,
    );
  }
  assertChapter(from, "ChapterCrossfade from");
  assertChapter(to, "ChapterCrossfade to");
  const ground = crossfadePalette(
    from,
    to,
    crossfadeProgress(frame, atFrame, durF),
  ).ground;
  return (
    <CanvasFill
      background={ground}
      style={
        height >= FRAME.height ? undefined : { bottom: "auto", height: px(height) }
      }
    />
  );
};
