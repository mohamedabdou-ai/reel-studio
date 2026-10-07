import { z } from "zod";
import { STYLE_IDS } from "./styles.ts";

export const styleSchema = z.enum(STYLE_IDS);



const copy = (max: number) =>
  z.string().min(1).max(max).regex(/\S/, "Text cannot be blank");
const caption = copy(108);

export const sceneFamilies = [
  "intro",
  "proof",
  "process",
  "comparison",
  "comment",
  "follow",
] as const;
export type SceneFamily = (typeof sceneFamilies)[number];

export const introSchema = z.object({
  kicker: copy(38),
  title: copy(64),
  subtitle: copy(86),
  caption,
});

export const proofSchema = z.object({
  label: copy(42),
  value: z.number().finite().int().min(0).max(999999),
  suffix: z.string().max(12),
  source: copy(62),
  caption,
  valueFit: z.enum(["rolling", "final"]).optional(),
});

export const processSchema = z.object({
  title: copy(52),
  steps: z.array(z.object({ title: copy(26), detail: copy(44) })).length(3),
  caption,
});

export const comparisonSchema = z.object({
  title: copy(52),
  beforeTitle: copy(20),
  beforeDetail: copy(72),
  afterTitle: copy(20),
  afterDetail: copy(72),
  caption,
});

export const commentSchema = z.object({
  keyword: copy(20),
  promise: copy(52),
  caption,
});

export const followSchema = z.object({
  handle: z
    .string()
    .regex(
      /^@[A-Za-z0-9_.]{1,30}$/,
      "Use a complete @handle, up to 30 characters",
    ),
  message: copy(72),
  caption,
});

const profile = z.enum([
  "ig-reels-organic",
  "ig-reels-ads",
  "ig-reels-ads-disclaimer",
  "legacy-02",
]);


export const creativeGallerySchema = z.object({
  style: styleSchema,
  motion: z.enum(["land", "stagger", "quiet"]),
  layout: z.enum(["takeover", "split"]),
  preview: z.enum(["all", ...sceneFamilies]),
  framesPerScene: z.number().int().min(90).max(240),
  intro: introSchema,
  proof: proofSchema,
  process: processSchema,
  comparison: comparisonSchema,
  comment: commentSchema,
  follow: followSchema,
  guides: z.union([z.boolean(), profile, z.array(profile)]).optional(),
  probe: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),

  plates: z.array(z.string()).length(0).optional(),
});

export type CreativeGalleryProps = z.infer<typeof creativeGallerySchema>;
export type StyleFamily = CreativeGalleryProps["style"];
export type MotionVariant = CreativeGalleryProps["motion"];
export type SceneLayout = CreativeGalleryProps["layout"];
export type IntroData = z.infer<typeof introSchema>;
export type ProofData = z.infer<typeof proofSchema>;
export type ProcessData = z.infer<typeof processSchema>;
export type ComparisonData = z.infer<typeof comparisonSchema>;
export type CommentData = z.infer<typeof commentSchema>;
export type FollowData = z.infer<typeof followSchema>;

export const creativeGalleryDefaults: CreativeGalleryProps = {
  style: "section-deck",
  motion: "stagger",
  layout: "takeover",
  preview: "all",
  framesPerScene: 120,
  intro: {
    kicker: "A REUSABLE SCENE KIT",
    title: "One idea. Clearly told.",
    subtitle: "مشاهد قابلة للتخصيص حسب المحتوى",
    caption: "كل فكرة ليها طريقة عرض واضحة",
  },
  proof: {
    label: "SCENE FAMILIES",
    value: 6,
    suffix: "",
    source: "KIT INVENTORY · NOT A PERFORMANCE CLAIM",
    caption: "ست طرق مختلفة لعرض فكرتك",
  },
  process: {
    title: "From idea to a clear story.",
    steps: [
      { title: "CHOOSE", detail: "Pick the scene for the idea." },
      { title: "ADAPT", detail: "Add the words and real proof." },
      { title: "REVIEW", detail: "Check the frame before delivery." },
    ],
    caption: "اختار وعدّل وراجع النتيجة",
  },
  comparison: {
    title: "Make the difference visible.",
    beforeTitle: "BEFORE",
    beforeDetail: "Several ideas competing for attention.",
    afterTitle: "AFTER",
    afterDetail: "One claim with one clear visual.",
    caption: "المقارنة توضح الفرق قدامك",
  },
  comment: {
    keyword: "قالب",
    promise: "THE SCENE KIT · ON REQUEST",
    caption: "اكتب قالب في الكومنت",
  },
  follow: {
    handle: "@your.handle",
    message: "More practical ideas. Every week.",
    caption: "تابعني للمزيد من الأفكار العملية",
  },
  guides: false,
  plates: [],
};

type TimelineProps = Pick<CreativeGalleryProps, "preview" | "framesPerScene">;
export type SceneSlot = {
  family: SceneFamily;
  from: number;
  durationInFrames: number;
};


export const getSceneTimeline = ({
  preview,
  framesPerScene,
}: TimelineProps): SceneSlot[] => {
  const families = preview === "all" ? sceneFamilies : [preview];
  return families.map((family, index) => ({
    family,
    from: index * framesPerScene,
    durationInFrames: framesPerScene,
  }));
};

export const getGalleryDuration = (props: TimelineProps): number =>
  getSceneTimeline(props).reduce(
    (total, scene) => total + scene.durationInFrames,
    0,
  );
