export const DEFAULT_GAP_SEC = 0.35;

export const DEFAULT_PAD_MS = Object.freeze([120, 180]);
export const SNAP_RADIUS_SEC = 0.06;
export const MIN_REMOVE_SEC = 0.1;
export const MIN_KEEP_SEC = 0.1;
export const RETAKE_PHRASE_GAP_SEC = 0.6;
export const RETAKE_JACCARD = 0.6;
export const RETAKE_MIN_TOKENS = 2;
export const FILLER_PAUSE_SEC = 0.2;

export const MAX_SEGMENTS = 300;






export const FILLERS = Object.freeze([
  Object.freeze({tokens: Object.freeze(['امم']), requirePause: false, note: 'hesitation sound'}),
  Object.freeze({tokens: Object.freeze(['ااه']), requirePause: false, note: 'hesitation sound'}),
  Object.freeze({tokens: Object.freeze(['اه']), requirePause: true, note: 'also means "yes" in Egyptian Arabic'}),
  Object.freeze({tokens: Object.freeze(['يعني']), requirePause: true, note: 'also a meaningful connective'}),
  Object.freeze({tokens: Object.freeze(['ايه', 'ده']), requirePause: true, note: 'also a real exclamation'}),
]);


const SIGNOFF_ALIASES = Object.freeze({'كدا': 'كده'});

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const r3 = (v) => Math.round(v * 1e3) / 1e3;


export function normalizeArabic(text) {
  return String(text)
    .normalize('NFC')
    .replace(/[ً-ٰٟ]/gu, '')
    .replace(/ـ/gu, '')
    .replace(/[آأإ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه');
}


export function tokenize(text) {
  return normalizeArabic(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}


export function hesitationKey(token) {
  return token.replace(/(.)\1{2,}/gu, '$1$1');
}


export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let shared = 0;
  for (const token of A) if (B.has(token)) shared++;
  return shared / (A.size + B.size - shared);
}


export function findSignoffSec(words, phrase = null) {
  const SIGNOFF_TOKENS = phrase ? tokenize(phrase).map((token) => SIGNOFF_ALIASES[token] ?? token) : [];
  if (!SIGNOFF_TOKENS.length) return null;
  const flat = [];
  words.forEach((word, index) => {
    for (const token of tokenize(word.text)) flat.push({token: SIGNOFF_ALIASES[token] ?? token, index});
  });
  for (let k = flat.length - SIGNOFF_TOKENS.length; k >= 0; k--) {
    if (SIGNOFF_TOKENS.every((token, j) => flat[k + j].token === token)) return words[flat[k].index].startMs / 1000;
  }
  return null;
}


export function frameEnergy(rms, frame, fps) {
  const n = rms.values.length;
  if (!n) return 0;
  const t = frame / fps, half = 0.5 / fps;
  const lo = Math.max(0, Math.min(n - 1, Math.round((t - half) / rms.hopSec)));
  const hi = Math.max(0, Math.min(n - 1, Math.round((t + half) / rms.hopSec)));
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += rms.values[i];
  return sum / (hi - lo + 1);
}





export function snapBoundary({idealFrame, firstFrame, lastFrame, fps, rms = null}) {
  if (!Number.isFinite(firstFrame) || !Number.isFinite(lastFrame) || lastFrame < firstFrame) return null;
  let best = null, bestEnergy = Infinity;
  for (let f = firstFrame; f <= lastFrame; f++) {
    const energy = rms ? frameEnergy(rms, f, fps) : 0;
    const closer = best === null || Math.abs(f - idealFrame) < Math.abs(best - idealFrame) - 1e-9;
    if (energy < bestEnergy - 1e-12 || (Math.abs(energy - bestEnergy) <= 1e-12 && closer)) {
      best = f;
      bestEnergy = energy;
    }
  }
  return best;
}


export function parseWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('auto-cut: not a RIFF/WAVE file.');
  }
  let pos = 12, format = null, dataOff = -1, dataLen = 0;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4), size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      format = {code: buffer.readUInt16LE(pos + 8), channels: buffer.readUInt16LE(pos + 10),
        sampleRate: buffer.readUInt32LE(pos + 12), bits: buffer.readUInt16LE(pos + 22)};
    }
    if (id === 'data') { dataOff = pos + 8; dataLen = Math.min(size, buffer.length - dataOff); break; }
    pos += 8 + size + (size % 2);
  }
  if (!format || dataOff < 0) throw new Error('auto-cut: WAV needs fmt and data chunks.');
  if (![1, 0xfffe].includes(format.code) || format.bits !== 16 || format.channels < 1) {
    throw new Error('auto-cut: WAV must be 16-bit PCM (scripts/audio.mjs writes audio-16k.wav in this format).');
  }
  const count = Math.floor(dataLen / (2 * format.channels));
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) sum += buffer.readInt16LE(dataOff + (i * format.channels + c) * 2);
    samples[i] = sum / format.channels / 32768;
  }
  return {sampleRate: format.sampleRate, samples};
}


