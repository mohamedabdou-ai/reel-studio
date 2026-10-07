import { useLayoutEffect, useMemo, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import { getAudioData, visualizeAudio } from "@remotion/media-utils";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { clamp01, mix, toFrame, useClock } from "./motion";
import { useProbe } from "./safe";



export type Band = { minHz: number; maxHz: number };









export const BAND = {
  sub: { minHz: 20, maxHz: 80 },
  bass: { minHz: 60, maxHz: 250 },
  lowMid: { minHz: 250, maxHz: 700 },
  voice: { minHz: 85, maxHz: 3400 },
  presence: { minHz: 2000, maxHz: 5000 },
  air: { minHz: 6000, maxHz: 16000 },
  full: { minHz: 20, maxHz: 18000 },
} as const;
export type BandName = keyof typeof BAND;
export type BandLike = BandName | Band;

const resolveBand = (b: BandLike | undefined, dflt: Band): Band =>
  b === undefined ? dflt : typeof b === "string" ? BAND[b] : b;






export const bandEdges = (n: number, minHz = 60, maxHz = 14000, spacing: "log" | "linear" = "log"): Band[] => {
  const count = int(n, 1, 1);
  const lo = Number.isFinite(minHz) ? Math.max(1, minHz) : 60;
  const hi = Number.isFinite(maxHz) ? Math.max(lo * 2, maxHz) : lo * 2;
  const ratio = hi / lo;
  const out: Band[] = [];
  for (let i = 0; i < count; i++) {
    const a = i / count;
    const b = (i + 1) / count;
    out.push(
      spacing === "log"
        ? { minHz: lo * Math.pow(ratio, a), maxHz: lo * Math.pow(ratio, b) }
        : { minHz: mix(lo, hi, a), maxHz: mix(lo, hi, b) },
    );
  }
  return out;
};



const DB_FLOOR = -120;


const toDb = (v: number): number => (v > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(v)) : DB_FLOOR);









const ONSET_LAMBDA = 1000;
const compress = (v: number): number => (v > 0 ? Math.log(1 + ONSET_LAMBDA * v) : 0);






const int = (n: number, min: number, dflt: number): number => (Number.isFinite(n) ? Math.max(min, Math.round(n)) : dflt);


const num = (v: number | undefined, dflt: number): number => (v !== undefined && Number.isFinite(v) ? v : dflt);


const numOrAuto = (v: number | undefined): number | undefined => (v !== undefined && Number.isFinite(v) ? v : undefined);

const zeros = (n: number): number[] => new Array<number>(int(n, 0, 0)).fill(0);





const potBins = (n: number, dflt: number): number => {
  const c = Math.max(16, Math.min(MAX_BINS, int(n, 16, dflt)));
  return 1 << Math.round(Math.log2(c));
};

const MAX_BINS = 2048;
















const autoBins = (sampleRate: number, fps: number): number => {
  const needed = sampleRate / Math.max(1, fps) / 2;
  let bins = 16;
  while (bins < needed && bins < MAX_BINS) bins *= 2;
  return bins;
};



const resolveBins = (requested: number | undefined, sampleRate: number, fps: number): number => {
  const floor = autoBins(sampleRate, fps);
  return Math.max(floor, potBins(num(requested, floor), floor));
};








const resolveSrc = (src: string): string => {
  if (/^(?:https?:|data:|blob:|file:|\/)/.test(src)) return src;
  try {
    return staticFile(src);
  } catch {
    return src;
  }
};





















const SPECTRA = new Map<string, number[]>();
const SPECTRA_LIMIT = 4096;





const spectrumAt = (audioData: MediaUtilsAudioData, frame: number, fps: number, bins: number): number[] | null => {
  const wave = audioData.channelWaveforms[0];
  if (!wave || wave.length < bins * 2) return null;
  const key = `${audioData.resultId}|${frame}|${bins}`;
  const hit = SPECTRA.get(key);
  if (hit !== undefined) return hit;
  const spec = visualizeAudio({ audioData, frame, fps, numberOfSamples: bins, optimizeFor: "speed", smoothing: false });
  if (SPECTRA.size >= SPECTRA_LIMIT) SPECTRA.clear();
  SPECTRA.set(key, spec);
  return spec;
};
















