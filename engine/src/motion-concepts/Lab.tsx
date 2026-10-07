import React from "react";
import { SafeRoot, type SafeProps } from "../core/safe";
import { getSceneTheme } from "../creative-kit/primitives";
import type { StyleFamily } from "../creative-kit/schema";
import { conceptMeta, type ConceptMeta } from "./catalog.ts";
import { getConcept, type AnyConcept } from "./registry";
import { CONCEPT_BOX, DEFAULT_CONCEPT_STYLE, Dressing } from "./shared";
import type { ConceptId, ConceptMode } from "./types.ts";

export type ConceptLabProps = SafeProps & {
  id: ConceptId;

  style?: StyleFamily;

  mode?: ConceptMode;





  caption?: string;
};


export const conceptLabMeta = (concept: Pick<AnyConcept, "id" | "defaultFrames">): ConceptMeta => conceptMeta(concept);


export const conceptLabDefaults = (concept: Pick<AnyConcept, "id">): { guides: false; id: ConceptId; style: StyleFamily; mode: ConceptMode } => ({
  guides: false,
  id: concept.id,
  style: DEFAULT_CONCEPT_STYLE,
  mode: "once",
});


const NOTE_SIZE = 20;

const SampleNote: React.FC<{ id: ConceptId; style: StyleFamily; mode: ConceptMode }> = ({ id, style, mode }) => {
  const theme = getSceneTheme(style);
  return (
    <Dressing>
      <div
        style={{
          position: "absolute",
          left: CONCEPT_BOX.left,
          width: CONCEPT_BOX.width,
          top: CONCEPT_BOX.top - 56,
          fontFamily: theme.mono,
          fontWeight: 600,
          fontSize: NOTE_SIZE,
          letterSpacing: 1,
          whiteSpace: "nowrap",
          color: theme.dim,
        }}
      >
        {`SAMPLE DATA · ${id} · ${style} · ${mode}`}
      </div>
    </Dressing>
  );
};


export const ConceptLab: React.FC<ConceptLabProps> = ({ id, style = DEFAULT_CONCEPT_STYLE, mode = "once", caption, guides, probe, plates, noPlates }) => {
  const concept = getConcept(id);
  const Scene = concept.Component;
  return (
    <SafeRoot guides={guides} probe={probe} plates={plates} noPlates={noPlates}>
      <Scene style={style} data={concept.demo} mode={mode} backdrop="canvas" caption={caption} />
      <SampleNote id={id} style={style} mode={mode} />
    </SafeRoot>
  );
};
