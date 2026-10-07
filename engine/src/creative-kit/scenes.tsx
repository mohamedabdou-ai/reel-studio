import React from "react";
import { useVideoConfig } from "remotion";
import { EASE, mix, px, useClock, useRamp } from "../core/motion";
import { FRAME } from "../core/safe";
import {
  commentSchema,
  comparisonSchema,
  creativeGalleryDefaults,
  followSchema,
  introSchema,
  processSchema,
  proofSchema,
  type CommentData,
  type ComparisonData,
  type FollowData,
  type IntroData,
  type ProcessData,
  type ProofData,
} from "./schema";
import {
  CreativeFonts,
  FitText,
  Reveal,
  SceneCanvas,
  SceneCaption,
  SceneCard,
  SceneHeader,
  getSceneGeometry,
  type SceneGeometry,
  type SceneOptions,
  type SceneTheme,
} from "./primitives";
import { useSceneTheme } from "./chapter-theme";
import { finalValueTemplate } from "./value-fit";

type SceneContext = {
  theme: SceneTheme;
  geometry: SceneGeometry;
  motion: NonNullable<SceneOptions["motion"]>;
};
type FamilyProps<T> = SceneOptions & { data?: T };


const Scene: React.FC<
  SceneOptions & {
    caption: string;
    children: (context: SceneContext) => React.ReactNode;
  }
> = ({
  style = "section-deck",
  motion = "stagger",
  layout = "takeover",
  showCaption = true,
  caption,
  children,
}) => {
  const { width, height } = useVideoConfig();
  if (width !== FRAME.width || height !== FRAME.height) {
    throw new Error(
      "creative-kit: use the approved 1080x1920 canvas; multi-format reflow is not implemented.",
    );
  }
  const theme = useSceneTheme(style);
  const geometry = getSceneGeometry(style, layout);
  return (
    <CreativeFonts>
      <SceneCanvas theme={theme} geometry={geometry}>
        {children({ theme, geometry, motion })}
      </SceneCanvas>
      {showCaption ? (
        <SceneCaption
          text={caption}
          theme={theme}
          center={geometry.captionCenter}
        />
      ) : null}
    </CreativeFonts>
  );
};


export const IntroScene: React.FC<FamilyProps<IntroData>> = ({
  data = creativeGalleryDefaults.intro,
  ...options
}) => {
  const copy = React.useMemo(() => introSchema.parse(data), [data]);
  return (
    <Scene {...options} caption={copy.caption}>
      {({ theme, geometry: g, motion }) => (
        <>
          <SceneHeader
            kicker={copy.kicker}
            title={copy.title}
            theme={theme}
            geometry={g}
            motion={motion}
          />
          <SceneCard
            theme={theme}
            motion={motion}
            top={g.bodyTop}
            width={g.width}
            height={g.bodyHeight}
          >
            <div
              style={{
                position: "absolute",
                left: 26,
                top: 28,
                bottom: 28,
                width: 7,
                borderRadius: 4,
                background: theme.accent,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 60,
                right: 30,
                top: g.compact ? 24 : 34,
              }}
            >
              <FitText
                text="THE IDEA"
                theme={theme}
                role="label"
                width={g.width - 94}
                height={32}
                size={22}
                min={18}
                lines={1}
                color={theme.accentInk ?? theme.accent}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: 60,
                top: g.compact ? 67 : 88,
              }}
            >
              <FitText
                text={copy.subtitle}
                theme={theme}
                width={g.width - 96}
                height={g.bodyHeight - (g.compact ? 90 : 125)}
                size={g.compact ? 30 : 48}
                min={22}
                lines={3}
              />
            </div>
          </SceneCard>
        </>
      )}
    </Scene>
  );
};

