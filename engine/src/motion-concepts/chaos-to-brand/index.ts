import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { ChaosToBrand } from "./scene";
import { chaosToBrandDemo, chaosToBrandSchema, type ChaosToBrandData } from "./schema.ts";

export const concept: ConceptDef<ChaosToBrandData> = {
  id: "chaos-to-brand",
  title: "Chaos to brand",
  message: "Scattered chaos organises into a brand mark and then a clean lockup.",
  family: "morph",
  tags: [
    "chaos",
    "brand",
    "logo reveal",
    "lockup",
    "particles",
    "brand identity",
    "فوضى",
    "علامة تجارية",
    "شعار",
    "هوية بصرية",
    "جسيمات",
    "تنظيم",
  ],
  schema: chaosToBrandSchema,
  demo: chaosToBrandDemo,
  Component: ChaosToBrand,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
