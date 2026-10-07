import React from "react";
import { Series } from "remotion";
import { CanvasFill, SafeRoot, type SafeProps } from "../core/safe";
import { FAMILY } from "../core/fonts";
import { fitToWidth } from "../core/type";
import { CreativeFonts } from "../creative-kit/primitives";
import type { StyleFamily } from "../creative-kit/schema";
import { SLATE_FRAMES } from "../motion-gaps/showcase-plan";
import { ConceptLab } from "./Lab";
import { MOTION_CONCEPTS, type AnyConcept } from "./registry";
import { CONCEPT_BOX } from "./shared";
import type { ConceptMode } from "./types.ts";









export const SLATE_BOX = { left: CONCEPT_BOX.left + 75, width: CONCEPT_BOX.width - 150, top: CONCEPT_BOX.top + 530 } as const;
const SLATE = SLATE_BOX;
const SLATE_COLOR = { background: "#101418", counter: "#8FA3B3", title: "#FFFFFF", subtitle: "#C9D4DD", message: "#8FA3B3" } as const;


const Slate: React.FC<{ concept: AnyConcept; index: number; total: number }> = ({ concept, index, total }) => (
  <CreativeFonts>
    <SlateBody concept={concept} index={index} total={total} />
  </CreativeFonts>
);

const SlateBody: React.FC<{ concept: AnyConcept; index: number; total: number }> = ({ concept, index, total }) => {
  const counter = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")} · ${concept.family}`;
  const title = concept.id;
  const c = fitToWidth(counter, { fontFamily: FAMILY.plexMono, fontSize: 28, fontWeight: 600 }, SLATE.width, { min: 16 });
  const t = fitToWidth(title, { fontFamily: FAMILY.plexDisplay, fontSize: 64, fontWeight: 700 }, SLATE.width, { min: 28 });
  const s = fitToWidth(concept.title, { fontFamily: FAMILY.plexMono, fontSize: 30, fontWeight: 600 }, SLATE.width, { min: 16 });

  const m = fitToWidth(concept.message, { fontFamily: FAMILY.plexMono, fontSize: 24, fontWeight: 400 }, SLATE.width, { min: 14 });
  if (!c.fits || !t.fits || !s.fits || !m.fits) throw new Error(`MotionConceptsShowcase: slate text does not fit for ${concept.id}`);
  const titleTop = SLATE.top + c.lineBox + 20;
  const subTop = titleTop + t.lineBox + 18;
  const msgTop = subTop + s.lineBox + 14;
  return (
    <>
      <CanvasFill background={SLATE_COLOR.background} />
      <div style={{ position: "absolute", left: SLATE.left, top: SLATE.top, width: SLATE.width, color: SLATE_COLOR.counter, ...c.style }}>{counter}</div>
      <div style={{ position: "absolute", left: SLATE.left, top: titleTop, width: SLATE.width, color: SLATE_COLOR.title, ...t.style }}>{title}</div>
      <div style={{ position: "absolute", left: SLATE.left, top: subTop, width: SLATE.width, color: SLATE_COLOR.subtitle, ...s.style }}>{concept.title}</div>
      <div style={{ position: "absolute", left: SLATE.left, top: msgTop, width: SLATE.width, color: SLATE_COLOR.message, ...m.style }}>{concept.message}</div>
    </>
  );
};

export type MotionConceptsShowcaseProps = SafeProps & { style?: StyleFamily; mode?: ConceptMode };


export const MotionConceptsShowcase: React.FC<MotionConceptsShowcaseProps> = ({ style, mode, guides, probe }) => (
  <SafeRoot probe={probe}>
    <Series>
      {MOTION_CONCEPTS.map((concept, index) => (
        <React.Fragment key={concept.id}>
          <Series.Sequence durationInFrames={SLATE_FRAMES} name={`slate ${concept.id}`}>
            <Slate concept={concept} index={index} total={MOTION_CONCEPTS.length} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={concept.defaultFrames} name={concept.id}>
            <ConceptLab id={concept.id} style={style} mode={mode} guides={guides} probe={probe} />
          </Series.Sequence>
        </React.Fragment>
      ))}
    </Series>
  </SafeRoot>
);
