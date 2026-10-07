import React from "react";
import { Sequence, type CalculateMetadataFunction } from "remotion";
import { SafeRoot } from "../core/safe";
import { FlashBloom, LightLeak, Whiteout } from "../core/transitions";
import { getSceneTheme } from "./primitives";
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
}> = ({ family, props }) => {
  const options = {
    style: props.style,
    motion: props.motion,
    layout: props.layout,
  };
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
  return (
    <SafeRoot
      guides={props.guides}
      probe={props.probe}
      style={{ background: theme.background }}
    >
      {getSceneTimeline(props).map((slot, index) => (
        <Sequence
          key={slot.family}
          name={`${index + 1}. ${slot.family}`}
          from={slot.from}
          durationInFrames={slot.durationInFrames}
        >
          <GalleryScene family={slot.family} props={props} />
          {index > 0 && (props.style === "section-deck" || props.style === "split-canvas") ? (
            props.style === "section-deck" ? (
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
