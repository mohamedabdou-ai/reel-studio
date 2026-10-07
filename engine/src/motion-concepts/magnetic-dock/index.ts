import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { MagneticDock } from "./scene";
import { magneticDockDemo, magneticDockSchema, type MagneticDockData } from "./schema.ts";

export const concept: ConceptDef<MagneticDockData> = {
  id: "magnetic-dock",
  title: "Magnetic dock",
  message: "Meet the tools, one by one.",
  family: "stack",
  tags: [
    "dock",
    "magnify",
    "tool stack",
    "toolbar",
    "cursor",
    "icons",
    "دوك",
    "أدوات",
    "تكبير",
    "شريط الأدوات",
    "أيقونات",
    "مؤشر",
  ],
  schema: magneticDockSchema,
  demo: magneticDockDemo,
  Component: MagneticDock,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
