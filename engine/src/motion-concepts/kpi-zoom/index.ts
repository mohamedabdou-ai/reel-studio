import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { KpiZoom } from "./scene";
import { kpiZoomDemo, kpiZoomSchema, type KpiZoomData } from "./schema.ts";

export const concept: ConceptDef<KpiZoomData> = {
  id: "kpi-zoom",
  title: "Dashboard KPI zoom",
  message: "Out of the whole dashboard, this is the number that matters.",
  family: "data",
  tags: [
    "kpi",
    "dashboard",
    "metrics",
    "zoom",
    "focus",
    "count up",
    "analytics",
    "لوحة بيانات",
    "مؤشرات",
    "أرقام",
    "تكبير",
    "إحصائيات",
    "تركيز",
  ],
  schema: kpiZoomSchema,
  demo: kpiZoomDemo,
  Component: KpiZoom,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
