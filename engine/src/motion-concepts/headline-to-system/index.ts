import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { HeadlineToSystem } from "./scene";
import { headlineToSystemDemo, headlineToSystemSchema, type HeadlineToSystemData } from "./schema.ts";

export const concept: ConceptDef<HeadlineToSystemData> = {
  id: "headline-to-system",
  title: "Headline to content system",
  message: "One idea becomes many content assets.",
  family: "type",
  tags: [
    "headline",
    "content system",
    "hub",
    "one idea",
    "repurposing",
    "connectors",
    "عنوان",
    "فكرة",
    "نظام محتوى",
    "محور",
    "إعادة استخدام المحتوى",
    "توصيلات",
  ],
  schema: headlineToSystemSchema,
  demo: headlineToSystemDemo,
  Component: HeadlineToSystem,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
