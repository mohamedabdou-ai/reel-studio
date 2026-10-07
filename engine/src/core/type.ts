import type { CSSProperties } from "react";
import { fillTextBox, fitText, fitTextOnNLines, measureText, type Dimensions, type TextTransform } from "@remotion/layout-utils";
import { px } from "./motion";
import { ADS_PROFILE, DEFAULT_PROFILE, FRAME, zone, type ProfileId } from "./safe";




export type TypeStyle = {
  fontFamily: string;

  fontSize: number;
  fontWeight?: number | string;


  letterSpacing?: number | string;
  textTransform?: TextTransform;
  fontVariantNumeric?: string;
};










export type MeasuredStyle = CSSProperties & {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  letterSpacing: string;
  lineHeight: string;
  whiteSpace: "pre";
  fontStyle: "normal";
  wordSpacing: "normal";
  fontStretch: "normal";
};













const FORMATTING = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;




const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDCF\uFDF0-\uFDFD\uFE70-\uFEFE]/;


const LTR_LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDCF\uFDF0-\uFDFD\uFE70-\uFEFE]/g;

const countMatches = (text: string, re: RegExp): number => {
  const found = text.match(re);
  return found === null ? 0 : found.length;
};








export const isArabic = (text: string): boolean => ARABIC.test(text.replace(FORMATTING, ""));









export const isRtlDominant = (text: string): boolean => {
  const clean = text.replace(FORMATTING, "");
  return countMatches(clean, ARABIC_LETTER) > countMatches(clean, LTR_LETTER);
};


type MeasureArgs = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  letterSpacing: string;
  textTransform: TextTransform;
  fontVariantNumeric: string;
};



type AdditionalStyles = NonNullable<Parameters<typeof measureText>[0]["additionalStyles"]>;


















const extras = (args: MeasureArgs): AdditionalStyles =>
  ({ fontVariantNumeric: args.fontVariantNumeric, wordSpacing: "normal", fontStretch: "normal" }) as AdditionalStyles;

const cssLength = (v: number | string): string => (typeof v === "number" ? `${v}px` : v);






const measureArgs = (text: string, style: TypeStyle, fontSize: number = style.fontSize): MeasureArgs => ({
  fontFamily: style.fontFamily,

  fontSize: Math.max(1, Math.round(fontSize)),
  fontWeight: style.fontWeight ?? "normal",
  letterSpacing: isArabic(text) ? "0px" : style.letterSpacing === undefined ? "normal" : cssLength(style.letterSpacing),
  textTransform: style.textTransform ?? "none",
  fontVariantNumeric: style.fontVariantNumeric ?? "normal",
});


const toStyle = (args: MeasureArgs, lineBox: number, rtl: boolean): MeasuredStyle => ({
  ...args,
  lineHeight: `${lineBox}px`,


  whiteSpace: "pre",
  fontStyle: "normal",


  wordSpacing: "normal",
  fontStretch: "normal",



  ...(rtl ? { direction: "rtl" as const } : null),
});

const raw = (text: string, args: MeasureArgs): Dimensions => {




  if (typeof document === "undefined") {
    throw new Error(
      `core/type: cannot measure ${JSON.stringify(text.slice(0, 48))} outside a browser. ` +
        `Measurement runs inside the render page only — never in calculateMetadata(), selectComposition() or module scope.`,
    );
  }
  return measureText({
    text,
    fontFamily: args.fontFamily,
    fontSize: args.fontSize,
    fontWeight: args.fontWeight,
    letterSpacing: args.letterSpacing,
    textTransform: args.textTransform,
    additionalStyles: extras(args),
  });
};




export type Measured = Dimensions & {

  lineBox: number;
  style: MeasuredStyle;
  arabic: boolean;
};









export const measure = (text: string, style: TypeStyle): Measured => {
  const args = measureArgs(text, style);
  const d = raw(text, args);
  const lineBox = Math.max(1, Math.ceil(d.height));
  return { width: d.width, height: d.height, lineBox, style: toStyle(args, lineBox, isRtlDominant(text)), arabic: isArabic(text) };
};




