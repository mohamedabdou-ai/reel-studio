import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { KeywordReveal } from "./scene";
import { keywordRevealDemo, keywordRevealSchema, type KeywordRevealData } from "./schema.ts";

export const concept: ConceptDef<KeywordRevealData> = {
  id: "keyword-reveal",
  title: "Keyword outline reveal",
  message: "The launch word, filling with meaning.",
  family: "type",
  tags: [
    "keyword",
    "outline",
    "text reveal",
    "typography",
    "headline",
    "launch",
    "generative",
    "كلمة مفتاحية",
    "حروف",
    "عنوان",
    "كشف",
    "إطلاق",
    "تعبئة",
  ],
  schema: keywordRevealSchema,
  demo: keywordRevealDemo,
  Component: KeywordReveal,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