const bandRange = (specLen: number, binHz: number, band: Band): [number, number] => {
  const last = Math.max(1, specLen - 1);
  const lo = Math.max(0, Math.min(last, Math.floor(num(band.minHz, 0) / binHz)));
  const hi = Math.max(lo, Math.min(last, Math.ceil(num(band.maxHz, binHz * (last + 1)) / binHz) - 1));
  return [lo, hi];
};







const foldDb = (spec: number[], binHz: number, band: Band): number => {
  const [lo, hi] = bandRange(spec.length, binHz, band);
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += spec[i];
  const mean = sum / (hi - lo + 1);
  return Number.isFinite(mean) ? toDb(mean) : DB_FLOOR;
};




export type EnergyOptions = {

  band?: BandLike;







  bins?: number;

  attackSec?: number;

  releaseSec?: number;

  normSec?: number;

  strideF?: number;




  leadSec?: number;

  minRangeDb?: number;

  floorDb?: number;
  ceilDb?: number;

  gamma?: number;
};

type Follow = {
  bins: number;
  band: Band;
  lenF: number;
  strideF: number;
  leadF: number;
  attackF: number;
  releaseF: number;
  minRangeDb: number;
  floorDb: number | undefined;
  ceilDb: number | undefined;
  gamma: number;
};

const resolveFollow = (
  fps: number,
  sampleRate: number,
  o: EnergyOptions,
  dfltBand: Band,
  dfltAttack: number,
  dfltRelease: number,
): Follow => {
  const strideF = int(num(o.strideF, 1), 1, 1);
  const normF = int(toFrame(num(o.normSec, 1.6), fps), 1, fps);
  return {
    bins: resolveBins(o.bins, sampleRate, fps),
    band: resolveBand(o.band, dfltBand),

    lenF: Math.max(1, Math.ceil(normF / strideF)),
    strideF,
    leadF: int(toFrame(num(o.leadSec, 0), fps), 0, 0),
    attackF: int(toFrame(num(o.attackSec, dfltAttack), fps), 1, 1),
    releaseF: int(toFrame(num(o.releaseSec, dfltRelease), fps), 1, 1),
    minRangeDb: Math.max(1, num(o.minRangeDb, 18)),
    floorDb: numOrAuto(o.floorDb),
    ceilDb: numOrAuto(o.ceilDb),
    gamma: Math.max(0.05, num(o.gamma, 1)),
  };
};



type Window = { spectra: number[][]; live: number };



















const analysisWindow = (audioData: MediaUtilsAudioData, fps: number, endF: number, p: Follow): Window => {
  const startF = Math.max(0, endF - (p.lenF - 1) * p.strideF);
  const spectra: number[][] = [];
  let live = 0;
  for (let k = 0; k < p.lenF; k++) {
    const f = startF + k * p.strideF;
    const s = spectrumAt(audioData, f, fps, p.bins);
    if (!s) continue;
    spectra.push(s);
    if (f <= endF) live += 1;
  }
  return { spectra, live: Math.max(1, Math.min(live, spectra.length)) };
};










const SILENCE_DB = -90;























const normaliseDb = (series: number[], p: Follow, live: number): number[] => {
  const n = series.length;
  const perPoint = p.minRangeDb / Math.max(1, n - 1);
  const now = Math.max(0, live - 1);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const age = Math.abs(i - now) * perPoint;
    if (series[i] - age > hi) hi = series[i] - age;
    if (series[i] + age < lo) lo = series[i] + age;
  }
  const floor = p.floorDb ?? Math.min(lo, Math.max(SILENCE_DB, hi - p.minRangeDb));
  const ceil = p.ceilDb ?? Math.max(hi, floor + p.minRangeDb);
  const span = Math.max(1e-6, ceil - floor);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(clamp01((series[i] - floor) / span));
  return out;
};



