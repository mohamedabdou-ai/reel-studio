import React from "react";
import { mergeTheme, type ChapterPalette } from "../core/chapters";
import { getSceneTheme, type SceneTheme } from "./primitives";
import type { StyleFamily } from "./schema";



export const useBrandTheme = (style: StyleFamily, brand: ChapterPalette | null): SceneTheme =>
  React.useMemo(() => (brand ? mergeTheme(getSceneTheme(style), brand) : getSceneTheme(style)), [style, brand]);
