import React from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, useClock } from "./motion";
import { jitter } from "./organic";
import { useProbe } from "./safe";










export const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;








const COLOR_SPACE = "sRGB" as const;












export const TURBULENCE_SIGMA = 0.1058;






























export const FINISH_COST_MS = {

  baseline: 91.4,

  wrapperOnly: 0.3,


  grade: 0,

  halation: 19.5,

  bloom: 58.8,

  grain: 71.7,

  grainUnshaped: 71,

  vignette: 7.1,

  gradeHalationBloom: 163.2,

  all: 500.9,

  allGrainUnshaped: 386.3,
} as const;






export const FINISH_COMPOUNDING = 3.2;













export type GradeSpec = {

  readonly saturation: number;

  readonly contrast: number;

  readonly pivot: number;

  readonly lift: readonly [number, number, number];

  readonly gamma: readonly [number, number, number];

  readonly gain: readonly [number, number, number];
};

const NEUTRAL_LGG = {
  lift: [0, 0, 0] as const,
  gamma: [1, 1, 1] as const,
  gain: [1, 1, 1] as const,
};











export const GRADE = {


  none: { saturation: 1, contrast: 1, pivot: 0.5, ...NEUTRAL_LGG } as GradeSpec,






  neutral: { saturation: 1.04, contrast: 1.06, pivot: 0.435, ...NEUTRAL_LGG } as GradeSpec,





  warm: {
    saturation: 1.1,
    contrast: 1.1,
    pivot: 0.45,
    lift: [0.012, 0.004, -0.006],
    gamma: [0.98, 1.0, 1.03],
    gain: [1.03, 1.0, 0.96],
  } as GradeSpec,





  cool: {
    saturation: 0.96,
    contrast: 1.12,
    pivot: 0.46,
    lift: [-0.004, 0, 0.012],
    gamma: [1.03, 1.0, 0.97],
    gain: [0.97, 1.0, 1.04],
  } as GradeSpec,




  punch: { saturation: 1.18, contrast: 1.2, pivot: 0.47, ...NEUTRAL_LGG } as GradeSpec,




  flat: { saturation: 0.88, contrast: 0.88, pivot: 0.5, ...NEUTRAL_LGG } as GradeSpec,
} as const;
export type GradeName = keyof typeof GRADE;
export type GradeLike = GradeName | GradeSpec;

const resolveGrade = (g: GradeLike): GradeSpec => (typeof g === "string" ? GRADE[g] : g);

const isIdentityGrade = (g: GradeSpec): boolean =>
  g.saturation === 1 &&
  g.contrast === 1 &&
  g.lift.every((v) => v === 0) &&
  g.gamma.every((v) => v === 1) &&
  g.gain.every((v) => v === 1);


















export type HalationSpec = {

  readonly threshold: number;

  readonly radius: number;

  readonly strength: number;

  readonly tint: readonly [number, number, number];
};


export const HALATION: HalationSpec = {
  threshold: 0.72,
  radius: 14,
  strength: 0.5,
  tint: [1.0, 0.32, 0.12],
};











export type BloomSpec = {

  readonly threshold: number;

  readonly radius: number;

  readonly strength: number;

  readonly tint: readonly [number, number, number];
};

export const BLOOM: BloomSpec = {
  threshold: 0.8,
  radius: 42,
  strength: 0.22,
  tint: [1, 1, 1],
};









































export type GrainSpec = {






  readonly sigma: number;

  readonly baseFrequency: number;

  readonly octaves: number;




















  readonly response: readonly number[] | null;
};

export const GRAIN: GrainSpec = {
  sigma: 0.022,
  baseFrequency: 0.55,
  octaves: 1,
  response: [0, 0.7, 0.95, 1, 1],
};








export const GRAIN_SEED_MAX = 30011;
export const grainSeedAt = (seed: string | number, frame: number): number =>
  1 + Math.floor(clamp01((jitter(seed, frame, 1) + 1) / 2) * (GRAIN_SEED_MAX - 1));


























export type VignetteSpec = {
  readonly mode: "exposure" | "scrim";

  readonly strength: number;

  readonly inner: number;


  readonly falloff: number;

  readonly cx: number;
  readonly cy: number;
};

export const VIGNETTE: VignetteSpec = {
  mode: "exposure",
  strength: 0.3,
  inner: 42,
  falloff: 2.2,
  cx: 50,
  cy: 42,
};



export type FinishConfig = {

  readonly grade?: GradeLike | false;

  readonly halation?: boolean | Partial<HalationSpec>;
  readonly bloom?: boolean | Partial<BloomSpec>;
  readonly grain?: boolean | Partial<GrainSpec>;
  readonly vignette?: boolean | Partial<VignetteSpec>;
};