export type Fitted = Dimensions & {

  fontSize: number;
  lineBox: number;
  style: MeasuredStyle;
  arabic: boolean;

  fits: boolean;
};

const clampInt = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(n)));


const collapse = (text: string): string => text.replace(/\s+/g, " ").replace(/^ | $/g, "");


const HARD_MAX = FRAME.height;

const widthAt = (text: string, style: TypeStyle, size: number): number => Math.ceil(raw(text, measureArgs(text, style, size)).width);




















export const fitToWidth = (
  text: string,
  style: TypeStyle,
  withinWidth: number,
  opts: { min?: number; max?: number } = {},
): Fitted => {
  const max = clampInt(opts.max ?? style.fontSize, 1, HARD_MAX);
  const min = clampInt(opts.min ?? 1, 1, max);
  const seed = measureArgs(text, style);
  const estimate = fitText({
    text,
    withinWidth,
    fontFamily: seed.fontFamily,
    fontWeight: seed.fontWeight,
    letterSpacing: seed.letterSpacing,
    textTransform: seed.textTransform,
    additionalStyles: extras(seed),
  });


  const guess = clampInt(Math.floor(estimate.fontSize), min, max);
  let lo = min;
  let hi = max;
  if (widthAt(text, style, guess) <= withinWidth) lo = guess;
  else hi = guess;

  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (widthAt(text, style, mid) <= withinWidth) lo = mid;
    else hi = mid - 1;
  }
  const size = clampInt(lo, min, max);

  const args = measureArgs(text, style, size);
  const d = raw(text, args);
  const lineBox = Math.max(1, Math.ceil(d.height));
  const width = Math.ceil(d.width);
  return {
    fontSize: args.fontSize,
    width,
    height: lineBox,
    lineBox,
    style: toStyle(args, lineBox, isRtlDominant(text)),
    arabic: isArabic(text),
    fits: width <= withinWidth,
  };
};


export type FittedLines = Fitted & {










  lines: string[];





  overflow: string[];
};



















export const fitToBox = (
  text: string,
  style: TypeStyle,
  opts: { maxBoxWidth: number; maxLines: number; lineHeight?: number; fontSize?: number },
): FittedLines => {
  const args = measureArgs(text, style, opts.fontSize ?? style.fontSize);
  const box = fillTextBox({ maxBoxWidth: opts.maxBoxWidth, maxLines: Math.max(1, Math.round(opts.maxLines)) });



  const words = collapse(text).split(" ").filter((w) => w.length > 0);
  const lines: string[] = [""];
  const overflow: string[] = [];
  let at = 0;
  let fits = true;
  for (const word of words) {
    if (!fits) {


      overflow.push(word);
      lines[at] += lines[at].length === 0 ? word : ` ${word}`;
      continue;
    }
    const result = box.add({ text: lines[at].length === 0 ? word : ` ${word}`, ...args, additionalStyles: extras(args) });
    if (result.exceedsBox) {
      fits = false;
      overflow.push(word);
      lines[at] += lines[at].length === 0 ? word : ` ${word}`;
      continue;
    }
    if (result.newLine) {
      lines.push("");
      at += 1;
    }
    lines[at] += lines[at].length === 0 ? word : ` ${word}`;
  }

  const natural = Math.ceil(raw(text, args).height);
  const lineBox = Math.max(1, opts.lineHeight === undefined ? natural : px(args.fontSize * opts.lineHeight));
  let width = 0;
  for (const line of lines) width = Math.max(width, Math.ceil(raw(line, args).width));




  if (width > opts.maxBoxWidth) fits = false;
  return {
    fontSize: args.fontSize,
    lines,
    overflow,
    width,
    height: lines.length * lineBox,
    lineBox,
    style: toStyle(args, lineBox, isRtlDominant(text)),
    arabic: isArabic(text),
    fits,
  };
};
















