import { clamp01, EASE, mixHex } from "./motion.ts";

export type ChapterPalette = {

  ground: string;

  accent: string;

  ink: string;

  onAccent: string;
};





export type ChapterThemeTokens = {
  background: string;
  card: string;
  border: string;
  text: string;
  dim: string;
  accent: string;
  good: string;
  bad: string;
  pill: string;
  pillText: string;
  accentInk?: string;
  onAccent?: string;
  badInk?: string;
};


export const CHAPTER_MIN_CONTRAST = 4.5;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;


export const parseColor = (color: string): [number, number, number] => {
  if (HEX.test(color)) {
    const h = color.slice(1);
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = RGB.exec(color);
  if (m) {
    const rgb: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (rgb.every((v) => v <= 255)) return rgb;
  }
  throw new Error(`chapters: unsupported colour ${JSON.stringify(color)}; use #RGB, #RRGGBB or rgb(r, g, b).`);
};


export const toHex = (color: string): string =>
  `#${parseColor(color)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};


export const relativeLuminance = (color: string): number => {
  const [r, g, b] = parseColor(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};


export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export type ChapterIssue = { pair: string; ratio: number; min: number };
export type ChapterCheck = { ok: boolean; issues: ChapterIssue[] };

const reads = (fg: string, bg: string, min: number): boolean => contrastRatio(fg, bg) + 1e-9 >= min;

const pairIssue = (pair: string, fg: string, bg: string, min: number): ChapterIssue[] =>
  reads(fg, bg, min) ? [] : [{ pair, ratio: Math.round(contrastRatio(fg, bg) * 100) / 100, min }];


export const describeIssues = (issues: readonly ChapterIssue[]): string =>
  issues.map((i) => (i.pair.endsWith(":format") ? `${i.pair} (use #RGB or #RRGGBB)` : `${i.pair} ${i.ratio}:1 < ${i.min}:1`)).join("; ");

const FIELDS = ["ground", "accent", "ink", "onAccent"] as const;


export const validateChapter = (chapter: ChapterPalette, min = CHAPTER_MIN_CONTRAST): ChapterCheck => {
  const format: ChapterIssue[] = FIELDS.filter((key) => typeof chapter[key] !== "string" || !HEX.test(chapter[key])).map(
    (key) => ({ pair: `${key}:format`, ratio: 0, min }),
  );
  if (format.length) return { ok: false, issues: format };
  const issues = [
    ...pairIssue("ink/ground", chapter.ink, chapter.ground, min),
    ...pairIssue("onAccent/accent", chapter.onAccent, chapter.accent, min),
  ];
  return { ok: issues.length === 0, issues };
};


export const mixToHex = (a: string, b: string, p: number): string => toHex(mixHex(toHex(a), toHex(b), p));

const SHIFT_STEPS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9] as const;






export const readableShift = (
  color: string,
  against: readonly string[],
  toward: string,
  min = CHAPTER_MIN_CONTRAST,
): string => {
  const ok = (c: string) => against.every((bg) => reads(c, bg, min));
  if (ok(color)) return color;
  for (const t of SHIFT_STEPS) {
    const shifted = mixToHex(color, toward, t);
    if (ok(shifted)) return shifted;
  }
  return toward;
};















export const mergeTheme = <T extends ChapterThemeTokens>(base: T, chapter: ChapterPalette): T => {
  const verdict = validateChapter(chapter);
  if (!verdict.ok) throw new Error(`chapters: invalid chapter ${JSON.stringify(chapter)}: ${describeIssues(verdict.issues)}`);
  const { ground, accent, ink, onAccent } = chapter;
  const light = relativeLuminance(ground) >= relativeLuminance(ink);
  const card = mixToHex(ground, "#FFFFFF", light ? 0.6 : 0.07);
  const inversePill = base.pill !== "transparent" && base.pill === base.text;
  return {
    ...base,
    background: ground,
    card,
    border: base.border === base.text ? ink : mixToHex(ink, ground, 0.4),
    text: ink,
    dim: readableShift(mixToHex(ink, ground, 0.3), [ground, card], ink),
    accent,
    onAccent,
    accentInk: readableShift(accent, [ground, card], ink),
    good: readableShift(base.good, [ground, card], ink),
    bad: readableShift(base.bad, [ink], ground),
    badInk: readableShift(base.badInk ?? base.bad, [ground, card], ink),
    pill: base.pill === "transparent" ? "transparent" : inversePill ? ink : card,
    pillText: inversePill ? ground : ink,
  };
};

export type ContrastOptions = {

  inkOnAccent?: boolean;
  min?: number;
};






export const themeContrastIssues = (theme: ChapterThemeTokens, opts: ContrastOptions = {}): ChapterIssue[] => {
  const min = opts.min ?? CHAPTER_MIN_CONTRAST;
  const accentInk = theme.accentInk ?? theme.accent;
  const pairs: [string, string, string][] = [
    ["text/background", theme.text, theme.background],
    ["text/card", theme.text, theme.card],
    ["dim/background", theme.dim, theme.background],
    ["dim/card", theme.dim, theme.card],
    ["accentInk/background", accentInk, theme.background],
    ["accentInk/card", accentInk, theme.card],
    ["onAccent/accent", theme.onAccent ?? "#FFFFFF", theme.accent],
    ["pillText/pill", theme.pillText, theme.pill === "transparent" ? theme.background : theme.pill],
    ["good/card", theme.good, theme.card],
    ["badInk/card", theme.badInk ?? theme.bad, theme.card],
  ];
  if (opts.inkOnAccent) {
    pairs.push(["text/accent", theme.text, theme.accent], ["text/bad", theme.text, theme.bad]);
  }
  return pairs.flatMap(([pair, fg, bg]) => pairIssue(pair, fg, bg, min));
};







export const crossfadeProgress = (frame: number, atFrame: number, durF: number): number => {
  const n = Math.max(1, Math.round(durF));
  return EASE.inOut(clamp01((frame - atFrame + 1) / (n + 1)));
};








export const crossfadePalette = (a: ChapterPalette, b: ChapterPalette, p: number): ChapterPalette => {
  const q = clamp01(p);
  if (q === 0) return a;
  if (q === 1) return b;
  return {
    ground: mixToHex(a.ground, b.ground, q),
    accent: mixToHex(a.accent, b.accent, q),
    ink: mixToHex(a.ink, b.ink, q),
    onAccent: mixToHex(a.onAccent, b.onAccent, q),
  };
};


export const bestInk = (ground: string, candidates: readonly string[]): string => {
  if (!candidates.length) throw new Error("chapters: bestInk needs at least one candidate.");
  let best = candidates[0];
  let bestRatio = contrastRatio(best, ground);
  for (const c of candidates.slice(1)) {
    const r = contrastRatio(c, ground);
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
};
