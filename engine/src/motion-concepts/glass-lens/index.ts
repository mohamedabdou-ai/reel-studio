import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { GlassLens } from "./scene";
import { glassLensDemo, glassLensSchema, type GlassLensData } from "./schema.ts";

export const concept: ConceptDef<GlassLensData> = {
  id: "glass-lens",
  title: "Glass focus lens",
  message: "Focus on the metric that matters.",
  family: "reveal",
  tags: [
    "lens",
    "focus",
    "magnifier",
    "kpi",
    "metrics",
    "report",
    "spotlight",
    "عدسة",
    "تركيز",
    "مؤشر أداء",
    "تقرير",
    "تكبير",
    "مقاييس",
  ],
  schema: glassLensSchema,
  demo: glassLensDemo,
  Component: GlassLens,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
