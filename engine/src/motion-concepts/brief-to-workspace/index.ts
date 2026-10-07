import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { BriefToWorkspace } from "./scene";
import { briefToWorkspaceDemo, briefToWorkspaceSchema, type BriefToWorkspaceData } from "./schema.ts";

export const concept: ConceptDef<BriefToWorkspaceData> = {
  id: "brief-to-workspace",
  title: "Brief to workspace",
  message: "A short brief unfolds into a complete plan.",
  family: "morph",
  tags: [
    "brief",
    "workspace",
    "plan",
    "panels",
    "expand",
    "project setup",
    "بريف",
    "مساحة عمل",
    "خطة",
    "لوحات",
    "توسيع",
    "مشروع",
  ],
  schema: briefToWorkspaceSchema,
  demo: briefToWorkspaceDemo,
  Component: BriefToWorkspace,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
