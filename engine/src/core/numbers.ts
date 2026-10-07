import { EASE } from "./motion.ts";



export type DigitSet = "latin" | "arabic-indic";

export type NumberFormat = {

  decimals?: number;

  prefix?: string;

  suffix?: string;

  digits?: DigitSet;

  grouping?: boolean;
};


export const ARABIC_INDIC_DIGITS: readonly string[] = [
  "٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩",
];
export const ARABIC_DECIMAL_SEPARATOR = "٫";
export const ARABIC_GROUP_SEPARATOR = "٬";
export const ARABIC_PERCENT = "٪";

export const MAX_ABS_VALUE = 1e15;

const DIGIT_SETS: readonly string[] = ["latin", "arabic-indic"];

const assertFinite = (what: string, value: unknown): void => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`core/numbers ${what}: expected a finite supplied number, got ${String(value)}`);
  }
};

const resolveDecimals = (decimals: number | undefined): number => {
  const d = decimals ?? 0;
  if (!Number.isInteger(d) || d < 0 || d > 6) {
    throw new RangeError(`core/numbers: decimals must be a whole number 0..6, got ${String(d)}`);
  }
  return d;
};

type Parts = { sign: string; prefix: string; body: string; suffix: string };

const toArabicIndic = (latin: string): string =>
  latin.replace(/[0-9.,]/g, (c) =>
    c === "." ? ARABIC_DECIMAL_SEPARATOR : c === "," ? ARABIC_GROUP_SEPARATOR : ARABIC_INDIC_DIGITS[Number(c)],
  );

const formatParts = (value: number, opts: NumberFormat): Parts => {
  assertFinite("formatNumber", value);
  if (Math.abs(value) >= MAX_ABS_VALUE) {
    throw new RangeError(`core/numbers formatNumber: |value| must be below ${MAX_ABS_VALUE}, got ${value}`);
  }
  if (opts.digits !== undefined && !DIGIT_SETS.includes(opts.digits)) {
    throw new RangeError(`core/numbers formatNumber: digits must be "latin" or "arabic-indic", got ${JSON.stringify(opts.digits)}`);
  }
  const decimals = resolveDecimals(opts.decimals);
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split(".");
  const grouped = opts.grouping === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const latin = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return {

    sign: value < 0 && Number(fixed) !== 0 ? "-" : "",
    prefix: opts.prefix ?? "",
    body: opts.digits === "arabic-indic" ? toArabicIndic(latin) : latin,
    suffix: opts.suffix ?? "",
  };
};


export const formatNumber = (value: number, opts: NumberFormat = {}): string => {
  const p = formatParts(value, opts);
  return `${p.sign}${p.prefix}${p.body}${p.suffix}`;
};

const DIGIT = /[0-9٠-٩]/g;







export const widthTemplate = (value: number, opts: NumberFormat = {}, glyph?: string): string => {
  const g = glyph ?? (opts.digits === "arabic-indic" ? ARABIC_INDIC_DIGITS[8] : "8");
  if (Array.from(g).length !== 1) {
    throw new RangeError(`core/numbers widthTemplate: glyph must be exactly one character, got ${JSON.stringify(g)}`);
  }
  const p = formatParts(value, opts);
  return `${p.sign}${p.prefix}${p.body.replace(DIGIT, g)}${p.suffix}`;
};



export type CountUpTiming = {

  from?: number;
  to: number;

  atF: number;

  durF: number;

  ease?: (p: number) => number;
};






export const countUpValue = (frame: number, timing: CountUpTiming): number => {
  const from = timing.from ?? 0;
  assertFinite("countUpValue frame", frame);
  assertFinite("countUpValue from", from);
  assertFinite("countUpValue to", timing.to);
  assertFinite("countUpValue atF", timing.atF);
  assertFinite("countUpValue durF", timing.durF);
  const atF = Math.round(timing.atF);
  const durF = Math.max(1, Math.round(timing.durF));
  if (frame < atF) return from;
  if (frame >= atF + durF) return timing.to;
  const eased = (timing.ease ?? EASE.land)((frame - atF) / durF);
  const value = from + (timing.to - from) * eased;
  const lo = Math.min(from, timing.to);
  const hi = Math.max(from, timing.to);
  return Math.min(hi, Math.max(lo, value));
};



export type DeltaDirection = "up" | "down" | "flat";


export const deltaDirection = (value: number, decimals = 0): DeltaDirection => {
  assertFinite("deltaDirection", value);
  const shown = Number(Math.abs(value).toFixed(resolveDecimals(decimals)));
  if (shown === 0) return "flat";
  return value > 0 ? "up" : "down";
};


