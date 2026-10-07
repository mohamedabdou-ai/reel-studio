import { CONCEPT_DEFAULT_FRAMES, type ConceptDef } from "../types.ts";
import { MIN_FRAMES } from "./math.ts";
import { PromptToResults } from "./scene";
import { promptToResultsDemo, promptToResultsSchema, type PromptToResultsData } from "./schema.ts";

export const concept: ConceptDef<PromptToResultsData> = {
  id: "prompt-to-results",
  title: "Prompt to result cards",
  message: "One instruction, multiple useful outputs.",
  family: "flow",
  tags: [
    "prompt",
    "ai",
    "result cards",
    "typing",
    "input field",
    "stagger",
    "برومبت",
    "أمر",
    "نتائج",
    "كروت",
    "كتابة",
    "ذكاء اصطناعي",
  ],
  schema: promptToResultsSchema,
  demo: promptToResultsDemo,
  Component: PromptToResults,
  minFrames: MIN_FRAMES,
  defaultFrames: CONCEPT_DEFAULT_FRAMES,
  loopable: true,
};
