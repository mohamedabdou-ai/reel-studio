import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './project-paths.mjs';
import {SFX_TYPES} from './breakdown-merge.mjs';

export const FONT_CLASSES = Object.freeze(['naskh', 'kufi', 'ruqaa', 'thuluth', 'diwani', 'sans', 'serif', 'display', 'handwritten', 'unknown']);
export const FONT_WEIGHTS = Object.freeze(['light', 'regular', 'bold', 'black', 'unknown']);
const CONFIG_FILE = path.join(ROOT, 'scripts', 'data', 'breakdown-listener.json');

export function loadListenerConfig(file = CONFIG_FILE) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (c.schema !== 1 || c.provider !== 'gemini' || c.api !== 'generateContent' || !/^gemini-[a-z0-9.-]+$/u.test(c.model ?? '')
    || !Number.isFinite(c.price?.input) || !Number.isFinite(c.price?.after?.input) || !(c.videoFps > 0 && c.videoFps <= 24)) throw new Error('Invalid listener configuration.');
  const positive = [c.price.output, c.price.after.output, c.tokens?.perFrame, c.tokens?.audioPerSecond, c.tokens?.prompt, c.tokens?.typicalOutput,
    c.maxOutputTokens, c.maxDurationSec, c.maxBytes, c.processingTimeoutMs];
  if ([c.price.input, c.price.after.input, ...positive].some(v => !Number.isFinite(v) || v <= 0)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(c.price.until ?? '') || typeof c.checked !== 'string' || typeof c.dataUse !== 'string'
    || !Number.isInteger(c.maxOutputTokens) || !Number.isInteger(c.maxBytes)) throw new Error('Invalid listener configuration.');
  return c;
}

const str = {type: 'string'};
export const LISTENER_SCHEMA = Object.freeze({
  type: 'object', required: ['sfx', 'extraSfx', 'text', 'music', 'voice'],
  properties: {
    sfx: {type: 'array', items: {type: 'object', required: ['id', 'heard', 'type'], properties: {id: str, heard: {type: 'boolean'}, type: {type: 'string', enum: [...SFX_TYPES, 'none']}}}},
    extraSfx: {type: 'array', items: {type: 'object', required: ['t', 'type'], properties: {t: {type: 'number', minimum: 0}, type: {type: 'string', enum: [...SFX_TYPES]}}}},
    text: {type: 'array', items: {type: 'object', required: ['id', 'font', 'weight'], properties: {id: str, font: {type: 'string', enum: [...FONT_CLASSES]}, weight: {type: 'string', enum: [...FONT_WEIGHTS]}}}},
    music: {type: 'object', required: ['present', 'character', 'characterAr', 'bpm'], properties: {present: {type: 'boolean'}, character: str, characterAr: str, bpm: {type: ['number', 'null']}}},
    voice: {type: 'object', required: ['present', 'character', 'characterAr'], properties: {present: {type: 'boolean'}, character: str, characterAr: str}},
  },
});

const r1 = v => Math.round(v * 10) / 10;
export function buildListenerPrompt(b) {
  const sfx = (b.sound?.sfx ?? []).slice(0, 120).map(x => ({id: x.id, t: r1(x.t)}));
  const text = (b.text ?? []).filter(t => t.kind !== 'scene-text').slice(0, 80).map(t => ({id: t.id, start: r1(t.start), end: r1(t.end), text: String(t.text ?? '').slice(0, 120)}));
  return [
    'You are checking a measured breakdown of a short video. Listen to the audio and watch the picture. Times are seconds from the start of the video.',
    `1. Sound-effect candidates found by measurement. For each id, say whether you hear a distinct edited sound effect at that time (not speech, not the steady music) and its type: ${SFX_TYPES.join(', ')}. Use heard false and type none when there is no sound effect.`,
    JSON.stringify(sfx),
    '2. Other distinct sound effects you hear that are not in the list: time in seconds with one decimal, and type.',
    `3. On-screen text cues. For each id, the font family class (${FONT_CLASSES.join(', ')}) and weight (${FONT_WEIGHTS.join(', ')}).`,
    JSON.stringify(text),
    '4. Music: is there a music bed, a short character description in English and in simple Arabic (each at most 12 words), and its tempo in BPM when it is clear, else null.',
    '5. Voice: is there speech, and a short character description in English and in simple Arabic (each at most 12 words).',
    'Do not guess. Use unknown, none or null when you are not sure. Answer only with JSON that follows the schema.',
  ].join('\n');
}

