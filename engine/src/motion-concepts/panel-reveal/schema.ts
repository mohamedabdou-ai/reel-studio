import { z } from "zod";
import { assetPath, copy } from "../fields.ts";


export const TITLE_WORD_MAX = 32;

const wordsFit = (s: string): boolean => s.split(/\s+/).every((w) => w.length <= TITLE_WORD_MAX);

export const panelRevealSchema = z.strictObject({

  visualSrc: assetPath.optional(),

  title: copy(56).refine(wordsFit, `No single word longer than ${TITLE_WORD_MAX} characters: it cannot wrap inside the title box`),

  cta: copy(40),
});

export type PanelRevealData = z.infer<typeof panelRevealSchema>;


export const panelRevealDemo: PanelRevealData = {
  title: "ورشة SAMPLE: بناء AI Agent من الصفر",
  cta: "١٢ أكتوبر · احجز مكانك دلوقتي",
};
