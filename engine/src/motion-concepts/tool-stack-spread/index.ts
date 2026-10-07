import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { ToolStackSpread } from "./scene";
import { toolStackSpreadDemo, toolStackSpreadSchema, type ToolStackSpreadData } from "./schema.ts";

export const concept: ConceptDef<ToolStackSpreadData> = {
  id: "tool-stack-spread",
  title: "Tool stack spread",
  message: "The whole stack, laid out in one glance.",
  family: "stack",
  tags: [
    "tool stack",
    "cards",
    "spread",
    "deck",
    "tools list",
    "overview",
    "ستاك الأدوات",
    "كروت",
    "الأدوات",
    "نظرة شاملة",
    "فرد الكروت",
    "قائمة أدوات",
  ],
  schema: toolStackSpreadSchema,
  demo: toolStackSpreadDemo,
  Component: ToolStackSpread,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