export function buildGenerateBody({fileUri, mimeType, prompt, config}) {
  return {
    contents: [{role: 'user', parts: [{fileData: {mimeType, fileUri}, videoMetadata: {fps: config.videoFps}}, {text: prompt}]}],
    generationConfig: {responseMimeType: 'application/json', responseJsonSchema: LISTENER_SCHEMA, temperature: 0, maxOutputTokens: config.maxOutputTokens},
  };
}

export function estimateListenerCost(durationSec, config, at = new Date()) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Invalid reference duration.');
  const price = at.toISOString().slice(0, 10) > config.price.until ? config.price.after : config.price;
  const inputTokens = Math.ceil(durationSec * (config.videoFps * config.tokens.perFrame + config.tokens.audioPerSecond) + config.tokens.prompt);
  const usd = out => Math.round((inputTokens * price.input + out * price.output) / 1e6 * 1e4) / 1e4;
  return {inputTokens, typicalOutputTokens: config.tokens.typicalOutput, maxOutputTokens: config.maxOutputTokens,
    usdTypical: usd(config.tokens.typicalOutput), usdMax: usd(config.maxOutputTokens), priceChecked: config.checked};
}

export function validateHeard(raw, b) {
  const fail = m => { throw Object.assign(new Error(`Listener returned invalid data: ${m}`), {code: 'invalid-response'}); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('not an object');
  if (!Number.isFinite(b.durationSec) || b.durationSec <= 0) fail('reference duration');
  for (const k of ['sfx', 'extraSfx', 'text']) if (!Array.isArray(raw[k])) fail(`${k} is not a list`);
  if (raw.sfx.length > 1000 || raw.extraSfx.length > 1000 || raw.text.length > 1000) fail('too many entries');
  const sfxIds = new Set((b.sound?.sfx ?? []).map(x => x.id)), textIds = new Set((b.text ?? []).filter(t => t.kind !== 'scene-text').map(t => t.id));
  const seen = new Set(), ignoredIds = [], sfx = [], text = [];
  for (const x of raw.sfx) {
    if (!x || typeof x.id !== 'string' || typeof x.heard !== 'boolean' || ![...SFX_TYPES, 'none'].includes(x.type)) fail('sound effect entry');
    if (!sfxIds.has(x.id) || seen.has(x.id)) { ignoredIds.push(x.id); continue; }
    seen.add(x.id);
    const heard = x.heard && x.type !== 'none';
    sfx.push({id: x.id, heard, type: heard ? x.type : null});
  }
  const extraSfx = raw.extraSfx.slice(0, 60).map(x => {
    if (!x || !Number.isFinite(x.t) || !SFX_TYPES.includes(x.type)) fail('extra sound effect entry');
    return {t: Math.round(Math.min(Math.max(0, x.t), b.durationSec) * 1000) / 1000, type: x.type};
  }).sort((p, q) => p.t - q.t);
  for (const t of raw.text) {
    if (!t || typeof t.id !== 'string' || !FONT_CLASSES.includes(t.font) || !FONT_WEIGHTS.includes(t.weight)) fail('text entry');
    if (!textIds.has(t.id) || seen.has(t.id)) { ignoredIds.push(t.id); continue; }
    seen.add(t.id); text.push({id: t.id, font: t.font, weight: t.weight});
  }
  const words = s => (typeof s === 'string' ? s : fail('description')).replace(/\s+/gu, ' ').trim().slice(0, 120);
  const m = raw.music, v = raw.voice;
  if (!m || typeof m.present !== 'boolean' || !(m.bpm === null || typeof m.bpm === 'number')) fail('music');
  if (!v || typeof v.present !== 'boolean') fail('voice');
  const bpm = Number.isFinite(m.bpm) && m.bpm >= 40 && m.bpm <= 240 ? r1(m.bpm) : null;
  return {sfx, extraSfx, text,
    music: {present: m.present, character: words(m.character), characterAr: words(m.characterAr), bpm},
    voice: {present: v.present, character: words(v.character), characterAr: words(v.characterAr)}, ignoredIds};
}
