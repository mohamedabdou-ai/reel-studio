// Offline emphasis scoring for punch-in proposals (pure: no fs, no process, no clock).
//
// Input is what the pipeline already has: reviewed caption words in SOURCE milliseconds, the
// 16 kHz mono WAV of the same source, and optionally a measured head envelope. Output is
// {version:1, proposals:[...]} for the director's reviewed camera route.
//
// The WAV walk uses a 10 ms hop / 20 ms window RMS envelope. A word's level is the RMS
// of the envelope windows that lie fully inside it, so neighbouring words never bleed in.
//
// Conservative defaults; review the proposal and the rendered presenter before acceptance:
//  - at most one punch per minGapSec (3-5 s, default 4), strongest first;
//  - when a recorded sign-off is supplied, end each punch before its guard;
//  - digits, Latin product names and the CTA keyword get lexical boosts;
//  - without a usable head envelope every proposal is NEEDS-REVIEW with anchor null.
import {anchorForBox, capScale} from '../../engine/src/core/camera.ts';

export const EMPHASIS_DEFAULTS = Object.freeze({
  hopSec: 0.01,
  winSec: 0.02,
  threshold: 0.4,
  minGapSec: 4,
  holdSec: 1.5,
  guardSec: 0.5,
  minLeadFrames: 8,
  minConfidence: 0.5,
  silenceDb: -50,
  sampleToleranceSec: 0.25,
  boosts: Object.freeze({digit: 0.45, latin: 0.35, cta: 0.6}),
});

const KIND_BASE = Object.freeze({'punch-step': 1.05, 'snap-in': 1.04, 'slow-push': 1.03});
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
const DIGIT = /[0-9٠-٩۰-۹]/;
const LATIN = /[A-Za-z]{2,}/;

/** Parse a 16-bit PCM mono RIFF/WAVE buffer into float samples in -1..1. */
export function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file.');
  }
  let pos = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = {format: buf.readUInt16LE(pos + 8), channels: buf.readUInt16LE(pos + 10), sampleRate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22)};
    if (id === 'data') { dataOff = pos + 8; dataLen = size; break; }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || dataOff < 0) throw new Error('WAV has no fmt/data chunk.');
  if ((fmt.format !== 1 && fmt.format !== 0xfffe) || fmt.bits !== 16 || fmt.channels !== 1) {
    throw new Error(`Expected 16-bit PCM mono WAV, got format ${fmt.format}, ${fmt.bits}-bit, ${fmt.channels} channel(s). ` +
      'Extract it with: Tools/bin/ffmpeg.exe -v error -i <source> -vn -ac 1 -ar 16000 -c:a pcm_s16le <out.wav>');
  }
  const n = Math.min(dataLen, buf.length - dataOff) >> 1;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(dataOff + i * 2) / 32768;
  return {sampleRate: fmt.sampleRate, samples};
}

/** RMS envelope: one value per hop, each measured over a `win`-sample window (cut-points.mjs:38-45). */
export function rmsEnvelope(samples, sampleRate, {hopSec = EMPHASIS_DEFAULTS.hopSec, winSec = EMPHASIS_DEFAULTS.winSec} = {}) {
  const hop = Math.round(hopSec * sampleRate), win = Math.round(winSec * sampleRate);
  if (!(hop >= 1 && win >= 1)) throw new RangeError('Envelope hop and window must be at least one sample.');
  const count = samples.length >= win ? Math.floor((samples.length - win) / hop) + 1 : 0;
  const values = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    let sum = 0;
    for (let i = k * hop; i < k * hop + win; i++) sum += samples[i] * samples[i];
    values[k] = Math.sqrt(sum / win);
  }
  return {sampleRate, hop, win, values};
}

/** dBFS of the envelope windows fully inside [startMs, endMs); the nearest window for very short words. */
export function wordLevelDb(env, startMs, endMs) {
  const {sampleRate, hop, win, values} = env;
  if (!values.length) return -120;
  const s0 = Math.round(startMs * sampleRate / 1000), s1 = Math.round(endMs * sampleRate / 1000);
  let i0 = Math.max(0, Math.ceil(s0 / hop)), i1 = Math.min(values.length - 1, Math.floor((s1 - win) / hop));
  if (i1 < i0) {
    const centre = Math.min(values.length - 1, Math.max(0, Math.round(((s0 + s1) / 2 - win / 2) / hop)));
    i0 = centre; i1 = centre;
  }
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += values[i] * values[i];
  const rms = Math.sqrt(sum / (i1 - i0 + 1));
  return rms <= 1e-9 ? -120 : 20 * Math.log10(rms);
}

/** Lower-case Latin, strip Arabic diacritics/tatweel and edge punctuation. Never splits a word. */
export const normalizeToken = (text) => String(text).normalize('NFC').replace(DIACRITICS, '').replace(EDGE_PUNCT, '').toLowerCase();
export const tokens = (text) => String(text).split(/\s+/).map(normalizeToken).filter(Boolean);

