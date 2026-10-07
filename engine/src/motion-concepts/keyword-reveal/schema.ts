import { z } from "zod";
import { copy } from "../fields.ts";

export const KEYWORD_MAX = 14;
export const SUBHEADLINE_MAX = 80;

export const keywordRevealSchema = z.strictObject({

  keyword: copy(KEYWORD_MAX),

  subheadline: copy(SUBHEADLINE_MAX),
});

export type KeywordRevealData = z.infer<typeof keywordRevealSchema>;






export const keywordRevealDemo: KeywordRevealData = {
  keyword: "إطلاق",
  subheadline: "SAMPLE: الـ AI agent الجديد جاهز، جرّبه دلوقتي وشوف الفرق بنفسك",
};
