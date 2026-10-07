import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { DataMorph } from "./scene";
import { dataMorphDemo, dataMorphSchema, type DataMorphData } from "./schema.ts";

export const concept: ConceptDef<DataMorphData> = {
  id: "data-morph",
  title: "Bars morph to line",
  message: "The same data, told as a trend.",
  family: "data",
  tags: [
    "bar chart",
    "line chart",
    "data",
    "trend",
    "kpi",
    "growth",
    "morph",
    "رسم بياني",
    "أعمدة",
    "خط",
    "ترند",
    "نمو",
    "بيانات",
  ],
  schema: dataMorphSchema,
  demo: dataMorphDemo,
  Component: DataMorph,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
