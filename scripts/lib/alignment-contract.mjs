import './project-tmp.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT, assertProjectOutput} from './project-paths.mjs';

export const ALIGNMENT_SCHEMA = 1;
export const WHISPERX_RELEASE = Object.freeze({
  version: '3.8.6',
  commit: '3ccc17b8de34f305300f8a3fd3c9f76ba820c0d0',
  packageSha256: 'cb6d4fcd3fb6c42305cb8b222a33a0b78f6b657e9db3b714345fe43dc0a69c1f',
  source: 'https://pypi.org/project/whisperx/3.8.6/',
});
export const ARABIC_ALIGNMENT_MODEL = Object.freeze({
  repository: 'jonatasgrosman/wav2vec2-large-xlsr-53-arabic',
  revision: '3a200094b44306af86f8732637089706f0277293',
  license: 'apache-2.0',
  source: 'https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic',
});
export const ENGLISH_ALIGNMENT_MODEL=Object.freeze({
  repository:'facebook/wav2vec2-base-960h',revision:'22aad52d435eb6dbaf354bdad9b0da84ce7d6156',
  license:'apache-2.0',source:'https://huggingface.co/facebook/wav2vec2-base-960h',
});
export function alignmentModel(language='ar') {
  if(language==='ar')return ARABIC_ALIGNMENT_MODEL;
  if(language==='en')return ENGLISH_ALIGNMENT_MODEL;
  throw new Error('Alignment language must be ar or en; use a model trained for the recorded language.');
}

const sha256Text = value => createHash('sha256').update(value, 'utf8').digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('A valid edit manifest is required.');
  const {source, captions} = manifest;
  if (!source || typeof source.path !== 'string' || !/^[a-f0-9]{64}$/i.test(source.sha256 ?? '') || !finite(source.fps) || source.fps <= 0 || !Number.isSafeInteger(source.totalFrames) || source.totalFrames <= 0) {
    throw new Error('Manifest source metadata is malformed.');
  }
  if (!captions || captions.status !== 'reviewed') throw new Error('Alignment only consumes reviewed captions.');
  if (!Array.isArray(captions.words) || !captions.words.length) throw new Error('Reviewed captions must contain caption phrases.');
  const sourceDurationMs = Math.round(source.totalFrames / source.fps * 1000);
  let previousEndMs = null;
  for (const [index, phrase] of captions.words.entries()) {
    if (typeof phrase?.text !== 'string' || !phrase.text.trim() || !finite(phrase.startMs) || !finite(phrase.endMs) || phrase.startMs < 0 || phrase.endMs <= phrase.startMs) {
      throw new Error(`Caption phrase ${index} is malformed.`);
    }
    if (phrase.endMs > sourceDurationMs) throw new Error(`Caption phrase ${index} exceeds source bounds (${sourceDurationMs} ms).`);
    if (previousEndMs !== null && phrase.startMs < previousEndMs) throw new Error(`Caption phrase ${index} overlaps or is out of order.`);
    previousEndMs = phrase.endMs;
  }
  return manifest;
}

export function buildAlignmentRequest(input, {startMs = 0, durationMs} = {}) {
  const manifest = validateManifest(input);
  const sourceDurationMs = Math.round(manifest.source.totalFrames / manifest.source.fps * 1000);
  if (!Number.isSafeInteger(startMs) || startMs < 0) throw new Error('Alignment start must be a non-negative integer in milliseconds.');
  const resolvedDuration = durationMs ?? sourceDurationMs - startMs;
  if (!Number.isSafeInteger(resolvedDuration) || resolvedDuration <= 0) throw new Error('Alignment duration must be a positive integer in milliseconds.');
  const endMs = startMs + resolvedDuration;
  if (endMs > sourceDurationMs) throw new Error(`Alignment range exceeds source bounds (${sourceDurationMs} ms).`);
  const phrases = manifest.captions.words
    .map((phrase, originalPhraseIndex) => ({...phrase, originalPhraseIndex}))
    .filter(phrase => phrase.startMs >= startMs && phrase.endMs <= endMs);
  if (!phrases.length) throw new Error('Alignment range contains no complete reviewed phrase.');
  const segments = phrases.map(phrase => ({
    text: phrase.text,
    start: (phrase.startMs - startMs) / 1000,
    end: (phrase.endMs - startMs) / 1000,
  }));
  const transcriptSha256 = sha256Text(JSON.stringify(phrases.map(({text, startMs: start, endMs: end}) => ({text, startMs: start, endMs: end}))));
  return {
    schema: ALIGNMENT_SCHEMA,
    manifestId: manifest.id ?? null,
    source: {...manifest.source},
    range: {startMs, durationMs: resolvedDuration, endMs},
    phrases,
    segments,
    transcriptSha256,
  };
}

const normalizeMatch = value => String(value ?? '').normalize('NFC').trim();
const tokenize = text => text.match(/\S+/gu) ?? [];
const hasEnglish = text => /[A-Za-z]/u.test(text);