export const fitOnLines = (
  text: string,
  style: TypeStyle,
  opts: { maxBoxWidth: number; maxLines: number; min?: number; max?: number; lineHeight?: number },
): FittedLines => {
  const max = clampInt(opts.max ?? style.fontSize, 1, HARD_MAX);
  const min = clampInt(opts.min ?? 1, 1, max);
  const flat = collapse(text);
  const seed = measureArgs(flat, style);
  const estimate = fitTextOnNLines({
    text: flat,
    maxLines: Math.max(1, Math.round(opts.maxLines)),
    maxBoxWidth: opts.maxBoxWidth,
    fontFamily: seed.fontFamily,
    fontWeight: seed.fontWeight,
    letterSpacing: seed.letterSpacing,
    textTransform: seed.textTransform,
    additionalStyles: { fontVariantNumeric: seed.fontVariantNumeric, wordSpacing: "normal", fontStretch: "normal" },
    maxFontSize: max,
  });
  let size = clampInt(Math.floor(estimate.fontSize), min, max);
  let out = fitToBox(flat, style, { ...opts, fontSize: size });
  while (!out.fits && size > min) {
    size -= 1;
    out = fitToBox(flat, style, { ...opts, fontSize: size });
  }


  while (out.fits && size < max) {
    const up = fitToBox(flat, style, { ...opts, fontSize: size + 1 });
    if (!up.fits) break;
    size += 1;
    out = up;
  }
  return out;
};




export type Padding = number | { x?: number; y?: number; top?: number; right?: number; bottom?: number; left?: number };

export type Sides = { top: number; right: number; bottom: number; left: number };

const resolvePadding = (p: Padding): Sides => {
  if (typeof p === "number") {
    const n = Math.max(0, Math.round(p));
    return { top: n, right: n, bottom: n, left: n };
  }
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const side = (v: number | undefined, dflt: number) => Math.max(0, Math.round(v ?? dflt));
  return { top: side(p.top, y), right: side(p.right, x), bottom: side(p.bottom, y), left: side(p.left, x) };
};

export type Pill = {

  width: number;
  height: number;
  padding: Sides;

  text: Dimensions;



  textLeft: number;
  textTop: number;
  fontSize: number;
  style: MeasuredStyle;
  arabic: boolean;
};


























export const pillBox = (text: string, style: TypeStyle, padding: Padding = 0, opts: { lineHeight?: number } = {}): Pill => {
  const args = measureArgs(text, style);
  const d = raw(text, args);
  const pad = resolvePadding(padding);


  const lineBox = Math.max(1, opts.lineHeight === undefined ? Math.ceil(d.height) : px(args.fontSize * opts.lineHeight));
  const width = Math.ceil(d.width);
  return {
    width: pad.left + width + pad.right,
    height: pad.top + lineBox + pad.bottom,
    padding: pad,
    text: { width, height: lineBox },
    textLeft: pad.left,
    textTop: pad.top,
    fontSize: args.fontSize,
    style: toStyle(args, lineBox, isRtlDominant(text)),
    arabic: isArabic(text),
  };
};




export type SafeChannel = "organic" | "ads" | "api";

export type SafeTarget = SafeChannel | ProfileId;






export const CHANNEL_PROFILE: Record<SafeChannel, ProfileId> = {
  organic: DEFAULT_PROFILE,
  ads: ADS_PROFILE,
  api: DEFAULT_PROFILE,
};

const isChannel = (t: SafeTarget): t is SafeChannel => t === "organic" || t === "ads" || t === "api";


export const resolveProfile = (target: SafeTarget = "organic"): ProfileId => (isChannel(target) ? CHANNEL_PROFILE[target] : target);

export type ZoneHit = "TOP" | "BOTTOM" | "LEFT" | "RIGHT" | "RAIL";
export type Box = { left: number; top: number; width: number; height: number };

export type SafeReport = {
  ok: boolean;
  profile: ProfileId;
  hits: ZoneHit[];



  overflow: { top: number; bottom: number; left: number; right: number; rail: number };
};











