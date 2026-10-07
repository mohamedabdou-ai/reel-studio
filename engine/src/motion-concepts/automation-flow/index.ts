import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { AutomationFlow } from "./scene";
import { automationFlowDemo, automationFlowSchema, type AutomationFlowData } from "./schema.ts";

export const concept: ConceptDef<AutomationFlowData> = {
  id: "automation-flow",
  title: "Automation flow pulse",
  message: "Input flows through automated steps into a business output.",
  family: "flow",
  tags: [
    "automation",
    "workflow",
    "pipeline",
    "process",
    "flow",
    "connectors",
    "أتمتة",
    "سير العمل",
    "خطوات",
    "عملية",
    "مسار",
    "ربط الأدوات",
  ],
  schema: automationFlowSchema,
  demo: automationFlowDemo,
  Component: AutomationFlow,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
