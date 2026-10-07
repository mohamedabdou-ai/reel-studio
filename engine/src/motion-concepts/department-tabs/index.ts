import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { DepartmentTabs } from "./scene";
import { departmentTabsDemo, departmentTabsSchema, type DepartmentTabsData } from "./schema.ts";

export const concept: ConceptDef<DepartmentTabsData> = {
  id: "department-tabs",
  title: "Department tabs",
  message: "The same automation idea applied across every department.",
  family: "stack",
  tags: [
    "tabs",
    "departments",
    "automation",
    "business",
    "operating system",
    "sliding indicator",
    "تبويبات",
    "أقسام",
    "أتمتة",
    "شركة",
    "نظام تشغيل",
    "قسم",
  ],
  schema: departmentTabsSchema,
  demo: departmentTabsDemo,
  Component: DepartmentTabs,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