const ProofValue: React.FC<{
  data: ProofData;
  theme: SceneTheme;
  geometry: SceneGeometry;
}> = ({ data, theme, geometry: g }) => {
  const { fps } = useClock();
  const progress = useRamp(-2 / fps, Math.round(fps * 1.15), EASE.landQuad);
  const shown = mix(0, data.value, progress).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  const numberTop = g.compact ? 49 : 61;
  const numberHeight = g.bodyHeight - numberTop - 62;
  return (
    <>
      <div style={{ position: "absolute", left: 24, top: 18 }}>
        <FitText
          text="SUPPLIED VALUE"
          theme={theme}
          role="label"
          width={g.width - 48}
          height={28}
          size={19}
          min={17}
          lines={1}
          color={theme.dim}
        />
      </div>
      <div style={{ position: "absolute", left: 24, top: numberTop }}>
        <FitText
          text={`${shown}${data.suffix}`}
          theme={theme}
          role="title"
          width={g.width - 48}
          height={numberHeight}
          size={Math.min(180, px(numberHeight / 1.28))}
          min={40}
          lines={1}
          align="center"
          color={theme.accentInk ?? theme.accent}
          fitTo={data.valueFit === "final" ? finalValueTemplate(data.value, data.suffix) : undefined}
        />
      </div>
      <div style={{ position: "absolute", left: 24, bottom: 21 }}>
        <FitText
          text={data.source}
          theme={theme}
          role="label"
          width={g.width - 48}
          height={30}
          size={19}
          min={15}
          lines={1}
          color={theme.dim}
          align="center"
        />
      </div>
    </>
  );
};


export const ProofScene: React.FC<FamilyProps<ProofData>> = ({
  data = creativeGalleryDefaults.proof,
  ...options
}) => {
  const copy = React.useMemo(() => proofSchema.parse(data), [data]);
  return (
    <Scene {...options} caption={copy.caption}>
      {({ theme, geometry: g, motion }) => (
        <>
          <SceneHeader
            kicker="THE PROOF"
            title={copy.label}
            theme={theme}
            geometry={g}
            motion={motion}
          />
          <SceneCard
            theme={theme}
            motion={motion}
            top={g.bodyTop}
            width={g.width}
            height={g.bodyHeight}
          >
            <ProofValue data={copy} theme={theme} geometry={g} />
          </SceneCard>
        </>
      )}
    </Scene>
  );
};


export const ProcessScene: React.FC<FamilyProps<ProcessData>> = ({
  data = creativeGalleryDefaults.process,
  ...options
}) => {
  const copy = React.useMemo(() => processSchema.parse(data), [data]);
  return (
    <Scene {...options} caption={copy.caption}>
      {({ theme, geometry: g, motion }) => {
        const gap = g.compact ? 8 : 14;
        const rowHeight = Math.floor((g.bodyHeight - gap * 2) / 3);
        const titleTop = g.compact ? 5 : Math.round(rowHeight / 2) - 35;
        const detailTop = titleTop + (g.compact ? 30 : 42);
        const collage = theme.grammar?.composition === "collage-stack";
        const cardWidth = g.width - (collage ? 14 : 0);
        return (
          <>
            <SceneHeader
              kicker="HOW IT WORKS"
              title={copy.title}
              theme={theme}
              geometry={g}
              motion={motion}
            />
            {copy.steps.map((step, index) => (
              <SceneCard
                key={index}
                theme={theme}
                motion={motion}
                order={index + 2}
                left={collage && index % 2 === 1 ? 14 : 0}
                top={g.bodyTop + index * (rowHeight + gap)}
                width={cardWidth}
                height={rowHeight}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 20,
                    top: Math.round((rowHeight - 44) / 2),
                    width: 44,
                    height: 44,
                    borderRadius: theme.grammar
                      ? theme.grammar.card === "receipt-sheet"
                        ? 0
                        : 4
                      : 22,
                    background: theme.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FitText
                    text={String(index + 1).padStart(2, "0")}
                    theme={theme}
                    role="label"
                    width={40}
                    height={29}
                    size={20}
                    min={18}
                    lines={1}
                    align="center"
                    color={theme.onAccent ?? "#FFFFFF"}
                  />
                </div>
                <div style={{ position: "absolute", left: 85, top: titleTop }}>
                  <FitText
                    text={step.title}
                    theme={theme}
                    width={cardWidth - 110}
                    height={g.compact ? 28 : 39}
                    size={g.compact ? 22 : 30}
                    min={18}
                    lines={1}
                  />
                </div>
                <div style={{ position: "absolute", left: 85, top: detailTop }}>
                  <FitText
                    text={step.detail}
                    theme={theme}
                    width={cardWidth - 110}
                    height={rowHeight - detailTop - 7}
                    size={g.compact ? 17 : 24}
                    min={16}
                    lines={1}
                    color={theme.dim}
                  />
                </div>
              </SceneCard>
            ))}
          </>
        );
      }}
    </Scene>
  );
};