export function rmsEnvelope(samples, sampleRate, {hopSec = 0.01, winSec = 0.02} = {}) {
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const half = Math.max(1, Math.round((winSec * sampleRate) / 2));
  const values = [];
  for (let c = 0; c < samples.length; c += hop) {
    const a = Math.max(0, c - half), b = Math.min(samples.length, c + half);
    let sum = 0;
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    values.push(Math.sqrt(sum / Math.max(1, b - a)));
  }
  return {hopSec: hop / sampleRate, values};
}


export function silencesFromRms(rms, {thresholdDb = -35, minDurSec = DEFAULT_GAP_SEC} = {}) {
  const limit = 10 ** (thresholdDb / 20);
  const spans = [];
  let start = -1;
  const close = (endIndex) => {
    const s = start * rms.hopSec, e = endIndex * rms.hopSec;
    if (e - s >= minDurSec - 1e-9) spans.push({start: r3(s), end: r3(e), dur: r3(e - s)});
  };
  rms.values.forEach((v, i) => {
    if (v < limit) { if (start < 0) start = i; } else if (start >= 0) { close(i); start = -1; }
  });
  if (start >= 0) close(rms.values.length);
  return spans;
}

function prepareWords(words, fps, totalSec) {
  if (!Array.isArray(words) || !words.length) throw new Error('auto-cut: reviewed words are required.');
  let lastEnd = 0;
  return words.map((w, index) => {
    const valid = w && typeof w.text === 'string' && /\S/.test(w.text) && Number.isFinite(w.startMs) &&
      Number.isFinite(w.endMs) && w.startMs >= 0 && w.endMs > w.startMs;
    if (!valid) throw new Error(`auto-cut: word ${index} needs text and a positive startMs/endMs interval.`);
    if (w.startMs < lastEnd) throw new Error(`auto-cut: word ${index} overlaps or is out of order; words must be ordered and non-overlapping.`);
    if (w.endMs / 1000 > totalSec + 0.001) throw new Error(`auto-cut: word ${index} ends after the source (${totalSec}s).`);
    lastEnd = w.endMs;

    return {index, text: w.text.trim(), startSec: w.startMs / 1000, endSec: w.endMs / 1000,
      startF: (w.startMs * fps) / 1000, endF: (w.endMs * fps) / 1000, tokens: tokenize(w.text)};
  });
}

function splitPhrases(list) {
  const phrases = [];
  for (const w of list) {
    const current = phrases.at(-1);
    if (!current || w.startSec - current.endSec > RETAKE_PHRASE_GAP_SEC) {
      phrases.push({words: [w], startSec: w.startSec, endSec: w.endSec, tokens: [...w.tokens]});
    } else {
      current.words.push(w);
      current.endSec = w.endSec;
      current.tokens.push(...w.tokens);
    }
  }
  return phrases;
}

function matchFiller(list, k, tokens) {
  const got = [];
  for (let n = 1; n <= tokens.length && k + n - 1 < list.length; n++) {
    got.push(...list[k + n - 1].tokens.map(hesitationKey));
    if (got.length > tokens.length) return 0;
    if (got.length === tokens.length) return got.every((t, i) => t === tokens[i]) ? n : 0;
  }
  return 0;
}


