import { FRAME } from "../core/safe";
import { showcasePlan } from "../motion-gaps/showcase-plan";
import { CONCEPT_CANVAS, assertConceptRegistry } from "./catalog.ts";
import { CONCEPT_IDS, type ConceptDef, type ConceptId } from "./types.ts";
import { concept as buttonToWindow } from "./button-to-window/index";
import { concept as promptToResults } from "./prompt-to-results/index";
import { concept as briefToWorkspace } from "./brief-to-workspace/index";
import { concept as departmentTabs } from "./department-tabs/index";
import { concept as dataMorph } from "./data-morph/index";
import { concept as kpiZoom } from "./kpi-zoom/index";
import { concept as toolStackSpread } from "./tool-stack-spread/index";
import { concept as magneticDock } from "./magnetic-dock/index";
import { concept as keywordReveal } from "./keyword-reveal/index";
import { concept as headlineToSystem } from "./headline-to-system/index";
import { concept as panelReveal } from "./panel-reveal/index";
import { concept as systemLayers } from "./system-layers/index";
import { concept as glassLens } from "./glass-lens/index";
import { concept as automationFlow } from "./automation-flow/index";
import { concept as chaosToBrand } from "./chaos-to-brand/index";

export { CONCEPT_IDS };







export type AnyConcept = ConceptDef<any>;

const RECORDS: readonly AnyConcept[] = [
  buttonToWindow,
  promptToResults,
  briefToWorkspace,
  departmentTabs,
  dataMorph,
  kpiZoom,
  toolStackSpread,
  magneticDock,
  keywordReveal,
  headlineToSystem,
  panelReveal,
  systemLayers,
  glassLens,
  automationFlow,
  chaosToBrand,
];


if (FRAME.width !== CONCEPT_CANVAS.width || FRAME.height !== CONCEPT_CANVAS.height) {
  throw new Error(`motion-concepts registry: catalog canvas ${CONCEPT_CANVAS.width}x${CONCEPT_CANVAS.height} is not the platform frame ${FRAME.width}x${FRAME.height}`);
}
assertConceptRegistry(RECORDS);
if (RECORDS.map((c) => c.id).join() !== CONCEPT_IDS.join()) {
  throw new Error(`motion-concepts registry: records must follow CONCEPT_IDS order (${CONCEPT_IDS.join(", ")})`);
}

export const MOTION_CONCEPTS: readonly AnyConcept[] = Object.freeze([...RECORDS]);

export const getConcept = (id: ConceptId | string): AnyConcept => {
  const hit = MOTION_CONCEPTS.find((c) => c.id === id);
  if (!hit) throw new Error(`Unknown motion concept ${JSON.stringify(id)}. Choose one of: ${CONCEPT_IDS.join(", ")}.`);
  return hit;
};


export const conceptShowcaseFrames: number = showcasePlan(MOTION_CONCEPTS.map((c) => c.defaultFrames)).durationInFrames;