/** Lexical emphasis tags in fixed order: digit, latin, cta. */
export function lexicalTags(text, {cta} = {}) {
  const tags = [];
  if (DIGIT.test(text)) tags.push('digit');
  if (LATIN.test(text)) tags.push('latin');
  const keyword = cta ? normalizeToken(cta) : '';
  if (keyword && tokens(text).includes(keyword)) tags.push('cta');
  return tags;
}

/** The last literal supplied sign-off token run; absence never invents an ending. */
export function findSignoff(words, signoff) {
  const expected=tokens(signoff??'');
  if(!expected.length)return null;
  const stream = [];
  words.forEach((w, wordIndex) => { for (const t of tokens(w.text)) stream.push({t, wordIndex}); });
  for (let i = stream.length - expected.length; i >= 0; i--) {
    if (expected.every((token, k) => token===stream[i + k].t)) {
      return {wordIndex: stream[i].wordIndex, fromMs: words[stream[i].wordIndex].startMs};
    }
  }
  return null;
}

/** Caption words: text + source-ms interval, ordered by start. Returns a copy with only those fields. */
export function validateWords(words) {
  if (!Array.isArray(words) || !words.length) throw new TypeError('Expected a non-empty array of caption words.');
  let last = -Infinity;
  return words.map((w, i) => {
    const ok = w && typeof w.text === 'string' && w.text.trim() && Number.isFinite(w.startMs) && Number.isFinite(w.endMs) &&
      w.startMs >= 0 && w.endMs > w.startMs && w.startMs >= last;
    if (!ok) throw new TypeError(`Caption word ${i} needs text and ordered startMs < endMs in source milliseconds.`);
    last = w.startMs;
    return {text: w.text, startMs: w.startMs, endMs: w.endMs};
  });
}

/** Validate measured head samples. A null box or method 'none' requires review. */
export function validateHeadEnvelope(json) {
  const fail = (message) => { throw new TypeError(`Head envelope: ${message}`); };
  if (!json || json.version !== 1) fail('version must be 1.');
  if (!['rvm', 'blazeface', 'none'].includes(json.method)) fail("method must be 'rvm', 'blazeface' or 'none'.");
  if (!json.source || !(json.source.fps > 0)) fail('source.fps must be > 0.');
  if (!Array.isArray(json.samples)) fail('samples must be an array.');
  const unit = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
  json.samples.forEach((s, i) => {
    if (!Number.isInteger(s?.frame) || s.frame < 0) fail(`sample ${i} frame must be a whole number >= 0.`);
    if (!unit(s.confidence)) fail(`sample ${i} confidence must be within 0..1.`);
    if (s.box !== null) {
      const b = s.box;
      if (!b || ![b.x, b.y, b.width, b.height].every(unit) || !(b.width > 0 && b.height > 0) || b.x + b.width > 1 + 1e-9 || b.y + b.height > 1 + 1e-9) {
        fail(`sample ${i} box must be a positive normalized rectangle or null.`);
      }
    }
  });
  return {...json, samples: [...json.samples].sort((a, b) => a.frame - b.frame)};
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;
const signed = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

/** Every eligible word whose score reaches the threshold, in time order. */
export function scoreWords(words, envelope, opts) {
  const o = {...EMPHASIS_DEFAULTS, ...opts, boosts: {...EMPHASIS_DEFAULTS.boosts, ...(opts.boosts ?? {})}};
  if (!(o.fps > 0)) throw new RangeError('fps must be > 0.');
  if(o.signoffFromMs!==undefined && o.signoffFromMs!==null && !(Number.isFinite(o.signoffFromMs) && o.signoffFromMs>=0)) throw new RangeError('signoffFromMs must be a recorded source time >= 0.');
  const audioEndMs=(envelope.values.length?((envelope.values.length-1)*envelope.hop+envelope.win):0)/envelope.sampleRate*1000;
  const boundary=o.signoffFromMs??audioEndMs;
  const levels = words.map((w) => wordLevelDb(envelope, w.startMs, w.endMs));
  const speech = levels.filter((db, i) => words[i].startMs < boundary && db > o.silenceDb);
  if (!speech.length) throw new Error('No audible speech in the eligible source range; check the WAV matches the captions.');
  const reference = median(speech);
  const latestStartMs = boundary - o.guardSec * 1000 - o.holdSec * 1000;
  const out = [];
  words.forEach((w, i) => {
    const atFrame = Math.floor(w.startMs * o.fps / 1000 + 1e-7);
    if (levels[i] <= o.silenceDb || atFrame < o.minLeadFrames || w.startMs > latestStartMs) return;
    const near = [];
    for (let j = Math.max(0, i - 3); j <= Math.min(words.length - 1, i + 3); j++) if (j !== i && levels[j] > o.silenceDb) near.push(levels[j]);
    const globalDb = levels[i] - reference;
    const localDb = near.length ? levels[i] - mean(near) : 0;
    const loud = Math.max(-1, Math.min(1, 0.5 * globalDb / 6 + 0.5 * localDb / 6));
    const tags = lexicalTags(w.text, {cta: o.cta});
    const score = Math.min(1, 0.6 * Math.max(0, loud) + tags.reduce((n, t) => n + o.boosts[t], 0));
    if (score < o.threshold) return;
    const kind = tags.includes('digit') || tags.includes('cta') ? 'punch-step' : tags.includes('latin') ? 'snap-in' : 'slow-push';
    const scale = capScale(Math.round((KIND_BASE[kind] + 0.02 * score) * 1000) / 1000);
    out.push({wordIndex: i, atFrame, score, kind, scale, tags, globalDb, localDb});
  });
  return out;
}

/** Strongest first, one punch per minGapSec (3-5 s); returned in time order. */
export function selectProposals(candidates, {fps, minGapSec = EMPHASIS_DEFAULTS.minGapSec}) {
  if (!(minGapSec >= 3 && minGapSec <= 5)) throw new RangeError('minGapSec must be within 3-5 s (one punch per 3-5 s).');
  const gap = Math.round(minGapSec * fps);
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.atFrame - b.atFrame || a.wordIndex - b.wordIndex);
  const kept = [];
  for (const c of ranked) if (kept.every((k) => Math.abs(k.atFrame - c.atFrame) >= gap)) kept.push(c);
  return kept.sort((a, b) => a.atFrame - b.atFrame);
}

