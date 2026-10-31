import {familyDesign} from '../styles/family-designs';
import type {EditScene} from '../prepared-edit/schema.ts';
import React from "react";
import { Sequence, type CalculateMetadataFunction } from "remotion";
import { SafeRoot } from "../core/safe";
import { FlashBloom, LightLeak, Whiteout } from "../core/transitions";
import { getGalleryCut } from "../styles/themes";
import { getSceneTheme, getSceneGeometry } from "./primitives";
import {
  creativeGallerySchema,
  getGalleryDuration,
  getSceneTimeline,
  type CreativeGalleryProps,
  type SceneFamily,
} from "./schema";
import {
  CommentGateScene,
  ComparisonScene,
  FollowScene,
  IntroScene,
  ProcessScene,
  ProofScene,
} from "./scenes";


export const calculateCreativeGalleryMetadata: CalculateMetadataFunction<
  CreativeGalleryProps
> = ({ props }) => {
  const validated = creativeGallerySchema.parse(props);
  return {
    props: { ...validated, plates: [] },
    durationInFrames: getGalleryDuration(validated),
  };
};

const GalleryScene: React.FC<{
  family: SceneFamily;
  props: CreativeGalleryProps;
  sectionIndex?: number;
}> = ({ family, props, sectionIndex }) => {
  const options = {
    style: props.style,
    motion: props.motion,
    layout: props.layout,
  };
  const Design = familyDesign(props.style, family);
  if (Design) {
    const seam = getSceneGeometry(props.style, 'split').canvasHeight;
    const scene = {id:family,family,layout:props.layout,motion:props.motion,fromFrame:0,durationInFrames:props.framesPerScene,data:props[family]} as EditScene;
    return <Design scene={scene} style={props.style} sectionIndex={sectionIndex} geometry={{windowTop:seam,windowHeight:1920-seam,videoWidth:1080,videoLeft:0,videoTop:-340}} aspect={16/9} seam={seam}/>;
  }
  switch (family) {
    case "intro":
      return <IntroScene {...options} data={props.intro} />;
    case "proof":
      return <ProofScene {...options} data={props.proof} />;
    case "process":
      return <ProcessScene {...options} data={props.process} />;
    case "comparison":
      return <ComparisonScene {...options} data={props.comparison} />;
    case "comment":
      return <CommentGateScene {...options} data={props.comment} />;
    case "follow":
      return <FollowScene {...options} data={props.follow} />;
  }
};


export const CreativeKitGallery: React.FC<CreativeGalleryProps> = (input) => {
  const props = React.useMemo(
    () => creativeGallerySchema.parse(input),
    [input],
  );
  const theme = getSceneTheme(props.style);
  const galleryCut = getGalleryCut(props.style);
  return (
    <SafeRoot
      guides={props.guides}
      probe={props.probe}
      probeSurfaces={props.probeSurfaces}
      style={{ background: theme.background }}
    >
      {getSceneTimeline(props).map((slot, index) => (
        <Sequence
          key={slot.family}
          name={`${index + 1}. ${slot.family}`}
          from={slot.from}
          durationInFrames={slot.durationInFrames}
        >
          <GalleryScene family={slot.family} props={props} sectionIndex={props.layout==='takeover'?index+1:undefined} />
          {index > 0 && galleryCut !== "none" ? (
            galleryCut === "flash-bloom" ? (
              <FlashBloom at={0} />
            ) : index % 2 === 0 ? (
              <LightLeak at={0} variant="split" />
            ) : (
              <Whiteout at={0} shape="flash" />
            )
          ) : null}
        </Sequence>
      ))}
    </SafeRoot>
  );
};
