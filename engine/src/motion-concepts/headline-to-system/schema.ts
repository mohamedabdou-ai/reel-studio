import { z } from "zod";
import { copy, listOf } from "../fields.ts";

export const CORE_IDEA_MAX = 48;
export const CORE_IDEA_WORD_MAX = 22;


const wordsUpTo = (max: number) => (s: string) => s.split(/\s+/).every((w) => Array.from(w).length <= max);


export const headlineAssetSchema = z.strictObject({
  label: copy(22),
});

export const headlineToSystemSchema = z.strictObject({

  coreIdea: copy(CORE_IDEA_MAX).refine(wordsUpTo(CORE_IDEA_WORD_MAX), `Each word of the headline is at most ${CORE_IDEA_WORD_MAX} characters`),

  assets: listOf(headlineAssetSchema, 4, 4),
});

export type HeadlineAsset = z.infer<typeof headlineAssetSchema>;
export type HeadlineToSystemData = z.infer<typeof headlineToSystemSchema>;


export const headlineToSystemDemo: HeadlineToSystemData = {
  coreIdea: "SAMPLE: فكرة واحدة تبقى محتوى أسبوع",
  assets: [{ label: "بوست على السوشيال" }, { label: "Reel قصير" }, { label: "Carousel تعليمي" }, { label: "نشرة Email" }],
};
