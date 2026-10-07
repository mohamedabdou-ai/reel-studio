import './project-tmp.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, assertProjectOutput } from './project-paths.mjs';
import { STYLE_IDS } from '../../engine/src/creative-kit/styles.ts';

const require = createRequire(import.meta.url);
const specification = require('../../engine/src/core/platform/instagram-reels.json');
const profiles = {
  'section-deck': { slug: 'section-deck-split-explainer', lraMax: 2, source: 'instructions/STYLES.md#section-deck', section: 'Review the style audio range and preserve the recorded ending.' },
  'split-canvas': { slug: 'split-canvas-pill-explainer', lraMax: 3, source: 'instructions/STYLES.md#split-canvas', section: 'Review the style audio range and preserve the recorded ending.' },
};
export const MIX_LRA_STABILITY_SECONDS = 60;
export const MIX_LRA_BASIS = 'https://tech.ebu.ch/docs/tech/tech3341.pdf#page=6';

export function mixOutputPath(value) {
  const file = assertProjectOutput(path.resolve(ROOT, value));
  if (['.agents', '.codex'].includes(path.relative(ROOT, file).split(path.sep)[0].toLowerCase())) throw new Error('Mix output cannot write project metadata.');
  return file;
}

export function normalizeMixOptions(args) {
  const allowed = new Set(['_', 'video', 'sfx', 'out', 'under', 'lufs', 'tp', 'ceilPad', 'tighten', 'style', 'report', 'voice', 'help']);
  for (const key of Object.keys(args)) if (!allowed.has(key)) throw new Error(`Unknown mix option --${key}.`);
  const input = (name, required = true) => {
    if (!required && args[name] === undefined) return null;
    if (typeof args[name] !== 'string' || !args[name].trim()) throw new Error(`--${name} must name a file.`);
    const file = path.resolve(ROOT, args[name]);
    const relative = path.relative(ROOT, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('All mix inputs must be project-local.');
    return file;
  };
  const video = input('video'), sfx = input('sfx', false);
  if (typeof args.out !== 'string' || !args.out.trim()) throw new Error('--out must name a project-local MP4.');
  const out = mixOutputPath(args.out);
  if (path.extname(out).toLowerCase() !== '.mp4') throw new Error('Mix output must use an .mp4 extension.');
  if ([video, sfx].some(file => file && file.toLowerCase() === out.toLowerCase())) throw new Error('Mix output cannot overwrite an input source.');
  const reportFile = args.report === undefined ? null : typeof args.report === 'string' ? mixOutputPath(args.report) : (() => { throw new Error('--report must name a project-local JSON file.'); })();
  if (reportFile && [video, sfx, out].some(file => file && file.toLowerCase() === reportFile.toLowerCase())) throw new Error('Mix report cannot overwrite media.');
  const numeric = (key, fallback, min, max) => {
    const value = args[key] === undefined ? fallback : Number(args[key]);
    if (args[key] === true || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid --${key}: expected ${min} to ${max}.`);
    return value;
  };
  const lufs = numeric('lufs', specification.video.loudness.integratedLUFS, -36, -5);
  const tp = numeric('tp', specification.video.loudness.truePeakDBTP, -9, 0);
  const under = numeric('under', 5, 0, 40), ceilPad = numeric('ceilPad', 0.8, 0, 6);
  let style = null;
  if (args.style !== undefined) {
    style = STYLE_IDS.includes(args.style) ? args.style : Object.keys(profiles).find(key => args.style === profiles[key].slug);
    if (!style) throw new Error(`--style accepts ${STYLE_IDS.join(', ')} (or the two legacy Style DNA slugs).`);
  }
  if (args.tighten !== undefined && ![true, false, '1', '0', 'on', 'off'].includes(args.tighten)) throw new Error('--tighten accepts 1/on or 0/off.');
  const voice = parseVoiceMode(args.voice);


  const styleProfile = profiles[style] ?? null;
  return { video, sfx, out, reportFile, lufs, tp, under, ceilPad, tighten: args.tighten === true || args.tighten === '1' || args.tighten === 'on', style, styleProfile, lraBand: styleProfile ? [null, styleProfile.lraMax] : null, voice };
}

export function assessMixDelivery(delivered, durationSec, options) {
  const errors = [], warnings = [];
  for (const field of ['LUFS', 'LRA', 'truePeakDb']) if (!Number.isFinite(delivered?.[field])) errors.push({ code: 'measurement_unavailable', field, message: `Delivered ${field} must be a finite measurement.` });
  if (!Number.isFinite(durationSec) || durationSec <= 0) errors.push({ code: 'measurement_unavailable', field: 'durationSec', message: 'Delivered audio duration must be finite and positive.' });

  if (Number.isFinite(delivered?.LUFS) && Math.abs(delivered.LUFS - options.lufs) > 1) errors.push({ code: 'loudness_out_of_target', actual: delivered.LUFS, target: options.lufs, toleranceLU: 1, message: `Loudness ${delivered.LUFS} LUFS is outside ${options.lufs} +/- 1 LU.` });
  if (Number.isFinite(delivered?.truePeakDb) && delivered.truePeakDb > options.tp + 0.3) errors.push({ code: 'true_peak_over_target', actual: delivered.truePeakDb, target: options.tp, toleranceDb: 0.3, message: `True peak ${delivered.truePeakDb} dBTP is above ${options.tp} + 0.3 dB.` });
  const stable = Number.isFinite(durationSec) && durationSec >= MIX_LRA_STABILITY_SECONDS;
  const outsideBand = options.lraBand && Number.isFinite(delivered?.LRA) ? delivered.LRA > options.lraBand[1] : null;
  if (!stable) warnings.push({ code: 'lra_unstable_short_sample', actual: delivered?.LRA ?? null, durationSec, message: 'LRA is not stable during the first 60 seconds; this short-sample value is advisory.', source: MIX_LRA_BASIS });
  if (outsideBand) warnings.push({ code: 'style_lra_outside_band', actual: delivered.LRA, upperBound: options.lraBand[1], style: options.style, stable, message: `Measured LRA ${delivered.LRA} is above the ${options.style} reference upper bound ${options.lraBand[1]}; review style dynamics while preserving the creator signature.`, source: options.styleProfile.source });
  return { ok: errors.length === 0, status: errors.length ? 'failed' : warnings.length ? 'passed_with_advisories' : 'passed', errors, warnings, styleReviewRequired: Boolean(outsideBand), lra: { measured: delivered?.LRA ?? null, stable, stabilityMinimumSec: MIX_LRA_STABILITY_SECONDS, band: options.lraBand, outsideBand, enforcement: 'style_review_advisory', source: options.styleProfile?.source ?? null, stabilitySource: MIX_LRA_BASIS } };
}

export function parseMixLoudness(stderr) {
  const position = stderr.lastIndexOf('Summary:');
  if (position < 0) throw new Error('Delivered loudness measurement summary is missing.');
  const summary = stderr.slice(position);
  const finite = (regex, field) => {
    const match = regex.exec(summary), value = match ? Number(match[1]) : Number.NaN;
    if (!Number.isFinite(value)) throw new Error(`Delivered ${field} measurement must be finite.`);
    return value;
  };
  return { LUFS: finite(/I:\s+([^\s]+) LUFS/, 'LUFS'), LRA: finite(/LRA:\s+([^\s]+) LU/, 'LRA'), truePeakDb: finite(/Peak:\s+([^\s]+) dBFS/, 'true peak') };
}

export function parseMixStemStats(stderr) {
  const mean = Number(/mean_volume:\s+([^\s]+) dB/.exec(stderr)?.[1]);
  const max = Number(/max_volume:\s+([^\s]+) dB/.exec(stderr)?.[1]);
  const astats = [...stderr.matchAll(/Peak level dB:\s+([^\s]+)/g)].at(-1)?.[1];
  if (!Number.isFinite(mean) || !Number.isFinite(max) || astats === undefined || (astats !== '-inf' && !Number.isFinite(Number(astats)))) throw new Error('Stem volume/peak measurement is incomplete or nonfinite.');
  return { mean, max, silent: astats === '-inf', peakDb: astats === '-inf' ? null : Number(astats) };
}

export function chooseMixSfxGain(voice, effects, under) {
  if (!voice || voice.silent || !Number.isFinite(voice.max) || !Number.isFinite(voice.mean)) throw new Error('Primary voice audio is silent or its level could not be measured.');
  if (!effects) return { status: 'not_provided', gainDb: null, gain: 0 };
  if (effects.silent) return { status: 'silent_bypassed', gainDb: null, gain: 0 };
  if (!Number.isFinite(effects.max) || !Number.isFinite(effects.mean)) throw new Error('Effects audio level could not be measured.');
  const gainDb = +(voice.max - under - effects.max).toFixed(2), gain = 10 ** (gainDb / 20);
  if (!Number.isFinite(gain) || gain <= 0) throw new Error('Effects gain is invalid.');
  return { status: 'mixed', gainDb, gain };
}









export const VOICE_MODES = Object.freeze(['off', 'clean', 'denoise']);

export const VOICE_SILENCE = Object.freeze({ thresholdDb: -35, minDurSec: 0.35 });
export const VOICE_DENOISE_MIN_FLOOR_DB = -55;
export const VOICE_CLEAN_FILTERS = Object.freeze([
  'highpass=f=75:poles=2',
  'deesser=i=0.3:m=0.5:f=0.5:s=o',
  'equalizer=f=300:t=q:w=1:g=-1.5',
  'equalizer=f=3000:t=q:w=1:g=1.5',
  'acompressor=threshold=-20dB:ratio=2:attack=15:release=250:makeup=1:knee=2.8:detection=rms',
]);
const STEREO_48K = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
const STEM_STATS = 'astats=metadata=0:reset=0,volumedetect';

export function parseVoiceMode(value) {
  if (value === undefined) return 'off';
  if (typeof value !== 'string' || !VOICE_MODES.includes(value)) throw new Error(`--voice accepts ${VOICE_MODES.join(', ')}.`);
  return value;
}

export function buildVoiceChain(mode, denoise = null) {
  if (mode === 'off') return '';
  if (mode !== 'clean' && mode !== 'denoise') throw new Error(`Unknown voice mode ${mode}.`);
  const filters = [...VOICE_CLEAN_FILTERS];
  if (mode === 'denoise' && denoise?.apply) {
    if (!Number.isFinite(denoise.noiseFloorDb)) throw new Error('afftdn needs a finite noise floor.');
    filters.splice(1, 0, `afftdn=nr=10:nf=${denoise.noiseFloorDb}:tn=0`);
  }
  return filters.join(',');
}

export function buildVoiceMeasureFilter(voiceChain = '') {
  return voiceChain ? `${STEREO_48K},${voiceChain},${STEM_STATS}` : STEM_STATS;
}

export function buildMixFilterGraph({ sfxMixed, sfxGain = 0, tighten = false, voiceChain = '' }) {
  const voice = voiceChain ? `,${voiceChain}` : '';
  const mixed = sfxMixed
    ? `[0:a:0]${STEREO_48K}${voice},asplit=2[v1][vkey];[1:a:0]${STEREO_48K},volume=${sfxGain}[s0];[s0][vkey]sidechaincompress=threshold=0.05:ratio=6:attack=6:release=200:makeup=1[sduck];[v1][sduck]amix=inputs=2:duration=first:normalize=0[mixed]`
    : `[0:a:0]${STEREO_48K}${voice}[mixed]`;
  const glue = tighten ? ';[mixed]acompressor=threshold=-18dB:ratio=2.6:attack=12:release=180:makeup=2:detection=rms[mix]' : ';[mixed]anull[mix]';
  return mixed + glue;
}


export function parseSilenceSpans(stderr) {
  const pattern = /silence_start: (-?\d+(?:\.\d+)?)[\s\S]*?silence_end: (-?\d+(?:\.\d+)?) \| silence_duration: (\d+(?:\.\d+)?)/g;
  return [...String(stderr).matchAll(pattern)].map(match => ({ start: Math.max(0, +(+match[1]).toFixed(3)), end: +(+match[2]).toFixed(3), dur: +(+match[3]).toFixed(3) }));
}


export function silenceSpansFromAudioCache(cached) {
  const silence = cached?.hasAudio === true ? cached.silence : null;
  if (!silence || !Array.isArray(silence.spans)) return null;
  if (silence.thresholdDb !== VOICE_SILENCE.thresholdDb || silence.minDur !== VOICE_SILENCE.minDurSec) return null;
  return silence.spans
    .filter(span => Number.isFinite(span?.start) && Number.isFinite(span?.end) && span.end > span.start)
    .map(span => ({ start: span.start, end: span.end, dur: +(span.end - span.start).toFixed(3) }));
}


export function selectFloorWindows(spans, { marginSec = 0.1, minWindowSec = 0.15, maxWindows = 16 } = {}) {
  return spans
    .map(span => ({ start: +(span.start + marginSec).toFixed(3), end: +(span.end - marginSec).toFixed(3) }))
    .filter(window => window.end - window.start >= minWindowSec - 1e-9)
    .sort((x, y) => (y.end - y.start) - (x.end - x.start) || x.start - y.start)
    .slice(0, maxWindows)
    .sort((x, y) => x.start - y.start);
}


export function parseRmsLevelDb(stderr) {
  const value = [...String(stderr).matchAll(/RMS level dB:\s+([^\s]+)/g)].at(-1)?.[1];
  if (value === '-inf') return Number.NEGATIVE_INFINITY;
  const level = Number(value);
  if (value === undefined || !Number.isFinite(level)) throw new Error('RMS level measurement is missing or nonfinite.');
  return level;
}


export function estimateNoiseFloorDb(levelsDb) {
  if (!levelsDb.length) return null;
  if (levelsDb.some(level => Number.isNaN(level) || level === Number.POSITIVE_INFINITY)) throw new Error('Noise-floor window levels must be finite dB or -inf.');
  const finite = levelsDb.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return Number.NEGATIVE_INFINITY;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

export function decideDenoise(floorDb, windowsUsed) {
  const base = { thresholdDb: VOICE_DENOISE_MIN_FLOOR_DB, windowsUsed, measuredFloorDb: Number.isFinite(floorDb) ? +floorDb.toFixed(1) : null };
  if (!windowsUsed) return { ...base, apply: false, reason: 'no_silence_spans', noiseFloorDb: null };
  if (floorDb === Number.NEGATIVE_INFINITY) return { ...base, apply: false, reason: 'digital_silence_floor', noiseFloorDb: null };
  if (!Number.isFinite(floorDb)) throw new Error('Noise floor must be a finite dB value or digital silence.');
  if (floorDb <= VOICE_DENOISE_MIN_FLOOR_DB) return { ...base, apply: false, reason: 'floor_below_threshold', noiseFloorDb: null };
  return { ...base, apply: true, reason: 'floor_above_threshold', noiseFloorDb: Math.min(-20, Math.max(-80, +floorDb.toFixed(1))) };
}