export function buildAlignmentDraft(request, raw, {confidenceThreshold = 0.6,language='ar'} = {}) {
  if (!raw || !Array.isArray(raw.segments)) throw new Error('WhisperX returned no valid segments array.');
  if (!finite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) throw new Error('Confidence threshold must be between 0 and 1.');
  const words = [];
  const issues = [];
  let globalTokenIndex = 0;
  let previousResolvedEndMs = null;
  for (const [phraseIndex, phrase] of request.phrases.entries()) {
    const canonicalTokens = tokenize(phrase.text);
    const alignedWords = Array.isArray(raw.segments[phraseIndex]?.words) ? raw.segments[phraseIndex].words : [];
    for (const [localIndex, text] of canonicalTokens.entries()) {
      const aligned = alignedWords[localIndex];
      const matches = aligned && normalizeMatch(aligned.word) === normalizeMatch(text);
      let unresolvedReason = null;
      let absoluteStartMs = null;
      let absoluteEndMs = null;
      if (!aligned) unresolvedReason = 'missing_alignment';
      else if (!matches) unresolvedReason = 'text_mismatch';
      else if (!finite(aligned.start) || !finite(aligned.end) || aligned.start < 0 || aligned.end <= aligned.start) unresolvedReason = 'invalid_timing';
      else {
        absoluteStartMs = request.range.startMs + Math.round(aligned.start * 1000);
        absoluteEndMs = request.range.startMs + Math.round(aligned.end * 1000);
        if (absoluteEndMs <= absoluteStartMs) unresolvedReason = 'collapsed_after_rounding';
        else if (absoluteStartMs < phrase.startMs || absoluteEndMs > phrase.endMs) unresolvedReason = 'outside_phrase';
        else if (previousResolvedEndMs !== null && absoluteStartMs < previousResolvedEndMs) unresolvedReason = 'overlaps_previous_word';
      }
      const validTiming = unresolvedReason === null;
      const confidence = validTiming && finite(aligned.score) && aligned.score >= 0 && aligned.score <= 1 ? aligned.score : null;
      const flags = [];
      if (!validTiming) flags.push('unresolved');
      if (validTiming && (confidence === null || confidence < confidenceThreshold)) flags.push('low_confidence');
      if (language==='ar' && (hasEnglish(text) || hasEnglish(phrase.text))) flags.push('mixed_english');
      const entry = {
        text,
        phraseIndex,
        tokenIndex: globalTokenIndex,
        startMs: validTiming ? absoluteStartMs : null,
        endMs: validTiming ? absoluteEndMs : null,
        confidence,
        flags,
      };
      if (unresolvedReason) entry.unresolvedReason = unresolvedReason;
      words.push(entry);
      for (const code of flags) issues.push({code, ...(code === 'unresolved' ? {reason: unresolvedReason} : {}), tokenIndex: globalTokenIndex, phraseIndex, text});
      if (validTiming) previousResolvedEndMs = absoluteEndMs;
      globalTokenIndex += 1;
    }
    if (alignedWords.length > canonicalTokens.length) {
      issues.push({code: 'unexpected_aligned_words', phraseIndex, count: alignedWords.length - canonicalTokens.length});
    }
  }
  const resolvedWords = words.filter(word => word.startMs !== null).length;
  const lowConfidenceWords = words.filter(word => word.flags.includes('low_confidence')).length;
  const unresolvedWords = words.length - resolvedWords;
  const mixedEnglishWords = words.filter(word => word.flags.includes('mixed_english')).length;
  return {
    schema: ALIGNMENT_SCHEMA,
    status: 'draft',
    transcript: {sha256: request.transcriptSha256, phrases: request.phrases.map(({text, startMs, endMs}) => ({text, startMs, endMs}))},
    range: request.range,
    words,
    coverage: {
      totalWords: words.length,
      resolvedWords,
      unresolvedWords,
      lowConfidenceWords,
      mixedEnglishWords,
      resolvedPercent: words.length ? Number((resolvedWords / words.length * 100).toFixed(2)) : 0,
    },
    issues,
    review: {required: true, reviewed: false, note: 'Alignment evidence only. Compare every timing with the source before promoting it.'},
  };
}

function parseInteger(value, name) {
  if (!/^\d+$/u.test(value ?? '')) throw new Error(`${name} must be an integer in milliseconds.`);
  return Number(value);
}

function assertProjectAlignmentOutput(value) {
  const absolute = assertProjectOutput(path.resolve(ROOT, value));
  const relative = path.relative(ROOT, absolute);
  if (relative.split(path.sep)[0] !== 'Projects') throw new Error('Alignment output must stay under Projects/.');
  return relative.replaceAll(path.sep, '/');
}

export function parseAlignmentOptions(argv) {
  const [command, ...args] = argv;
  if (!['inspect', 'install', 'run'].includes(command)) throw new Error('Expected inspect, install or run.');
  const values = {command};
  const allowed = command === 'run' ? new Set(['--edit', '--out', '--start-ms', '--duration-ms', '--confidence-threshold', '--language'])
    : new Set(command==='install'?['--language','--python']:['--language']);
  const seen=new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error(`Unknown option: ${flag}`);
    if(seen.has(flag))throw new Error(`Repeated option: ${flag}`);
    seen.add(flag);
    const value = args[++index];
    if (value === undefined) throw new Error(`Missing value for ${flag}.`);
    if(flag==='--language'){alignmentModel(value);values.language=value;}
    else if(flag==='--python')values.python=value;
    else if (flag === '--edit') values.edit = value;
    else if (flag === '--out') values.out = assertProjectAlignmentOutput(value);
    else if (flag === '--start-ms') values.startMs = parseInteger(value, 'start-ms');
    else if (flag === '--duration-ms') values.durationMs = parseInteger(value, 'duration-ms');
    else if (flag === '--confidence-threshold') {
      values.confidenceThreshold = Number(value);
      if (!finite(values.confidenceThreshold) || values.confidenceThreshold < 0 || values.confidenceThreshold > 1) throw new Error('confidence-threshold must be between 0 and 1.');
    }
  }
  if (command === 'run') {
    if (!values.edit) throw new Error('--edit is required.');
    if (!values.out) throw new Error('--out is required.');
  }
  return values;
}
