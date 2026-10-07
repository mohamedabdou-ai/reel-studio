import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { SystemLayers } from "./scene";
import { systemLayersDemo, systemLayersSchema, type SystemLayersData } from "./schema.ts";

export const concept: ConceptDef<SystemLayersData> = {
  id: "system-layers",
  title: "System layers",
  message: "Business architecture, layer by layer.",
  family: "stack",
  tags: [
    "layers",
    "system layers",
    "architecture",
    "stack",
    "perspective",
    "exploded view",
    "طبقات",
    "طبقات النظام",
    "معمارية",
    "هيكل",
    "منظور",
    "بنية العمل",
  ],
  schema: systemLayersSchema,
  demo: systemLayersDemo,
  Component: SystemLayers,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