const followWindow = (w: Window, dbs: number[], p: Follow): number => followSeries(normaliseDb(dbs, p, w.live).slice(0, w.live), p);










const followSeries = (norm: number[], p: Follow): number => {
  if (!norm.length) return 0;
  const ka = 1 - Math.exp(-p.strideF / p.attackF);
  const kr = 1 - Math.exp(-p.strideF / p.releaseF);
  let g = norm[0];
  for (let i = 1; i < norm.length; i++) g += (norm[i] - g) * (norm[i] > g ? ka : kr);
  const v = clamp01(g);
  return p.gamma === 1 ? v : Math.pow(v, p.gamma);
};














export const useAudioSource = (src: string): MediaUtilsAudioData | null => {
  const probe = useProbe();
  const url = src ? resolveSrc(src) : "";
  const [data, setData] = useState<MediaUtilsAudioData | null>(null);
  const { delayRender, continueRender } = useDelayRender();

  useLayoutEffect(() => {
    if (probe || !url) return;
    let alive = true;
    const handle = delayRender("audioviz: decoding " + url);



    getAudioData(url).then(
      (d) => {
        if (alive) setData(d);
        continueRender(handle);
      },
      (err) => {



        console.warn("[audioviz] could not decode " + url + " — audio-reactive values stay at 0.", err);
        if (alive) setData(null);
        continueRender(handle);
      },
    );
    return () => {
      alive = false;
    };
  }, [url, probe, delayRender, continueRender]);

  return probe ? null : data;
};











export const useEnergy = (src: string, opts: EnergyOptions = {}): number => {
  const { frame, fps } = useClock();
  const audioData = useAudioSource(src);
  if (!audioData) return 0;
  const p = resolveFollow(fps, audioData.sampleRate, opts, BAND.full, 0.05, 0.22);
  const w = analysisWindow(audioData, fps, frame + p.leadF, p);
  if (!w.spectra.length) return 0;
  const binHz = audioData.sampleRate / (p.bins * 2);
  return followWindow(
    w,
    w.spectra.map((s) => foldDb(s, binHz, p.band)),
    p,
  );
};

export type BandsOptions = Omit<EnergyOptions, "band"> & {

  minHz?: number;
  maxHz?: number;
  spacing?: "log" | "linear";


  perBand?: boolean;
};














