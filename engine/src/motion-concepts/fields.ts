import { z } from "zod";
import { CAPTION_MAX } from "./types.ts";









const FORBIDDEN = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;








const VISIBLE = /[^\s\p{Z}\p{Cf}\p{Cc}]/u;


export const copy = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => VISIBLE.test(s), "Text cannot be blank")
    .refine((s) => !FORBIDDEN.test(s), "Text cannot contain control or bidi-override characters");


export const optionalCopy = (max: number) => copy(max).optional();







export const captionField = copy(CAPTION_MAX);





export const captionIssues = (text: unknown): string[] => {
  if (typeof text !== "string") return [`caption must be a string, got ${typeof text}`];
  const parsed = captionField.safeParse(text);
  if (parsed.success) return [];
  const length = Array.from(text).length;
  return parsed.error.issues.map((i) =>
    i.code === "too_big"
      ? `caption is ${length} characters; the one-line caption pill holds at most ${CAPTION_MAX} (split the clause)`
      : `caption: ${i.message}`,
  );
};






export const assetPath = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9_\-./]+\.(png|jpe?g|webp|svg)$/i, "Use a relative image path such as icons/tool.png")
  .refine((s) => !s.includes("..") && !s.startsWith("/"), "No traversal and no leading slash");


export const listOf = <T extends z.ZodType>(item: T, min: number, max: number) => z.array(item).min(min).max(max);
