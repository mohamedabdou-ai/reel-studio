import test from 'node:test';
import assert from 'node:assert/strict';
import {HEARD_REASONS, mergeHeard, recordListenerFailure} from '../scripts/lib/breakdown-heard.mjs';

const m = extra => ({basis: 'measured', confidence: 'medium', status: 'confirmed', ...extra});
function reel() {
  return {durationSec: 14.6, shots: [], cuts: [], transitions: [], events: [], overlays: [], limitations: ['Listener failed (quota): old'],
    text: [{id: 'T01', start: .5, end: 3, text: 'سر النجاح', kind: 'caption', ...m()}],
    sound: {hasAudio: true, beats: [], cutsOnBeat: null,
      sfx: [{id: 'X01', t: 3.25, type: 'pop', ...m()}, {id: 'X02', t: 6.75, type: 'impact', ...m()}, {id: 'X03', t: 9.25, type: 'click', ...m()}, {id: 'X04', t: 12, type: 'pop', ...m()}],
      bed: {present: null, ...m({confidence: 'low', status: 'needs-confirmation', reason: 'x', confirmHow: 'y'})}, tempo: {bpm: 120, ...m()}},
    reviewQueue: []};
}
const heard = () => ({sfx: [{id: 'X01', heard: true, type: 'pop'}, {id: 'X02', heard: false, type: null}, {id: 'X03', heard: true, type: 'ding'}],
  extraSfx: [{t: 3.5, type: 'pop'}, {t: 11, type: 'whoosh'}], text: [{id: 'T01', font: 'kufi', weight: 'bold'}],
  music: {present: true, character: 'piano', characterAr: 'بيانو', bpm: 60}, voice: {present: false, character: 'none', characterAr: 'مفيش'}, ignoredIds: []});
const meta = {provider: 'gemini', model: 'gemini-3.8-flash', at: '2026-11-16T10:00:00Z', referenceSha256: 'a'.repeat(64), usage: {promptTokens: 1}, estimateUsd: {usdMax: .05}, remoteDeleted: true};

test('agreement confirms as heard, disagreement and silence ask for confirmation', () => {
  const b = mergeHeard(reel(), heard(), meta), s = id => b.sound.sfx.find(x => x.id === id);
  assert.deepEqual([s('X01').basis, s('X01').status, s('X01').heard.verdict], ['heard', 'confirmed', 'heard']);
  assert.deepEqual([s('X02').status, s('X02').confidence, s('X02').reason], ['needs-confirmation', 'low', HEARD_REASONS.notHeard]);
  assert.deepEqual([s('X03').status, s('X03').reason, s('X03').type, s('X03').heard.type], ['needs-confirmation', HEARD_REASONS.type, 'click', 'ding']);
  assert.equal(s('X04').heard, undefined);
  assert.ok(b.limitations.some(l => /no answer for 1 measured/.test(l)));
});

test('extra sounds near a candidate are dropped; others become heard-only H items', () => {
  const b = mergeHeard(reel(), heard(), meta), h = b.sound.sfx.filter(x => x.id.startsWith('H'));
  assert.deepEqual(h.map(x => [x.id, x.t, x.type, x.status, x.reason]), [['H01', 11, 'whoosh', 'needs-confirmation', HEARD_REASONS.heardOnly]]);
  assert.ok(b.reviewQueue.includes('H01'));
  assert.deepEqual(b.sound.sfx.map(x => x.id), ['X01', 'X02', 'X03', 'H01', 'X04']);
});

test('bed, half tempo, font and voice are recorded; the run is labelled and earlier failures cleared', () => {
  const b = mergeHeard(reel(), heard(), meta);
  assert.deepEqual([b.sound.bed.present, b.sound.bed.basis, b.sound.bed.status], [true, 'heard', 'confirmed']);
  assert.deepEqual([b.sound.tempo.status, b.sound.tempo.reason, b.sound.tempo.heard.bpm], ['needs-confirmation', HEARD_REASONS.tempoOctave, 60]);
  assert.deepEqual(b.text[0].font, {family: 'kufi', weight: 'bold', basis: 'heard', confidence: 'medium'});
  assert.equal(b.sound.voice.present, false);
  assert.equal(b.listener.status, 'merged');
  assert.equal(b.limitations.some(l => l.startsWith('Listener failed')), false);
  assert.throws(() => mergeHeard(b, heard(), meta), /already merged/);
});

test('a failure keeps the local result and records the reason once', () => {
  const once = recordListenerFailure(reel(), {provider: 'gemini', model: 'gemini-3.8-flash', at: 'now', code: 'auth', message: 'Gemini API 403: [key] not valid', remoteDeleted: true});
  assert.equal(once.listener.status, 'failed');
  assert.deepEqual(once.limitations.filter(l => l.startsWith('Listener failed')), ['Listener failed (auth): Gemini API 403: [key] not valid']);
  const shape = list => list.map(x => [x.id, x.t, x.type, x.status]);
  assert.deepEqual(shape(once.sound.sfx), shape(reel().sound.sfx)); // recomputeBreakdown adds anchors, so compare the claims only
});


test('failure to delete is explicit on failure and repeated merges and foreign references are refused', () => {
  const b = reel(); b.source = {sha256: 'b'.repeat(64)};
  assert.throws(() => mergeHeard(b, heard(), meta), /identity/);
  const duplicate = heard(); duplicate.sfx.push(duplicate.sfx[0]);
  assert.throws(() => mergeHeard(reel(), duplicate, meta), /Duplicate/);
  const failed = recordListenerFailure(reel(), {...meta, code: 'timeout', message: 'time limit', remoteDeleted: false});
  assert.ok(failed.limitations.some(l => l.startsWith('The uploaded copy could not be deleted')));
  assert.throws(() => recordListenerFailure(mergeHeard(reel(), heard(), meta), {code: 'quota'}), /already merged/);
});


test('an absent measured tempo adopts the heard BPM at medium confidence without a false dispute', () => {
  for (const bpm of [null, undefined]) {
    const before = reel(); before.sound.tempo = {...m({status: 'needs-confirmation', confidence: 'low', reason: 'unknown', confirmHow: 'tap'}), bpm};
    before.sound.beats = [.5, 1];
    const next = mergeHeard(before, heard(), meta);
    assert.deepEqual([next.sound.tempo.bpm, next.sound.tempo.status, next.sound.tempo.confidence, next.sound.tempo.basis], [60, 'confirmed', 'medium', 'heard']);
    assert.equal(next.sound.tempo.reason, undefined); assert.deepEqual(next.sound.beats, []);
    assert.equal(before.sound.tempo.bpm, bpm);
  }
});

test('voice status and medium confidence retain the fixed report contract', () => {
  assert.deepEqual(mergeHeard(reel(), heard(), meta).sound.voice,
    {present: false, character: 'none', characterAr: heard().voice.characterAr, basis: 'heard', confidence: 'medium', status: 'confirmed'});
});