export const ComparisonScene: React.FC<FamilyProps<ComparisonData>> = ({
  data = creativeGalleryDefaults.comparison,
  ...options
}) => {
  const copy = React.useMemo(() => comparisonSchema.parse(data), [data]);
  return (
    <Scene {...options} caption={copy.caption}>
      {({ theme, geometry: g, motion }) => {
        const composition = theme.grammar?.composition;
        const stacked =
          composition === "claim-receipt" || composition === "collage-stack";
        const board = composition === "two-column-board";
        const editorial = composition === "editorial-spread";
        const gap = stacked ? 16 : 18;
        const width = stacked
          ? g.width - (composition === "collage-stack" ? 14 : 0)
          : Math.floor((g.width - gap) / 2);
        const height = stacked
          ? Math.floor((g.bodyHeight - gap) / 2)
          : g.bodyHeight - (editorial ? 18 : 0);
        const detailTop = stacked ? 65 : 91;
        const cards = [
          {
            title: copy.beforeTitle,
            detail: copy.beforeDetail,
            accent: theme.badInk ?? theme.bad,
          },
          {
            title: copy.afterTitle,
            detail: copy.afterDetail,
            accent: theme.good,
          },
        ];
        return (
          <>
            <SceneHeader
              kicker={
                stacked
                  ? "BEFORE / AFTER"
                  : board
                    ? "THE COMPARISON BOARD"
                    : "SIDE BY SIDE"
              }
              title={copy.title}
              theme={theme}
              geometry={g}
              motion={motion}
            />
            {board ? (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: width + 7,
                  top: g.bodyTop,
                  width: 4,
                  height: g.bodyHeight,
                  background: theme.border,
                }}
              />
            ) : null}
            {cards.map((card, index) => (
              <SceneCard
                key={index}
                theme={theme}
                motion={motion}
                order={index + 2}
                left={
                  stacked
                    ? index * (composition === "collage-stack" ? 14 : 0)
                    : index * (width + gap)
                }
                top={
                  g.bodyTop +
                  (stacked
                    ? index * (height + gap)
                    : editorial
                      ? index * 18
                      : 0)
                }
                width={width}
                height={height}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    top: stacked ? 15 : 23,
                  }}
                >
                  <FitText
                    text={card.title}
                    theme={theme}
                    role="label"
                    width={width - 48}
                    height={34}
                    size={24}
                    min={18}
                    lines={1}
                    color={card.accent}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    top: stacked ? 51 : 69,
                    width: board
                      ? width - 48
                      : stacked
                        ? Math.min(160, width - 48)
                        : 52,
                    height: board ? 3 : 5,
                    borderRadius: theme.grammar ? 0 : 3,
                    background: card.accent,
                  }}
                />
                <div style={{ position: "absolute", left: 24, top: detailTop }}>
                  <FitText
                    text={card.detail}
                    theme={theme}
                    width={width - 48}
                    height={height - detailTop - 24}
                    size={g.compact ? 26 : stacked ? 32 : 40}
                    min={20}
                    lines={stacked ? 2 : 4}
                  />
                </div>
              </SceneCard>
            ))}
          </>
        );
      }}
    </Scene>
  );
};

