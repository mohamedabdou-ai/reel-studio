import {recomputeBreakdown} from './breakdown-merge.mjs';

export const HEARD_REASONS = Object.freeze({
  notHeard: 'The listener did not hear a sound effect here.',
  heardOnly: 'Only the listener heard this; its time is approximate.',
  type: 'The measured type and the heard type differ.',
  bed: 'The measured music bed and the listener disagree.',
  tempo: 'The measured tempo and the heard tempo differ.',
  tempoOctave: 'The heard tempo is half or double the measured tempo.',
});
const pad = n => String(n).padStart(2, '0');
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.04 * b;
const confirm = (item, confidence = 'high') => { Object.assign(item, {basis: 'heard', confidence, status: 'confirmed'}); delete item.reason; delete item.confirmHow; };
const dispute = (item, reason, confirmHow, confidence = 'medium') => Object.assign(item, {status: 'needs-confirmation', confidence, reason, confirmHow});
const withoutListenerFailures = list => (list ?? []).filter(l => !l.startsWith('Listener failed'));

export function mergeHeard(breakdown, heard, meta) {
  if (breakdown.listener?.status === 'merged') throw new Error('A listener result is already merged into this breakdown.');
  if (breakdown.source?.sha256 && breakdown.source.sha256 !== meta.referenceSha256) throw new Error('Listener reference identity differs from the breakdown.');
  const seen = new Set();
  for (const x of [...heard.sfx, ...heard.text]) {
    if (seen.has(x.id)) throw new Error('Duplicate heard id.');
    seen.add(x.id);
  }
  const b = structuredClone(breakdown), sfx = b.sound?.sfx ?? [], byId = new Map(sfx.map(x => [x.id, x]));
  for (const v of heard.sfx) {
    const x = byId.get(v.id);
    if (!x) throw new Error('Unknown heard sound effect id.');
    if (!v.heard) { x.heard = {verdict: 'not-heard', type: null}; dispute(x, HEARD_REASONS.notHeard, `Listen at ${x.t}s.`, 'low'); continue; }
    x.heard = {verdict: 'heard', type: v.type};
    if (v.type === x.type) confirm(x); else dispute(x, HEARD_REASONS.type, `Listen at ${x.t}s: ${x.type} or ${v.type}?`);
  }
  let n = Math.max(0, ...sfx.filter(x => /^H[0-9]+$/u.test(x.id)).map(x => Number(x.id.slice(1))));
  for (const e of heard.extraSfx) {
    if (sfx.some(x => Math.abs(x.t - e.t) <= 0.6)) continue;
    n++;
    sfx.push({id: `H${pad(n)}`, t: e.t, type: e.type, score: null, basis: 'heard', confidence: 'medium', status: 'needs-confirmation',
      reason: HEARD_REASONS.heardOnly, confirmHow: `Listen around ${e.t}s.`, heard: {verdict: 'heard-only', type: e.type}});
  }
  sfx.sort((p, q) => p.t - q.t);
  const texts = new Map((b.text ?? []).map(t => [t.id, t]));
  for (const f of heard.text) {
    if (!texts.has(f.id)) throw new Error('Unknown heard text id.');
    texts.get(f.id).font = {family: f.font, weight: f.weight, basis: 'heard', confidence: 'medium'};
  }
  const music = heard.music, bed = b.sound?.bed, tempo = b.sound?.tempo;
  if (bed) {
    bed.heard = {present: music.present, character: music.character, characterAr: music.characterAr};
    if (bed.present === null) { bed.present = music.present; confirm(bed, 'medium'); }
    else if (bed.present === music.present) confirm(bed);
    else dispute(bed, HEARD_REASONS.bed, 'Listen to a pause in the speech.');
  }
  if (tempo && music.present && Number.isFinite(music.bpm)) {
    tempo.heard = {bpm: music.bpm};
    if (!Number.isFinite(tempo.bpm)) {
      tempo.bpm = music.bpm;
      if (b.sound.beats?.length) { b.sound.beats = []; tempo.note = 'Tempo supplied by the listener; no measured beat grid applies.'; }
      confirm(tempo, 'medium');
    } else if (near(music.bpm, tempo.bpm)) confirm(tempo);
    else if (near(music.bpm, tempo.bpm * 2) || near(music.bpm, tempo.bpm / 2)) dispute(tempo, HEARD_REASONS.tempoOctave, 'Tap along with the music for ten seconds.');
    else dispute(tempo, HEARD_REASONS.tempo, 'Tap along with the music for ten seconds.');
  }
  if (b.sound) b.sound.voice = {present: heard.voice.present, character: heard.voice.character, characterAr: heard.voice.characterAr, basis: 'heard', confidence: 'medium', status: 'confirmed'};
  b.listener = {status: 'merged', provider: meta.provider, model: meta.model, at: meta.at, referenceSha256: meta.referenceSha256,
    usage: meta.usage, estimateUsd: meta.estimateUsd, ignoredIds: heard.ignoredIds, remoteDeleted: meta.remoteDeleted};
  b.limitations = withoutListenerFailures(b.limitations);
  if (heard.ignoredIds.length) b.limitations.push(`The listener answered ${heard.ignoredIds.length} unknown or repeated ids; they were ignored.`);
  const unanswered = sfx.filter(x => !x.heard).length;
  if (unanswered) b.limitations.push(`The listener gave no answer for ${unanswered} measured sound effects.`);
  if (meta.remoteDeleted === false) b.limitations.push('The uploaded copy could not be deleted from Gemini; Google deletes uploaded files after 48 hours.');
  return recomputeBreakdown(b);
}

export function recordListenerFailure(breakdown, failure) {
  if (breakdown.listener?.status === 'merged') throw new Error('A listener result is already merged into this breakdown.');
  const b = structuredClone(breakdown);
  b.listener = {status: 'failed', provider: failure.provider, model: failure.model, at: failure.at, code: failure.code, reason: failure.message, remoteDeleted: failure.remoteDeleted ?? null};
  b.limitations = [...withoutListenerFailures(b.limitations), `Listener failed (${failure.code}): ${failure.message}`];
  if (failure.remoteDeleted === false && !b.limitations.includes('The uploaded copy could not be deleted from Gemini; Google deletes uploaded files after 48 hours.')) b.limitations.push('The uploaded copy could not be deleted from Gemini; Google deletes uploaded files after 48 hours.');
  return recomputeBreakdown(b);
}
