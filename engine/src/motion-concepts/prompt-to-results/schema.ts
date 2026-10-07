import { z } from "zod";
import { copy, listOf } from "../fields.ts";


export const resultSchema = z.strictObject({

  title: copy(32),

  detail: copy(76),
});

export const promptToResultsSchema = z.strictObject({

  prompt: copy(90),

  results: listOf(resultSchema, 3, 3),
});

export type PromptToResultsData = z.infer<typeof promptToResultsSchema>;
export type ResultData = z.infer<typeof resultSchema>;


export const promptToResultsDemo: PromptToResultsData = {
  prompt: "جهّزلي خطة محتوى أسبوعية لمشروع SAMPLE Coffee",
  results: [
    { title: "Content calendar", detail: "جدول أسبوع كامل، كل يوم بفكرة وهدف واضح" },
    { title: "كابشنز جاهزة", detail: "ثلاث نسخ بنبرة ودودة، مع CTA واضح في الآخر" },
    { title: "Hashtags وأفكار فيديو", detail: "كلمات بحث مناسبة مع خمس أفكار فيديو قصيرة" },
  ],
};
