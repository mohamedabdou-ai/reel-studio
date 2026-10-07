import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { ButtonToWindow } from "./scene";
import { buttonToWindowDemo, buttonToWindowSchema, type ButtonToWindowData } from "./schema.ts";

export const concept: ConceptDef<ButtonToWindowData> = {
  id: "button-to-window",
  title: "Button to window",
  message: "One click becomes a live product demo.",
  family: "morph",
  tags: [
    "button",
    "cta",
    "morph",
    "product demo",
    "window",
    "call to action",
    "زرار",
    "زر",
    "ديمو",
    "نافذة",
    "دعوة لاتخاذ إجراء",
    "تحول",
  ],
  schema: buttonToWindowSchema,
  demo: buttonToWindowDemo,
  Component: ButtonToWindow,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
