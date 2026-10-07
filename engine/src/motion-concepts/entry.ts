import React from "react";
import { Composition, registerRoot, type CalculateMetadataFunction } from "remotion";
import { ConceptLab, conceptLabDefaults, conceptLabMeta } from "./Lab";
import { MOTION_CONCEPTS } from "./registry";


const withoutPlates = (): CalculateMetadataFunction<Record<string, unknown>> => ({ props }) => ({ props: { ...props, plates: [], noPlates: true } });


const ConceptComposition = Composition as unknown as React.FC<Record<string, unknown>>;

export const ConceptRoot: React.FC = () =>
  React.createElement(
    React.Fragment,
    null,
    ...MOTION_CONCEPTS.map((concept) => {
      const meta = conceptLabMeta(concept);
      return React.createElement(ConceptComposition, {
        key: meta.id,
        id: meta.id,
        component: ConceptLab,
        durationInFrames: meta.durationInFrames,
        fps: meta.fps,
        width: meta.width,
        height: meta.height,
        defaultProps: conceptLabDefaults(concept),
        calculateMetadata: withoutPlates(),
      });
    }),
  );

registerRoot(ConceptRoot);
