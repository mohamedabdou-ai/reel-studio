import type { CSSProperties } from "react";
import { FAMILY } from "./fonts";


export const EDITOR_FONT_WEIGHTS = [400, 700] as const;
export type EditorFontWeight = (typeof EDITOR_FONT_WEIGHTS)[number];



const mixedSerif = `"${FAMILY.latinSerif}", "${FAMILY.naskh}"`;






export const EDITOR_FONT_ROLE = {
  arabicSerif: {
    fontFamily: `"${FAMILY.naskh}", "${FAMILY.latinSerif}"`,
    fontWeight: 400,
    fontSynthesis: "none",
    lineHeight: 1.7,
  },
  latinSerif: {
    fontFamily: mixedSerif,
    fontWeight: 400,
    fontSynthesis: "none",
    lineHeight: 1.7,
  },
  caption: {
    fontFamily: mixedSerif,
    fontWeight: 700,
    fontSynthesis: "none",
    lineHeight: 1.7,
  },
} as const satisfies Record<string, CSSProperties>;

export type EditorFontRole = keyof typeof EDITOR_FONT_ROLE;