export const gaugeFraction = (value: number, max: number): number => {
  assertFinite("gaugeFraction value", value);
  assertFinite("gaugeFraction max", max);
  if (max <= 0) throw new RangeError(`core/numbers gaugeFraction: max must be > 0, got ${max}`);
  if (value < 0 || value > max) {
    throw new RangeError(`core/numbers gaugeFraction: ${value} is outside 0..${max} — a gauge cannot show it truthfully`);
  }
  return value / max;
};


export const defaultGaugeFormat = (max: number, digits: DigitSet = "latin"): NumberFormat => {
  assertFinite("defaultGaugeFormat max", max);
  if (max === 100) return { digits, suffix: digits === "arabic-indic" ? ARABIC_PERCENT : "%" };
  return { digits, suffix: ` / ${formatNumber(max, { digits, decimals: Number.isInteger(max) ? 0 : 2 })}` };
};

export type PriceDropPhases = {

  oldInF: number;

  strikeF: number;

  strikeEndF: number;

  newInF: number;

  labelInF: number;

  settledF: number;
};

export const PRICE_DROP_SETTLE_F = 18;

const wholeFrames = (what: string, value: number, min: number): number => {
  assertFinite(what, value);
  return Math.max(min, Math.round(value));
};


export const priceDropPhases = (
  atF: number,
  opts: { holdF?: number; strikeDurF?: number; labelDelayF?: number } = {},
): PriceDropPhases => {
  assertFinite("priceDropPhases atF", atF);
  const oldInF = Math.round(atF);
  const hold = wholeFrames("priceDropPhases holdF", opts.holdF ?? 14, 0);
  const strike = wholeFrames("priceDropPhases strikeDurF", opts.strikeDurF ?? 10, 1);
  const labelDelay = wholeFrames("priceDropPhases labelDelayF", opts.labelDelayF ?? 8, 0);
  const strikeF = oldInF + hold;
  const strikeEndF = strikeF + strike;
  const newInF = strikeEndF + 2;
  const labelInF = newInF + labelDelay;
  return { oldInF, strikeF, strikeEndF, newInF, labelInF, settledF: labelInF + PRICE_DROP_SETTLE_F };
};


export const assertPriceDrop = (from: number, to: number): void => {
  assertFinite("PriceDrop from", from);
  assertFinite("PriceDrop to", to);
  if (from < 0 || to < 0) throw new RangeError(`core/numbers PriceDrop: prices cannot be negative (from ${from}, to ${to})`);
  if (!(to < from)) {
    throw new RangeError(`core/numbers PriceDrop: a drop needs to < from (from ${from}, to ${to}); show a rise with <Delta>`);
  }
};

export type PlanData = {
  name: string;

  price: number;

  period?: string;

  features: readonly string[];

  highlight?: boolean;

  badge?: string;
};

export const MAX_PLANS = 3;
export const MAX_PLAN_FEATURES = 5;

const blank = (s: unknown): boolean => typeof s !== "string" || s.trim().length === 0;


export const planIssues = (plans: readonly PlanData[]): string[] => {
  const issues: string[] = [];
  if (plans.length < 1 || plans.length > MAX_PLANS) issues.push(`plans: expected 1..${MAX_PLANS}, got ${plans.length}`);
  let highlighted = 0;
  plans.forEach((plan, i) => {
    const at = `plans[${i}]`;
    if (blank(plan.name)) issues.push(`${at}.name is blank`);
    if (typeof plan.price !== "number" || !Number.isFinite(plan.price) || plan.price < 0) {
      issues.push(`${at}.price must be a finite number >= 0, got ${String(plan.price)}`);
    }
    if (plan.period !== undefined && blank(plan.period)) issues.push(`${at}.period is blank`);
    const features: readonly unknown[] = Array.isArray(plan.features) ? plan.features : [];
    if (features.length < 1 || features.length > MAX_PLAN_FEATURES) {
      issues.push(`${at}.features: expected 1..${MAX_PLAN_FEATURES}, got ${features.length}`);
    } else {
      features.forEach((feature, j) => {
        if (blank(feature)) issues.push(`${at}.features[${j}] is blank`);
      });
    }
    if (plan.highlight === true) highlighted += 1;
    if (plan.badge !== undefined && (blank(plan.badge) || plan.highlight !== true)) {
      issues.push(`${at}.badge needs highlight: true and non-blank text`);
    }
  });
  if (highlighted > 1) issues.push(`only one plan may be highlighted, got ${highlighted}`);
  return issues;
};


export const assertPlans = (plans: readonly PlanData[]): void => {
  const issues = planIssues(plans);
  if (issues.length > 0) throw new RangeError(`core/numbers PlanCards: ${issues.join("; ")}`);
};