export function segmentsFromRemovals(removals, {totalFrames, keptWords = [], minKeepFrames = 1}) {
  const cuts = removals.map((r) => [r.fromFrame, r.toFrame]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [a, b] of cuts) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const holdsWord = (a, b) => keptWords.some((w) => w.endF > a && w.startF < b);
  const absorbed = [];
  for (const cut of merged) {
    const last = absorbed.at(-1);
    const from = last ? last[1] : 0;
    if (cut[0] - from < minKeepFrames && !holdsWord(from, cut[0])) {
      if (last) last[1] = cut[1];
      else absorbed.push([0, cut[1]]);
    } else absorbed.push([cut[0], cut[1]]);
  }
  const tail = absorbed.at(-1);
  if (tail && totalFrames - tail[1] < minKeepFrames && !holdsWord(tail[1], totalFrames)) tail[1] = totalFrames;
  const segments = [];
  let cursor = 0;
  for (const [a, b] of absorbed) {
    if (a > cursor) segments.push({fromFrame: cursor, toFrame: a});
    cursor = Math.max(cursor, b);
  }
  if (cursor < totalFrames) segments.push({fromFrame: cursor, toFrame: totalFrames});
  return segments;
}


export function verifyProposal(list, segments, removedWords) {
  const issues = [];
  for (const w of list) {
    const hits = segments.filter((s) => w.endF > s.fromFrame && w.startF < s.toFrame);
    if (removedWords.has(w.index)) {
      if (hits.length) issues.push(`removed word ${w.index} still intersects a kept range`);
    } else if (hits.length !== 1 || w.startF < hits[0].fromFrame || w.endF > hits[0].toFrame) {
      issues.push(`kept word ${w.index} "${w.text}" is cut or dropped by the proposal`);
    }
  }
  return issues;
}








