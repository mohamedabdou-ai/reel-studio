import { z } from "zod";
import { getBoundingBox, getLength, getSubpaths } from "@remotion/paths";
import { copy } from "../fields.ts";

export const BRAND_NAME_MAX = 24;
export const TAGLINE_MAX = 64;
export const TEXT_MARK_MAX = 6;
export const PATH_MAX = 1200;
export const MAX_SUBPATHS = 32;

export const MIN_ASPECT = 0.1;
export const MAX_ASPECT = 12;

export type ViewBox = { x: number; y: number; width: number; height: number };


export const parseViewBox = (viewBox: string): ViewBox | null => {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [x, y, width, height] = parts;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
};


export const pathProblem = (d: string, viewBox: string): string | null => {
  const vb = parseViewBox(viewBox);
  if (!vb) return "viewBox must be four numbers (min-x min-y width height) with a positive width and height";
  const aspect = vb.width / vb.height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return `viewBox width:height must be between ${MIN_ASPECT} and ${MAX_ASPECT}`;
  try {
    if (!(getLength(d) > 1e-6)) return "the path has no length";
    if (getSubpaths(d).length > MAX_SUBPATHS) return `the path has more than ${MAX_SUBPATHS} sub-paths`;
    const b = getBoundingBox(d);
    const tol = 0.02 * Math.max(vb.width, vb.height);
    if (b.x1 < vb.x - tol || b.y1 < vb.y - tol || b.x2 > vb.x + vb.width + tol || b.y2 > vb.y + vb.height + tol) {
      return "the path leaves its viewBox: widen the viewBox so the whole mark (and half its stroke) fits";
    }
  } catch {
    return "not a valid SVG path";
  }
  return null;
};

const PATH_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;

const pathMark = z
  .strictObject({
    kind: z.literal("path"),

    d: z.string().min(5).max(PATH_MAX).regex(PATH_CHARS, "Path data may only contain SVG path commands and numbers"),

    viewBox: z.string().min(7).max(60),

    filled: z.boolean().optional(),
  })
  .superRefine((mark, ctx) => {
    const problem = pathProblem(mark.d, mark.viewBox);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["d"] });
  });

const textMark = z.strictObject({
  kind: z.literal("text"),

  text: copy(TEXT_MARK_MAX),
});

export const chaosMarkSchema = z.discriminatedUnion("kind", [pathMark, textMark]);

export const chaosToBrandSchema = z.strictObject({
  mark: chaosMarkSchema,

  brandName: copy(BRAND_NAME_MAX),

  tagline: copy(TAGLINE_MAX),
});

export type ChaosMark = z.infer<typeof chaosMarkSchema>;
export type ChaosToBrandData = z.infer<typeof chaosToBrandSchema>;


export const DEMO_MARK_PATH = "M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z M12 28 L50 50 L88 28 M50 50 L50 94";


export const chaosToBrandDemo: ChaosToBrandData = {
  mark: { kind: "path", d: DEMO_MARK_PATH, viewBox: "8 2 84 96" },
  brandName: "SAMPLE Studio",
  tagline: "من الفوضى لنظام واضح بـ AI",
};