export const useBands = (src: string, n: number, opts: BandsOptions = {}): number[] => {
  const { frame, fps } = useClock();
  const audioData = useAudioSource(src);
  const count = int(n, 1, 1);
  if (!audioData) return zeros(count);
  const p = resolveFollow(fps, audioData.sampleRate, opts, BAND.full, 0.05, 0.16);
  const w = analysisWindow(audioData, fps, frame + p.leadF, p);
  if (!w.spectra.length) return zeros(count);
  const binHz = audioData.sampleRate / (p.bins * 2);
  const edges = bandEdges(count, num(opts.minHz, 60), num(opts.maxHz, 14000), opts.spacing ?? "log");
  const perBand = edges.map((b) => w.spectra.map((s) => foldDb(s, binHz, b)));
  if (opts.perBand ?? true) return perBand.map((series) => followWindow(w, series, p));
  let lo = Infinity;
  let hi = -Infinity;
  for (const series of perBand) {
    for (const v of series) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const floorDb = p.floorDb ?? Math.min(lo, Math.max(SILENCE_DB, hi - p.minRangeDb));
  const shared: Follow = { ...p, floorDb, ceilDb: p.ceilDb ?? Math.max(hi, floorDb + p.minRangeDb) };
  return perBand.map((series) => followWindow(w, series, shared));
};

export type DuckingOptions = EnergyOptions & {

  threshold?: number;

  knee?: number;
};













export const useDucking = (src: string, opts: DuckingOptions = {}): number => {
  const { frame, fps } = useClock();
  const audioData = useAudioSource(src);
  if (!audioData) return 0;
  const p = resolveFollow(fps, audioData.sampleRate, opts, BAND.voice, 0.04, 0.4);
  const w = analysisWindow(audioData, fps, frame + p.leadF, p);
  if (!w.spectra.length) return 0;
  const binHz = audioData.sampleRate / (p.bins * 2);
  const threshold = clamp01(num(opts.threshold, 0.34));
  const knee = Math.max(1e-3, num(opts.knee, 0.18));
  const gated = normaliseDb(
    w.spectra.map((s) => foldDb(s, binHz, p.band)),
    p,
    w.live,
  ).map((v) => clamp01((v - threshold) / knee));
  return followSeries(gated.slice(0, w.live), p);
};



export type OnsetOptions = {

  fps: number;

  band?: BandLike;
  bins?: number;

  fromSec?: number;
  toSec?: number;

  minGapSec?: number;

  windowSec?: number;






  factor?: number;
  bias?: number;
};


























export const onsets = (audioData: MediaUtilsAudioData | null, opts: OnsetOptions): number[] => {
  if (!audioData || !Number.isFinite(opts.fps) || opts.fps <= 0) return [];


  const fps = opts.fps;
  const bins = resolveBins(opts.bins, audioData.sampleRate, fps);
  const wave = audioData.channelWaveforms[0];
  if (!wave || wave.length < bins * 2) return [];

  const binHz = audioData.sampleRate / (bins * 2);
  const [lo, hi] = bandRange(bins, binHz, resolveBand(opts.band, BAND.full));
  const width = hi - lo + 1;
  const endF = int(toFrame(audioData.durationInSeconds, fps), 0, 0);
  const fromF = int(toFrame(num(opts.fromSec, 0), fps), 0, 0);
  const toF = Math.min(endF, opts.toSec === undefined ? endF : int(toFrame(opts.toSec, fps), 0, endF));
  if (toF - fromF < 3) return [];
  const minGapF = int(toFrame(num(opts.minGapSec, 0.12), fps), 1, 1);
  const halfWinF = int(toFrame(num(opts.windowSec, 0.9), fps) / 2, 1, 1);



  const factor = num(opts.factor, 1.35);
  const bias = num(opts.bias, 0.05);


  const flux: number[] = [];
  let prev: number[] | null = null;
  for (let f = fromF; f <= toF; f++) {
    const spec = spectrumAt(audioData, f, fps, bins);




    if (!spec) return [];
    const cur = new Array<number>(width);
    for (let i = 0; i < width; i++) {
      const v = spec[lo + i];
      cur[i] = Number.isFinite(v) ? compress(v) : 0;
    }
    if (!prev) {
      flux.push(0);
      prev = cur;
      continue;
    }
    let rise = 0;
    for (let i = 0; i < width; i++) {
      const d = cur[i] - prev[i];
      if (d > 0) rise += d;
    }
    flux.push(rise / width);
    prev = cur;
  }


  flux.push(0);

  const out: number[] = [];
  let last = -minGapF - 1;
  for (let i = 1; i < flux.length - 1; i++) {
    const v = flux[i];

    if (v <= 0 || v < flux[i - 1] || v < flux[i + 1]) continue;
    const a = Math.max(0, i - halfWinF);
    const b = Math.min(flux.length - 1, i + halfWinF);
    const win: number[] = [];
    for (let j = a; j <= b; j++) win.push(flux[j]);
    win.sort((x, y) => x - y);

    if (v < win[Math.floor(win.length / 2)] * factor + bias) continue;
    const f = fromF + i;
    if (f - last < minGapF) continue;
    out.push(f);
    last = f;
  }
  return out;
};






export const useOnsets = (src: string, opts: Omit<OnsetOptions, "fps"> = {}): number[] => {
  const { fps } = useClock();
  const audioData = useAudioSource(src);
  const band = resolveBand(opts.band, BAND.full);
  const { bins, fromSec, toSec, minGapSec, windowSec, factor, bias } = opts;
  return useMemo(
    () => onsets(audioData, { fps, band, bins, fromSec, toSec, minGapSec, windowSec, factor, bias }),

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioData, fps, band.minHz, band.maxHz, bins, fromSec, toSec, minGapSec, windowSec, factor, bias],
  );
};