export function proposeCuts({words, silences = [], rms = null, fps, totalFrames, gapSec = DEFAULT_GAP_SEC,
  padMs = DEFAULT_PAD_MS, protect = [], signoffFromSec = null, signoffPhrase = null} = {}) {
  if (!(Number.isFinite(fps) && fps > 0)) throw new Error('auto-cut: fps must be a positive number.');
  if (!Number.isSafeInteger(totalFrames) || totalFrames < 1) throw new Error('auto-cut: totalFrames must be the positive integer source frame count.');
  if (!(Number.isFinite(gapSec) && gapSec > 0)) throw new Error('auto-cut: gapSec must be a positive number of seconds.');
  if (!Array.isArray(padMs) || padMs.length !== 2 || !padMs.every((v) => Number.isFinite(v) && v >= 0)) {
    throw new Error('auto-cut: padMs must be [tailMs, leadMs] with non-negative numbers.');
  }
  for (const p of protect) {
    if (!(Number.isFinite(p?.fromSec) && Number.isFinite(p?.toSec) && p.toSec > p.fromSec)) throw new Error('auto-cut: protect ranges need fromSec < toSec.');
  }
  const totalSec = totalFrames / fps;
  const tail = padMs[0] / 1000, lead = padMs[1] / 1000;
  const list = prepareWords(words, fps, totalSec);
  const warnings = [];

  const signoff = Number.isFinite(signoffFromSec) ? signoffFromSec : findSignoffSec(words, signoffPhrase);
  if (signoff === null && signoffPhrase?.trim()) {
    warnings.push({code: 'signoff-not-found', message: `The sign-off «${signoffPhrase.trim()}» is not in the words and no signoffFromSec was given; the ending is not protected. Check the transcript, or pass --signoff-sec before the Rough Cut gate.`});
  }
  const guards = [...protect, ...(signoff === null ? [] : [{fromSec: signoff, toSec: Infinity}])];
  const guarded = (fromSec, toSec) => guards.some((g) => fromSec < g.toSec && g.fromSec < toSec);
  const minRemove = Math.max(1, Math.ceil(MIN_REMOVE_SEC * fps - 1e-9));
  const minKeep = Math.max(1, Math.ceil(MIN_KEEP_SEC * fps - 1e-9));


  const place = (idealSec, hardLo, hardHi) => {
    const idealFrame = idealSec * fps;
    const soft = snapBoundary({idealFrame, fps, rms,
      firstFrame: Math.max(hardLo, Math.ceil((idealSec - SNAP_RADIUS_SEC) * fps - 1e-9)),
      lastFrame: Math.min(hardHi, Math.floor((idealSec + SNAP_RADIUS_SEC) * fps + 1e-9))});
    return soft ?? snapBoundary({idealFrame, fps, rms: null, firstFrame: hardLo, lastFrame: hardHi});
  };
  const removed = [];
  const removedWords = new Set();
  const entry = (reason, status, fromFrame, toFrame, extra) => ({reason, status, fromFrame, toFrame,
    fromSec: r6(fromFrame / fps), toSec: r6(toFrame / fps), words: [], text: '', detail: '', ...extra});



  const phrases = splitPhrases(list);
  const score = phrases.map((p, i) => {
    const next = phrases[i + 1];
    if (!next || p.tokens.length < RETAKE_MIN_TOKENS || next.tokens.length < RETAKE_MIN_TOKENS) return 0;
    return jaccard(p.tokens, next.tokens);
  });
  const isTake = score.map((s) => s >= RETAKE_JACCARD);
  for (let i = 0; i < phrases.length; i++) {
    if (!isTake[i] || (i > 0 && isTake[i - 1])) continue;
    let j = i;
    while (isTake[j + 1]) j++;
    const before = i > 0 ? phrases[i - 1] : null;
    const keep = phrases[j + 1];
    const takeWords = phrases.slice(i, j + 1).flatMap((p) => p.words);
    const lastBefore = before ? before.words.at(-1) : null;
    const fromFrame = before ? place(before.endSec + tail, Math.ceil(lastBefore.endF), Math.floor(takeWords[0].startF)) : 0;
    const toFrame = place(keep.startSec - lead, Math.ceil(takeWords.at(-1).endF), Math.floor(keep.words[0].startF));
    if (fromFrame === null || toFrame === null || toFrame <= fromFrame) {
      warnings.push({code: 'retake-unplaceable', message: `Retake at ${phrases[i].startSec.toFixed(2)}s has no frame-safe boundary; review by hand.`});
      continue;
    }
    if (guarded(fromFrame / fps, toFrame / fps)) {
      warnings.push({code: 'retake-protected', message: `Retake at ${phrases[i].startSec.toFixed(2)}s overlaps a protected range; left for manual review.`});
      continue;
    }
    removed.push(entry('retake', 'proposed', fromFrame, toFrame, {
      words: takeWords.map((w) => w.index), text: takeWords.map((w) => w.text).join(' '),
      detail: `earlier take (Jaccard ${score.slice(i, j + 1).map((s) => s.toFixed(2)).join(', ')}); keeps the take at ${keep.startSec.toFixed(2)}s`,
    }));
    takeWords.forEach((w) => removedWords.add(w.index));
  }


  for (let k = 0; k <= list.length; k++) {
    const prev = k > 0 ? list[k - 1] : null, next = k < list.length ? list[k] : null;
    if ((prev && removedWords.has(prev.index)) || (next && removedWords.has(next.index))) continue;
    const gapFrom = prev ? prev.endSec : 0, gapTo = next ? next.startSec : totalSec;
    if (gapTo <= gapFrom) continue;
    const hardLo = prev ? Math.ceil(prev.endF) : 0;
    const hardHi = next ? Math.floor(next.startF) : totalFrames;
    for (const s of silences) {
      const a = Math.max(gapFrom, s.start), b = Math.min(gapTo, s.end);
      if (b - a < gapSec - 1e-9) continue;
      const fromIdeal = prev ? a + tail : a;
      const toIdeal = next ? b - lead : b;
      if (toIdeal - fromIdeal < MIN_REMOVE_SEC - 1e-9) continue;
      const fromFrame = prev ? place(fromIdeal, hardLo, hardHi) : Math.max(0, Math.ceil(a * fps - 1e-9));
      const toFrame = next ? place(toIdeal, hardLo, hardHi) : Math.min(totalFrames, Math.floor(b * fps + 1e-9));
      if (fromFrame === null || toFrame === null || toFrame - fromFrame < minRemove) continue;
      if (guarded(fromFrame / fps, toFrame / fps)) continue;
      removed.push(entry('silence', 'proposed', fromFrame, toFrame, {detail: `pause ${(b - a).toFixed(2)}s tightened`}));
    }
  }
  let inside = 0;
  for (const s of silences) {
    const length = s.end - s.start;
    if (length < gapSec - 1e-9 || guarded(s.start, s.end)) continue;
    const covered = list.reduce((sum, w) => sum + Math.max(0, Math.min(s.end, w.endSec) - Math.max(s.start, w.startSec)), 0);
    if (covered > length / 2) inside++;
  }
  if (inside) {
    warnings.push({code: 'pauses-inside-words', message: `${inside} detected pause(s) lie mostly inside word timings and cannot be cut without cutting a word. Whisper-style timings absorb pauses; word timings aligned by scripts/align-captions.mjs are tighter.`});
  }


  for (let k = 0; k < list.length; k++) {
    for (const filler of FILLERS) {
      const n = matchFiller(list, k, filler.tokens);
      if (!n) continue;
      const run = list.slice(k, k + n), first = run[0], last = run.at(-1);
      if (run.some((w) => removedWords.has(w.index)) || guarded(first.startSec, last.endSec)) break;
      const prev = k > 0 ? list[k - 1] : null, next = k + n < list.length ? list[k + n] : null;
      const pauseBefore = prev ? first.startSec - prev.endSec : Infinity;
      const pauseAfter = next ? next.startSec - last.endSec : Infinity;
      if (filler.requirePause && Math.max(pauseBefore, pauseAfter) < FILLER_PAUSE_SEC - 1e-9) break;
      let fromFrame = place(first.startSec, prev ? Math.ceil(prev.endF) : 0, Math.floor(first.startF));
      let toFrame = place(last.endSec, Math.ceil(last.endF), next ? Math.floor(next.startF) : totalFrames);
      let detail = filler.note;
      if (fromFrame === null || toFrame === null) {
        fromFrame = Math.floor(first.startF);
        toFrame = Math.ceil(last.endF);
        detail += '; touches a neighbouring word, trim by hand';
      }
      removed.push(entry('filler', 'suggest', fromFrame, toFrame, {words: run.map((w) => w.index), text: run.map((w) => w.text).join(' '), detail}));
      k += n - 1;
      break;
    }
  }

  removed.sort((x, y) => x.fromFrame - y.fromFrame || x.toFrame - y.toFrame);
  const keptWords = list.filter((w) => !removedWords.has(w.index));
  const segments = segmentsFromRemovals(removed.filter((r) => r.status === 'proposed'), {totalFrames, keptWords, minKeepFrames: minKeep});
  if (!segments.length) throw new Error('auto-cut: the proposal would remove the whole source.');
  if (segments.length > MAX_SEGMENTS) throw new Error(`auto-cut: ${segments.length} segments exceed the manifest limit of ${MAX_SEGMENTS}; raise gapSec.`);
  const issues = verifyProposal(list, segments, removedWords);
  if (issues.length) throw new Error(`auto-cut: internal invariant failed: ${issues.join('; ')}`);
  return {segments, removed, warnings, signoffFromSec: signoff};
}


