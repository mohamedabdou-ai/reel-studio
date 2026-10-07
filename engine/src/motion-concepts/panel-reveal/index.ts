import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { PanelReveal } from "./scene";
import { panelRevealDemo, panelRevealSchema, type PanelRevealData } from "./schema.ts";

export const concept: ConceptDef<PanelRevealData> = {
  id: "panel-reveal",
  title: "Panel reveal",
  message: "Panels part to reveal a course, event or product.",
  family: "reveal",
  tags: [
    "panel reveal",
    "curtain",
    "reveal",
    "event",
    "course launch",
    "product launch",
    "كشف",
    "ستارة",
    "لوحات",
    "إطلاق كورس",
    "فعالية",
    "إعلان منتج",
  ],
  schema: panelRevealSchema,
  demo: panelRevealDemo,
  Component: PanelReveal,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