export const FINISH_PRESET = {

  off: {} as FinishConfig,


  clean: { grade: "neutral" } as FinishConfig,



  film: { grade: "warm", halation: true, bloom: true, grain: true, vignette: true } as FinishConfig,



  screen: { grade: "cool", bloom: { threshold: 0.74, strength: 0.18 }, vignette: { strength: 0.18 } } as FinishConfig,
} as const;
export type FinishPresetName = keyof typeof FINISH_PRESET;



type Rgb = readonly [number, number, number];

const num = (n: number): string => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : "0");


const lumaGreyMatrix = (): string =>
  [
    `${LUMA.r} ${LUMA.g} ${LUMA.b} 0 0`,
    `${LUMA.r} ${LUMA.g} ${LUMA.b} 0 0`,
    `${LUMA.r} ${LUMA.g} ${LUMA.b} 0 0`,
    `0 0 0 0 1`,
  ].join(" ");



const lumaAlphaMatrix = (): string => [`0 0 0 0 0`, `0 0 0 0 0`, `0 0 0 0 0`, `${LUMA.r} ${LUMA.g} ${LUMA.b} 0 0`].join(" ");



















const tonalTransfer = (g: GradeSpec): { amplitude: number; exponent: number; offset: number }[] | null => {
  if (g.contrast === 1 && g.lift.every((v) => v === 0) && g.gamma.every((v) => v === 1) && g.gain.every((v) => v === 1)) return null;
  return [0, 1, 2].map((i) => ({
    amplitude: g.contrast * g.gain[i],
    exponent: g.gamma[i],
    offset: g.contrast * g.lift[i] + (1 - g.contrast) * g.pivot,
  }));
};







const thresholdTransfer = (threshold: number, strength: number, tint: Rgb) => {
  const t = Math.min(0.999, Math.max(0, threshold));
  const k = strength / (1 - t);
  return tint.map((c) => ({ slope: c * k, intercept: -c * k * t }));
};












const midResponse = (response: readonly number[] | null | undefined): number => {
  if (!response || response.length < 2) return 1;
  const p = (response.length - 1) / 2;
  const i = Math.floor(p);
  return response[i] + (response[Math.min(response.length - 1, i + 1)] - response[i]) * (p - i);
};
const grainMatrix = (sigma: number, response: readonly number[] | null | undefined): string => {
  const a = sigma / (Math.max(1e-3, midResponse(response)) * TURBULENCE_SIGMA);
  const off = 0.5 - 0.5 * a;
  const row = `${num(a)} 0 0 0 ${num(off)}`;
  return [row, row, row, `0 0 0 0 1`].join(" ");
};


const vignetteStops = (v: VignetteSpec): string => {
  const STEPS = 5;
  const parts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    const pos = v.inner + (100 - v.inner) * p;
    const k = v.strength * Math.pow(p, v.falloff);
    const c =
      v.mode === "exposure" ? `rgb(${Math.round(255 * (1 - k))},${Math.round(255 * (1 - k))},${Math.round(255 * (1 - k))})` : `rgba(0,0,0,${num(k)})`;
    parts.push(`${c} ${num(pos)}%`);
  }
  return parts.join(", ");
};

const withDefaults = <T,>(on: boolean | Partial<T> | undefined, base: T): T | null => {
  if (!on) return null;
  return on === true ? base : { ...base, ...on };
};



export type FinishProps = FinishConfig & {
  children?: React.ReactNode;




  readonly seed?: string | number;


  readonly enabled?: boolean;
  readonly style?: React.CSSProperties;
};






















