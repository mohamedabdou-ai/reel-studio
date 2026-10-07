import './project-tmp.mjs';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ROOT } from './media.mjs';

export const TRANSCRIPTION_SCHEMA = 1;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

export function transcriptionCacheKey(identity) {
  return createHash('sha256').update(JSON.stringify(canonical({ schema: TRANSCRIPTION_SCHEMA, identity }))).digest('hex');
}

const contained = (root, file) => {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};

export function assertTranscriptionOutputPath(file) {
  const target = path.resolve(file);
  if (!contained(ROOT, target) || path.relative(ROOT, target) === '') throw new Error('Transcription output must be inside the project.');
  const forbidden = ['Raw', 'Reference', '.git', '.agents', '.codex'].map(name => path.join(ROOT, name));
  if (forbidden.some(dir => contained(dir, target))) throw new Error('Transcription output cannot write source media or project metadata.');

  let existing = target;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const real = fs.realpathSync(existing);
  if (!contained(fs.realpathSync(ROOT), real) || forbidden.some(dir => contained(dir, real))) {
    throw new Error('Transcription output follows a link outside the project or into source media.');
  }

  for (let current = existing; path.relative(ROOT, current) !== ''; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Transcription output cannot follow a symlink or junction.');
  }
  return target;
}

export function planTranscriptionChunks({ startMs = 0, durationMs, chunkMs = 14000, overlapMs = 2000 }) {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('A positive duration in milliseconds is required.');
  if (!Number.isSafeInteger(startMs) || startMs < 0) throw new Error('Invalid source start.');
  if (!Number.isSafeInteger(chunkMs) || chunkMs <= 0 || !Number.isSafeInteger(overlapMs) || overlapMs < 0 || overlapMs >= chunkMs) {
    throw new Error('Chunk length must be positive and overlap must be smaller than the chunk.');
  }
  const chunks = [];
  const endMs = startMs + durationMs;
  for (let start = startMs; start < endMs; start += chunkMs - overlapMs) {
    chunks.push({ index: chunks.length, startMs: start, endMs: Math.min(start + chunkMs, endMs) });
    if (start + chunkMs >= endMs) break;
  }
  return chunks.map((chunk, index) => ({
    ...chunk,
    ownStartMs: index ? Math.round((chunks[index - 1].endMs + chunk.startMs) / 2) : startMs,
    ownEndMs: index + 1 < chunks.length ? Math.round((chunk.endMs + chunks[index + 1].startMs) / 2) : endMs,
  }));
}

function chunkWords(raw, chunk, issues, rejected) {
  if (!Array.isArray(raw?.transcription)) throw new Error(`Chunk ${chunk.index} has no valid transcription array.`);
  const words = [];
  let current = null;
  for (const [segmentIndex, item] of raw.transcription.entries()) {
    if (typeof item.text !== 'string') throw new Error(`Chunk ${chunk.index}, segment ${segmentIndex} has invalid text.`);
    if (!item.text || /^\[_[^]*_\]$/.test(item.text)) continue;
    const from = item.offsets?.from;
    const to = item.offsets?.to;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from) {
      const issue = { code: 'invalid_timing', chunk: chunk.index, segment: segmentIndex, text: item.text, offsets: item.offsets ?? null };
      issues.push(issue); rejected.push(issue); current = null; continue;
    }
    const startMs = chunk.startMs + Math.round(from);
    const endMs = chunk.startMs + Math.round(to);
    if (startMs < chunk.startMs || endMs > chunk.endMs) issues.push({ code: 'outside_chunk', chunk: chunk.index, text: item.text, startMs, endMs });
    const probs = (item.tokens ?? []).map(t => t.p).filter(p => Number.isFinite(p) && p >= 0 && p <= 1);
    const confidence = probs.length ? Math.min(...probs) : null;
    const dtw = (item.tokens ?? []).find(t => Number.isFinite(t.t_dtw) && t.t_dtw >= 0)?.t_dtw;
    const timestampMs = dtw === undefined ? null : chunk.startMs + Math.round(dtw * 10);


    if (current && !/^\s/u.test(item.text)) {
      current.text += item.text;
      current.endMs = endMs;
      current.confidence = current.confidence === null || confidence === null ? null : Math.min(current.confidence, confidence);
    } else {
      current = { text: item.text, startMs, endMs, timestampMs, confidence };
      words.push(current);
    }
    if (/\S\s+\S/u.test(item.text)) issues.push({ code: 'word_timing_unavailable', chunk: chunk.index, text: item.text, startMs, endMs });
  }
  return words;
}

