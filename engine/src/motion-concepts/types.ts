import type React from "react";
import type { ZodType } from "zod";
import type { StyleFamily } from "../creative-kit/schema.ts";


export const CONCEPT_FPS = 30;

export const CONCEPT_DEFAULT_FRAMES = 240;

export const HOLD_MIN_FRACTION = 0.2;























export const CAPTION_MAX = 44;


export const CONCEPT_IDS = [
  "button-to-window",
  "prompt-to-results",
  "brief-to-workspace",
  "department-tabs",
  "data-morph",
  "kpi-zoom",
  "tool-stack-spread",
  "magnetic-dock",
  "keyword-reveal",
  "headline-to-system",
  "panel-reveal",
  "system-layers",
  "glass-lens",
  "automation-flow",
  "chaos-to-brand",
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];


export const CONCEPT_FAMILIES = ["morph", "data", "stack", "reveal", "flow", "type"] as const;
export type ConceptFamily = (typeof CONCEPT_FAMILIES)[number];






export const SUGGESTED_FAMILY: Readonly<Record<ConceptId, ConceptFamily>> = {
  "button-to-window": "morph",
  "prompt-to-results": "flow",
  "brief-to-workspace": "morph",
  "department-tabs": "stack",
  "data-morph": "data",
  "kpi-zoom": "data",
  "tool-stack-spread": "stack",
  "magnetic-dock": "stack",
  "keyword-reveal": "type",
  "headline-to-system": "type",
  "panel-reveal": "reveal",
  "system-layers": "stack",
  "glass-lens": "reveal",
  "automation-flow": "flow",
  "chaos-to-brand": "morph",
};






export type ConceptMode = "once" | "loop";

export type ConceptBackdrop = "canvas" | "none";


export type ConceptSceneProps<D> = {

  style?: StyleFamily;
  data: D;

  mode?: ConceptMode;

  backdrop?: ConceptBackdrop;






  caption?: string;
};


export type ConceptDef<D> = {
  id: ConceptId;

  title: string;

  message: string;
  family: ConceptFamily;

  tags: readonly string[];

  schema: ZodType<D>;

  demo: D;
  Component: React.FC<ConceptSceneProps<D>>;









  minFrames: number;

  defaultFrames: number;

  loopable: boolean;
};


export const conceptDefIssues = (def: {
  id: unknown;
  title: unknown;
  message: unknown;
  family: unknown;
  tags: unknown;
  schema: unknown;
  demo: unknown;
  Component: unknown;
  minFrames: unknown;
  defaultFrames: unknown;
  loopable: unknown;
}): string[] => {
  const issues: string[] = [];
  if (!(CONCEPT_IDS as readonly unknown[]).includes(def.id)) issues.push(`id ${String(def.id)} is not one of CONCEPT_IDS`);
  if (typeof def.title !== "string" || def.title.trim().length < 3) issues.push("title must be a non-empty English name");
  if (typeof def.message !== "string" || !/^[^.!?]+[.]$/.test(def.message.trim())) issues.push("message must be ONE sentence ending with a full stop");
  if (!(CONCEPT_FAMILIES as readonly unknown[]).includes(def.family)) issues.push(`family ${String(def.family)} is not one of CONCEPT_FAMILIES`);
  const tags = Array.isArray(def.tags) ? (def.tags as unknown[]) : [];
  const latin = tags.filter((t) => typeof t === "string" && /[A-Za-z]/.test(t)).length;
  const arabic = tags.filter((t) => typeof t === "string" && /[؀-ۿ]/.test(t)).length;
  if (tags.some((t) => typeof t !== "string" || t.trim() === "")) issues.push("tags must be non-blank strings");
  if (latin < 3) issues.push(`tags need >= 3 English terms, got ${latin}`);
  if (arabic < 3) issues.push(`tags need >= 3 Arabic terms, got ${arabic}`);
  if (typeof (def.schema as { parse?: unknown } | null)?.parse !== "function") issues.push("schema must be a zod schema");
  else {
    try {
      (def.schema as { parse: (v: unknown) => unknown }).parse(def.demo);
    } catch (e) {
      issues.push(`demo does not satisfy its own schema: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }
  if (typeof def.Component !== "function") issues.push("Component must be a React function component");
  if (def.defaultFrames !== CONCEPT_DEFAULT_FRAMES) issues.push(`defaultFrames must be ${CONCEPT_DEFAULT_FRAMES}`);
  if (!Number.isInteger(def.minFrames) || (def.minFrames as number) < 90 || (def.minFrames as number) > CONCEPT_DEFAULT_FRAMES) {
    issues.push("minFrames must be a whole number in 90..240");
  }
  if (typeof def.loopable !== "boolean") issues.push("loopable must be a boolean");
  return issues;
};
