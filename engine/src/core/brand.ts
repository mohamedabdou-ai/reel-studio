import {
  bestInk,
  contrastRatio,
  describeIssues,
  mergeTheme,
  mixToHex,
  readableShift,
  relativeLuminance,
  themeContrastIssues,
  toHex,
  validateChapter,
  CHAPTER_MIN_CONTRAST,
  type ChapterPalette,
  type ChapterThemeTokens,
} from "./chapters.ts";

export type BrandColors = { primary: string; accent: string; background: string | null; text: string | null };
export type BrandStyle = "split-canvas" | "section-deck";
export const BRAND_STYLES: readonly BrandStyle[] = ["split-canvas", "section-deck"];



export const BRAND_STYLE_BASES: Record<BrandStyle, ChapterThemeTokens> = {
  "split-canvas": { background: "#F3EEE6", card: "#E8DECE", border: "#DED2BE", text: "#1F1E1D", dim: "#6B655B", accent: "#D97757", good: "#2F7D4F", bad: "#C0442E", pill: "rgba(28,27,26,0.84)", pillText: "#FFFFFF" },
  "section-deck": { background: "#0F1B33", card: "rgba(16,16,22,0.72)", border: "rgba(255,255,255,0.16)", text: "#FFFFFF", dim: "rgba(255,255,255,0.55)", accent: "#FF6B35", good: "#4FBF67", bad: "#FF5C5C", pill: "#FFFFFF", pillText: "#141414" },
};

export const BRAND_STYLE_DEFAULTS: Record<BrandStyle, { ground: string; ink: string }> = {
  "split-canvas": { ground: "#F3EEE6", ink: "#1F1E1D" },
  "section-deck": { ground: "#0F1B33", ink: "#FFFFFF" },
};

const WHITE = "#FFFFFF";
const BLACK = "#000000";

const deep = (color: string): string => mixToHex(color, "#0D0D11", 0.72);

const cardFor = (ground: string, ink: string): string =>
  mixToHex(ground, WHITE, relativeLuminance(ground) >= relativeLuminance(ink) ? 0.6 : 0.07);








export function fitChapter(ground: string, ink: string, accent: string): ChapterPalette {
  const g = toHex(ground);
  const pole = bestInk(g, [BLACK, WHITE]);
  const card = mixToHex(g, WHITE, pole === BLACK ? 0.6 : 0.07);
  const i = readableShift(toHex(ink), [g, card], pole);
  const a = readableShift(toHex(accent), [i], bestInk(i, [BLACK, WHITE]));
  return { ground: g, accent: a, ink: i, onAccent: i };
}


export function chapterProblems(style: BrandStyle, palette: ChapterPalette): string[] {
  const verdict = validateChapter(palette);
  if (!verdict.ok) return [describeIssues(verdict.issues)];
  const problems: string[] = [];
  const inkAccent = contrastRatio(palette.ink, palette.accent);
  if (inkAccent < CHAPTER_MIN_CONTRAST) problems.push(`ink/accent ${inkAccent.toFixed(2)}:1`);
  const inkCard = contrastRatio(palette.ink, cardFor(palette.ground, palette.ink));
  if (inkCard < CHAPTER_MIN_CONTRAST) problems.push(`ink/card ${inkCard.toFixed(2)}:1`);
  const issues = themeContrastIssues(mergeTheme(BRAND_STYLE_BASES[style], palette), { inkOnAccent: true });
  if (issues.length) problems.push(describeIssues(issues));
  return problems;
}

export type BrandPlan = { palettes: ChapterPalette[]; notices: string[] };



export function brandPalettes(style: BrandStyle, brand: BrandColors): BrandPlan {
  const ground = brand.background ?? BRAND_STYLE_DEFAULTS[style].ground;
  const ink = brand.text ?? BRAND_STYLE_DEFAULTS[style].ink;
  const specs =
    style === "split-canvas"
      ? [{ ground, accent: brand.primary }, { ground, accent: brand.accent }]
      : [{ ground, accent: brand.primary }, { ground: deep(brand.primary), accent: brand.accent }, { ground: deep(brand.accent), accent: brand.primary }];
  const palettes: ChapterPalette[] = [];
  let adjusted = 0;
  let refused = 0;
  for (const spec of specs) {
    const palette = fitChapter(spec.ground, ink, spec.accent);
    if (chapterProblems(style, palette).length) { refused++; continue; }
    if (palette.ink !== toHex(ink) || palette.accent !== toHex(spec.accent)) adjusted++;
    palettes.push(palette);
  }
  const notices: string[] = [];
  if (!palettes.length) notices.push(`Brand colours cannot be made readable in ${style}; this video uses the style's own colours.`);
  else if (refused) notices.push(`${refused} of ${specs.length} ${style} brand palettes could not be made readable and were skipped; the rest are used${adjusted ? ", some lightened or darkened for readability" : ""}.`);
  else if (adjusted) notices.push(`Some brand colours were lightened or darkened so text stays readable in ${style}.`);
  return { palettes, notices };
}

export type BrandableScene = { chapter?: ChapterPalette };


export function applyBrandToScenes<S extends BrandableScene>(style: string, brand: BrandColors | null, scenes: readonly S[]): { brand: ChapterPalette | undefined; scenes: S[]; notices: string[] } {
  if (!brand) return { brand: undefined, scenes: [...scenes], notices: [] };
  if (!(BRAND_STYLES as readonly string[]).includes(style)) return { brand: undefined, scenes: [...scenes], notices: [`Brand colours apply to split-canvas and section-deck; ${style} keeps its own colours.`] };
  const plan = brandPalettes(style as BrandStyle, brand);
  if (!plan.palettes.length) return { brand: undefined, scenes: [...scenes], notices: plan.notices };
  const n = plan.palettes.length;
  return { brand: plan.palettes[0], scenes: scenes.map((scene, index) => (scene.chapter ? scene : { ...scene, chapter: plan.palettes[index % n] })), notices: plan.notices };
}