export function summarizeProposal({segments, removed}, {fps, totalFrames}) {
  const keptFrames = segments.reduce((sum, s) => sum + s.toFrame - s.fromFrame, 0);
  const count = (reason, status) => removed.filter((r) => r.reason === reason && r.status === status).length;
  return {sourceSec: r3(totalFrames / fps), keptSec: r3(keptFrames / fps), removedSec: r3((totalFrames - keptFrames) / fps),
    proposed: {silence: count('silence', 'proposed'), retake: count('retake', 'proposed')}, suggestions: count('filler', 'suggest')};
}

const clock = (sec) => {
  const cs = Math.round(sec * 100), m = Math.floor(cs / 6000);
  return `${String(m).padStart(2, '0')}:${((cs - m * 6000) / 100).toFixed(2).padStart(5, '0')}`;
};


export function formatProposalTable(proposal, {fps, totalFrames}) {
  const rows = [['#', 'reason', 'status', 'from', 'to', 'len', 'frames', 'text / detail']];
  proposal.removed.forEach((r, i) => rows.push([String(i + 1), r.reason, r.status, clock(r.fromSec), clock(r.toSec),
    `${(r.toSec - r.fromSec).toFixed(2)}s`, `${r.fromFrame}-${r.toFrame}`, r.text ? `"${r.text}" (${r.detail})` : r.detail]));
  const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => (c === rows[0].length - 1 ? 0 : row[c].length))));
  const lines = rows.map((row) => row.map((cell, c) => (c === row.length - 1 ? cell : cell.padEnd(widths[c]))).join('  '));
  const sum = summarizeProposal(proposal, {fps, totalFrames});
  lines.push('', `kept ${sum.keptSec.toFixed(2)}s of ${sum.sourceSec.toFixed(2)}s; removes ${sum.removedSec.toFixed(2)}s ` +
    `(${sum.proposed.silence} silence, ${sum.proposed.retake} retake proposed); ${sum.suggestions} filler suggestion(s) not applied`);
  for (const w of proposal.warnings ?? []) lines.push(`WARNING ${w.code}: ${w.message}`);
  return lines.join('\n');
}