const CommentInput: React.FC<{
  data: CommentData;
  theme: SceneTheme;
  geometry: SceneGeometry;
}> = ({ data, theme, geometry: g }) => {
  const { fps } = useClock();
  const typed = useRamp(6 / fps, Math.round(fps * 0.7));
  const innerWidth = g.width - 52;
  const inputHeight = g.compact ? 81 : 126;
  return (
    <>
      <div style={{ position: "absolute", left: 26, top: 19 }}>
        <FitText
          text="ADD A COMMENT"
          theme={theme}
          role="label"
          width={innerWidth}
          height={30}
          size={21}
          min={18}
          lines={1}
          color={theme.dim}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 26,
          top: 63,
          width: innerWidth,
          height: inputHeight,
          boxSizing: "border-box",
          border: `2px ${theme.grammar?.card === "receipt-sheet" ? "dashed" : "solid"} ${theme.accentInk ?? theme.accent}`,
          borderRadius: theme.grammar ? 2 : 18,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 22,
            top: g.compact ? 12 : 26,
            width: innerWidth - 44,
            clipPath: `inset(0 0 0 ${px(100 * (1 - typed))}%)`,
          }}
        >
          {                                                                                 }
          <FitText
            text={data.keyword}
            theme={theme}
            width={innerWidth - 44}
            height={inputHeight - 25}
            size={g.compact ? 38 : 54}
            min={26}
            lines={1}
            color={theme.accentInk ?? theme.accent}
            align="right"
          />
        </div>
      </div>
      <div style={{ position: "absolute", left: 26, bottom: 20 }}>
        <FitText
          text={data.promise}
          theme={theme}
          role="label"
          width={innerWidth}
          height={32}
          size={20}
          min={17}
          lines={1}
          color={theme.dim}
        />
      </div>
    </>
  );
};


export const CommentGateScene: React.FC<FamilyProps<CommentData>> = ({
  data = creativeGalleryDefaults.comment,
  ...options
}) => {
  const copy = React.useMemo(() => commentSchema.parse(data), [data]);
  return (
    <Scene {...options} caption={copy.caption}>
      {({ theme, geometry: g, motion }) => (
        <>
          <SceneHeader
            kicker="WANT THE TEMPLATE?"
            title="Leave the keyword below."
            theme={theme}
            geometry={g}
            motion={motion}
          />
          <SceneCard
            theme={theme}
            motion={motion}
            top={g.bodyTop}
            width={g.width}
            height={g.bodyHeight}
          >
            <CommentInput data={copy} theme={theme} geometry={g} />
          </SceneCard>
        </>
      )}
    </Scene>
  );
};


export const FollowScene: React.FC<FamilyProps<FollowData>> = ({
  data = creativeGalleryDefaults.follow,
  ...options
}) => {
  const copy = React.useMemo(() => followSchema.parse(data), [data]);
  return (
    <Scene {...options} caption={copy.caption}>
      {({ theme, geometry: g, motion }) => {
        const handleHeight = g.compact ? 73 : 96;
        return (
          <>
            <SceneHeader
              kicker="FOLLOW FOR MORE"
              title="Keep the ideas coming."
              theme={theme}
              geometry={g}
              motion={motion}
            />
            <SceneCard
              theme={theme}
              motion={motion}
              top={g.bodyTop}
              width={g.width}
              height={g.bodyHeight}
            >
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  top: 22,
                  width: g.width - 48,
                  height: handleHeight,
                  borderRadius: theme.grammar ? 2 : 18,
                  background:
                    theme.grammar?.caption === "boxless"
                      ? theme.background
                      : theme.pill,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FitText
                  text={copy.handle}
                  theme={theme}
                  width={g.width - 86}
                  height={handleHeight - 12}
                  size={g.compact ? 38 : 52}
                  min={25}
                  lines={1}
                  align="center"
                  color={theme.pillText}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  top: handleHeight + 37,
                }}
              >
                <FitText
                  text={copy.message}
                  theme={theme}
                  width={g.width - 48}
                  height={g.compact ? 34 : 78}
                  size={g.compact ? 23 : 34}
                  min={19}
                  lines={g.compact ? 1 : 2}
                  color={theme.dim}
                />
              </div>
              <Reveal
                motion={motion}
                order={3}
                style={{ position: "absolute", left: 24, bottom: 18 }}
              >
                <div
                  style={{
                    width: g.compact ? 150 : 186,
                    height: g.compact ? 43 : 56,
                    borderRadius: theme.grammar ? 3 : 28,
                    background: theme.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FitText
                    text="Follow"
                    theme={theme}
                    width={132}
                    height={38}
                    size={28}
                    min={22}
                    lines={1}
                    align="center"
                    color={theme.onAccent ?? "#FFFFFF"}
                  />
                </div>
              </Reveal>
            </SceneCard>
          </>
        );
      }}
    </Scene>
  );
};