export function mergeTranscriptionChunks(results, { confidenceThreshold = 0.6 } = {}) {
  const captions = [], issues = [], excludedOverlap = [], rejected = [];
  for (const [resultIndex, { chunk, raw }] of results.entries()) {
    const words = chunkWords(raw, chunk, issues, rejected);
    for (const word of words) {
      const midpoint = (word.startMs + word.endMs) / 2;
      if ((resultIndex > 0 && midpoint < chunk.ownStartMs) || (resultIndex + 1 < results.length && midpoint >= chunk.ownEndMs)) {
        excludedOverlap.push({ ...word, chunk: chunk.index, reason: 'overlap_owned_by_adjacent_chunk' });
      } else captions.push(word);
    }
    if (chunk.index > 0) issues.push({ code: 'chunk_seam_review', chunk: chunk.index, startMs: chunk.startMs, endMs: chunk.ownStartMs, message: 'Listen across this overlap: independently decoded wording and timing can disagree. Raw alternatives are retained.' });
  }

  for (const [index, caption] of captions.entries()) {
    const detail = { caption: index, text: caption.text, startMs: caption.startMs, endMs: caption.endMs };
    if (caption.confidence === null) issues.push({ code: 'missing_confidence', ...detail });
    else if (caption.confidence < confidenceThreshold) issues.push({ code: 'low_confidence', confidence: caption.confidence, ...detail });
    if (caption.endMs - caption.startMs < 40) issues.push({ code: 'collapsed_word_timing', ...detail });
    if (index && caption.startMs < captions[index - 1].endMs) issues.push({ code: 'overlapping_words', previousCaption: index - 1, ...detail });
    if (caption.timestampMs !== null && (caption.timestampMs < caption.startMs - 500 || caption.timestampMs > caption.endMs + 500)) issues.push({ code: 'dtw_disagreement', timestampMs: caption.timestampMs, ...detail });
    if (caption.text.includes('\uFFFD')) issues.push({ code: 'invalid_unicode', ...detail });
  }
  if (!captions.length) issues.push({ code: 'no_recognized_speech', message: 'No spoken words were recognized; listen to the source before accepting an empty transcript.' });
  return { captions, issues, excludedOverlap, rejected, requiresReview: issues.length > 0 };
}

export function captionsToSrt(captions, { maxChars = 42, maxGapMs = 700 } = {}) {
  const groups = [];
  let current;
  for (const caption of captions) {
    if (!Number.isFinite(caption.startMs) || !Number.isFinite(caption.endMs) || caption.startMs < 0 || caption.endMs <= caption.startMs) throw new Error(`Invalid SRT timing for ${JSON.stringify(caption.text)}.`);
    if (!current || caption.startMs - current.endMs > maxGapMs || (current.text + caption.text).length > maxChars) {
      current = { text: caption.text, startMs: caption.startMs, endMs: caption.endMs };
      groups.push(current);
    } else {
      current.text += caption.text;
      current.endMs = Math.max(current.endMs, caption.endMs);
    }
  }
  const timestamp = value => {
    const ms = Math.round(value);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return { srt: groups.map((group, index) => `${index + 1}\n${timestamp(group.startMs)} --> ${timestamp(group.endMs)}\n${group.text.trim()}\n`).join('\n'), cues: groups.length };
}

export async function writeTranscriptionJson(file, value) {
  assertTranscriptionOutputPath(file);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temp, file);
}

const OUTPUTS = { raw: 'whisper-raw.json', captions: 'captions.json', srt: 'captions.srt', report: 'transcript-review.json' };

export async function writeTranscriptionCache(dir, identity, outputs) {
  assertTranscriptionOutputPath(dir);
  await fsp.mkdir(dir, { recursive: true });
  const files = {};


  for (const [key, name] of Object.entries(OUTPUTS)) {
    const file = path.join(dir, name);
    assertTranscriptionOutputPath(file);
    if (key === 'srt') {
      const temp = `${file}.${randomUUID()}.tmp`;
      await fsp.writeFile(temp, outputs[key], 'utf8');
      await fsp.rename(temp, file);
    } else await writeTranscriptionJson(file, outputs[key]);
    files[name] = await sha256File(file);
  }
  await writeTranscriptionJson(path.join(dir, 'transcript-manifest.json'), { schema: TRANSCRIPTION_SCHEMA, cacheKey: transcriptionCacheKey(identity), identity, files });
}

export async function readTranscriptionCache(dir, identity) {
  assertTranscriptionOutputPath(dir);
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'transcript-manifest.json'), 'utf8'));
    if (manifest.schema !== TRANSCRIPTION_SCHEMA || manifest.cacheKey !== transcriptionCacheKey(identity)) return null;
    const result = {};
    for (const [key, name] of Object.entries(OUTPUTS)) {
      const file = assertTranscriptionOutputPath(path.join(dir, name));
      if (await sha256File(file) !== manifest.files[name]) return null;
      const data = await fsp.readFile(file, 'utf8');
      result[key] = key === 'srt' ? data : JSON.parse(data);
    }
    return result;
  } catch { return null; }
}