export const Finish: React.FC<FinishProps> = ({
  children,
  grade,
  halation,
  bloom,
  grain,
  vignette,
  seed = "finish",
  enabled = true,
  style,
}) => {

  const probe = useProbe();
  const { frame } = useClock();
  const rawId = React.useId();
  const id = `finish-${rawId.replace(/[^a-zA-Z0-9_-]/g, "") || "x"}`;

  const g = grade ? resolveGrade(grade) : null;
  const hal = withDefaults<HalationSpec>(halation, HALATION);
  const blm = withDefaults<BloomSpec>(bloom, BLOOM);
  const grn = withDefaults<GrainSpec>(grain, GRAIN);
  const vig = withDefaults<VignetteSpec>(vignette, VIGNETTE);

  const wantsFilter = !!((g && !isIdentityGrade(g)) || hal || blm || grn);
  const live = enabled && !probe;

  const prims: React.ReactElement[] = [];
  if (live && wantsFilter) {
    let src = "SourceGraphic";
    let n = 0;
    const next = (): string => `s${n++}`;


    if (g) {
      const t = tonalTransfer(g);
      if (t) {
        const r = next();
        prims.push(
          <feComponentTransfer key={r} in={src} result={r}>
            <feFuncR type="gamma" amplitude={num(t[0].amplitude)} exponent={num(t[0].exponent)} offset={num(t[0].offset)} />
            <feFuncG type="gamma" amplitude={num(t[1].amplitude)} exponent={num(t[1].exponent)} offset={num(t[1].offset)} />
            <feFuncB type="gamma" amplitude={num(t[2].amplitude)} exponent={num(t[2].exponent)} offset={num(t[2].offset)} />
          </feComponentTransfer>,
        );
        src = r;
      }
      if (g.saturation !== 1) {
        const r = next();
        prims.push(<feColorMatrix key={r} in={src} type="saturate" values={num(g.saturation)} result={r} />);
        src = r;
      }
    }


    if (hal || blm) {
      const lum = next();
      prims.push(<feColorMatrix key={lum} in={src} type="matrix" values={lumaGreyMatrix()} result={lum} />);

      const glow = (spec: HalationSpec | BloomSpec, tag: string) => {
        const [fr, fg, fb] = thresholdTransfer(spec.threshold, spec.strength, spec.tint);
        const cut = next();
        prims.push(
          <feComponentTransfer key={`${tag}-${cut}`} in={lum} result={cut}>
            <feFuncR type="linear" slope={num(fr.slope)} intercept={num(fr.intercept)} />
            <feFuncG type="linear" slope={num(fg.slope)} intercept={num(fg.intercept)} />
            <feFuncB type="linear" slope={num(fb.slope)} intercept={num(fb.intercept)} />
          </feComponentTransfer>,
        );
        const blur = next();



        prims.push(<feGaussianBlur key={`${tag}-${blur}`} in={cut} stdDeviation={num(spec.radius)} edgeMode="duplicate" result={blur} />);
        const mix = next();
        prims.push(<feBlend key={`${tag}-${mix}`} in={blur} in2={src} mode="screen" result={mix} />);
        src = mix;
      };

      if (hal) glow(hal, "hal");
      if (blm) glow(blm, "blm");
    }


    if (grn) {
      const nz = next();
      prims.push(
        <feTurbulence
          key={nz}
          type="fractalNoise"
          baseFrequency={num(grn.baseFrequency)}
          numOctaves={Math.max(1, Math.round(grn.octaves))}
          seed={grainSeedAt(seed, frame)}
          stitchTiles="noStitch"
          result={nz}
        />,
      );
      const mono = next();
      prims.push(<feColorMatrix key={mono} in={nz} type="matrix" values={grainMatrix(grn.sigma, grn.response)} result={mono} />);
      let layer = mono;
      if (grn.response && grn.response.length >= 2) {
        const lumA = next();
        prims.push(<feColorMatrix key={lumA} in={src} type="matrix" values={lumaAlphaMatrix()} result={lumA} />);
        const curve = next();
        prims.push(
          <feComponentTransfer key={curve} in={lumA} result={curve}>
            <feFuncA type="table" tableValues={grn.response.map(num).join(" ")} />
          </feComponentTransfer>,
        );
        const masked = next();
        prims.push(<feComposite key={masked} in={mono} in2={curve} operator="in" result={masked} />);
        layer = masked;
      }
      const out = next();
      prims.push(<feBlend key={out} in={layer} in2={src} mode="overlay" result={out} />);
      src = out;
    }
  }

  const filterActive = live && prims.length > 0;





  return (
    <AbsoluteFill style={{ isolation: "isolate", ...style }}>
      <AbsoluteFill style={filterActive ? { filter: `url(#${id})` } : undefined}>{children}</AbsoluteFill>
      {live && vig ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            mixBlendMode: vig.mode === "exposure" ? "multiply" : "normal",
            background: `radial-gradient(ellipse at ${num(vig.cx)}% ${num(vig.cy)}%, ${
              vig.mode === "exposure" ? "#fff" : "rgba(0,0,0,0)"
            } ${num(vig.inner)}%, ${vignetteStops(vig)})`,
          }}
        />
      ) : null}
      {filterActive ? (
        <svg
          aria-hidden
          width={0}
          height={0}
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
        >
          <defs>
            <filter
              id={id}








              filterUnits="objectBoundingBox"
              primitiveUnits="userSpaceOnUse"
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              colorInterpolationFilters={COLOR_SPACE}
            >
              {prims}
            </filter>
          </defs>
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};





export const finishStages = (c: FinishConfig): ("grade" | "halation" | "bloom" | "grain" | "vignette")[] => {
  const out: ("grade" | "halation" | "bloom" | "grain" | "vignette")[] = [];
  if (c.grade && !isIdentityGrade(resolveGrade(c.grade))) out.push("grade");
  if (c.halation) out.push("halation");
  if (c.bloom) out.push("bloom");
  if (c.grain) out.push("grain");
  if (c.vignette) out.push("vignette");
  return out;
};











export const finishCostMs = (c: FinishConfig): number => {
  const stages = finishStages(c);
  if (stages.length === 0) return FINISH_COST_MS.wrapperOnly;
  const solo = stages.reduce((a, s) => a + FINISH_COST_MS[s], 0);
  if (stages.length === 1) return solo;
  if (stages.length === 5) return FINISH_COST_MS.all;
  return Math.round(solo * FINISH_COMPOUNDING * 10) / 10;
};