export const fitsSafeZone = (box: Box, target: SafeTarget = "organic"): SafeReport => {
  const profile = resolveProfile(target);
  const z = zone(profile);
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const overflow = {
    top: Math.max(0, z.top - box.top),
    bottom: Math.max(0, bottom - z.bottom),
    left: Math.max(0, z.left - box.left),
    right: Math.max(0, right - z.right),
    rail: z.rail !== null && right > z.rail.x && bottom > z.rail.y ? right - z.rail.x : 0,
  };
  const hits: ZoneHit[] = [];
  if (overflow.top > 0) hits.push("TOP");
  if (overflow.bottom > 0) hits.push("BOTTOM");
  if (overflow.left > 0) hits.push("LEFT");
  if (overflow.right > 0) hits.push("RIGHT");
  if (overflow.rail > 0) hits.push("RAIL");
  return { ok: hits.length === 0, profile, hits, overflow };
};

export type SafeBand = { profile: ProfileId; left: number; right: number; width: number };























export const safeWidthFor = (
  top: number,
  height: number,
  target: SafeTarget = "organic",
  opts: { inset?: number; shadow?: number } = {},
): SafeBand => {
  const profile = resolveProfile(target);
  const z = zone(profile);
  const inset = Math.max(0, opts.inset ?? 0);
  const shadow = Math.max(0, opts.shadow ?? 0);
  const railLimit = z.rail !== null && top + height > z.rail.y ? z.rail.x : Number.POSITIVE_INFINITY;
  const left = z.left + inset + shadow;
  const right = Math.min(z.right, railLimit) - inset - shadow;
  return { profile, left, right, width: Math.max(0, right - left) };
};



























export const fitPillToSafeWidth = (
  text: string,
  style: TypeStyle,
  opts: {
    top: number;
    padding?: Padding;
    target?: SafeTarget;
    inset?: number;
    shadow?: number;
    min?: number;
    max?: number;
    lineHeight?: number;
  },
): Pill & { fits: boolean; band: SafeBand } => {
  const pad = resolvePadding(opts.padding ?? 0);
  const target = opts.target ?? "organic";
  const guard = { inset: opts.inset, shadow: opts.shadow };
  const designed = pillBox(text, style, pad, { lineHeight: opts.lineHeight });

  let band = safeWidthFor(opts.top, designed.height, target, guard);
  let pill = designed;
  let fitted = false;


  for (let pass = 0; pass < 4; pass++) {
    const fit = fitToWidth(text, style, band.width - pad.left - pad.right, { min: opts.min, max: opts.max });
    pill = pillBox(text, { ...style, fontSize: fit.fontSize }, pad, { lineHeight: opts.lineHeight });
    fitted = fit.fits;
    const next = safeWidthFor(opts.top, pill.height, target, guard);
    if (next.width === band.width && next.left === band.left) break;
    band = next;
  }

  const inZone = fitsSafeZone({ left: band.left, top: opts.top, width: pill.width, height: pill.height }, target);
  return { ...pill, fits: fitted && pill.width <= band.width && inZone.ok, band };
};




export const FONT_PROBE = { latin: "Hamburgefonstiv", arabic: "نص قياس للخط العربي" } as const;














export const assertFontLoaded = (fontFamily: string, sample: string = FONT_PROBE.latin): void => {
  if (typeof document === "undefined") {
    throw new Error(`core/type: assertFontLoaded(${JSON.stringify(fontFamily)}) needs a browser — measurement only runs inside the render page.`);
  }






  measureText({
    text: sample,
    fontFamily,
    fontSize: 100,
    validateFontIsLoaded: true,
    additionalStyles: { fontKerning: "auto" } as AdditionalStyles,
  });
};









export const isFontLoaded = (fontFamily: string, sample: string = FONT_PROBE.latin): boolean => {
  if (typeof document === "undefined") {
    throw new Error(`core/type: isFontLoaded(${JSON.stringify(fontFamily)}) needs a browser — measurement only runs inside the render page.`);
  }
  try {
    assertFontLoaded(fontFamily, sample);
    return true;
  } catch {
    return false;
  }
};