/** Zoom origin from the head envelope over the punch and its hold, or null with the reason. */
export function anchorFromHead(head, {atFrame, fps, scale, holdSec = EMPHASIS_DEFAULTS.holdSec,
  sampleToleranceSec = EMPHASIS_DEFAULTS.sampleToleranceSec, minConfidence = EMPHASIS_DEFAULTS.minConfidence}) {
  if (!head) return {anchor: null, note: 'no head envelope'};
  if (head.method === 'none') return {anchor: null, note: "head envelope method 'none'"};
  const t0 = atFrame / fps - sampleToleranceSec, t1 = (atFrame + Math.round(holdSec * fps)) / fps + sampleToleranceSec;
  const near = head.samples.filter((s) => s.frame / head.source.fps >= t0 - 1e-9 && s.frame / head.source.fps <= t1 + 1e-9);
  if (!near.length) return {anchor: null, note: 'no head samples during the punch'};
  const bad = near.find((s) => s.box === null || s.confidence < minConfidence);
  if (bad) return {anchor: null, note: `head sample at frame ${bad.frame} is ${bad.box === null ? 'missing' : 'low-confidence'}`};
  const x0 = Math.min(...near.map((s) => s.box.x)), y0 = Math.min(...near.map((s) => s.box.y));
  const x1 = Math.min(1, Math.max(...near.map((s) => s.box.x + s.box.width))), y1 = Math.min(1, Math.max(...near.map((s) => s.box.y + s.box.height)));
  const anchor = anchorForBox({x: x0, y: y0, width: x1 - x0, height: y1 - y0}, scale);
  if (!anchor) return {anchor: null, note: `head box does not fit at scale ${scale}`};
  return {anchor: {x: Math.round(anchor.x * 1e4) / 1e4, y: Math.round(anchor.y * 1e4) / 1e4}, note: `anchor from ${near.length} ${head.method} head samples`};
}

/** The full offline pass: score, rate-cap, anchor. Returns the director proposals contract. */
export function proposeEmphasis({words, envelope, fps, head = null, cta, signoffFromMs, ...opts}) {
  const o = {...EMPHASIS_DEFAULTS, ...opts};
  const candidates = scoreWords(words, envelope, {...o, fps, cta, signoffFromMs});
  const kept = selectProposals(candidates, {fps, minGapSec: o.minGapSec});
  return {version: 1, proposals: kept.map((c) => {
    const {anchor, note} = anchorFromHead(head, {atFrame: c.atFrame, fps, scale: c.scale, holdSec: o.holdSec,
      sampleToleranceSec: o.sampleToleranceSec, minConfidence: o.minConfidence});
    const reason = `${c.tags.length ? c.tags.join('+') : 'acoustic'}; ${signed(c.globalDb)} dB vs median, ` +
      `${signed(c.localDb)} dB vs neighbours; score ${c.score.toFixed(2)}; ${note}`;
    return {wordIndex: c.wordIndex, atFrame: c.atFrame, kind: c.kind, scale: c.scale, anchor, reason, status: anchor ? 'proposed' : 'NEEDS-REVIEW'};
  })};
}
