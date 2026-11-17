import test from 'node:test';
import assert from 'node:assert/strict';
import {applyEarReview, applyReview} from '../scripts/lib/breakdown-review.mjs';
import {SFX_TYPES} from '../scripts/lib/breakdown-merge.mjs';

const pending = extra => ({basis: 'measured', confidence: 'low', status: 'needs-confirmation', reason: 'r', confirmHow: 'h', ...extra});
function reel() {
  return {durationSec: 12, shots: [], cuts: [], transitions: [], events: [], text: [], overlays: [], rejected: [],
    sound: {hasAudio: true, sfx: [{id: 'X01', t: 3.25, type: 'pop', ...pending()}, {id: 'X02', t: 6.5, type: 'impact', ...pending()}],
      bed: {present: null, ...pending()}, tempo: {bpm: 120, ...pending()}, beats: [0, .5, 1], cutsOnBeat: {share: null, chance: null, synced: null}},
    reviewQueue: ['X01', 'X02', 'sound.bed', 'sound.tempo']};
}

test('SFX types follow the sound analyser rule order', () => {
  assert.deepEqual(SFX_TYPES, ['pop', 'click', 'ding', 'impact', 'whoosh', 'riser', 'hit']);
});

test('ear answers confirm, correct and reject sound items as heard by the creator', () => {
  const next = applyEarReview(reel(), [
    {id: 'X01', verdict: 'confirm', value: null},
    {id: 'X02', verdict: 'reject', value: null},
    {id: 'sound.bed', verdict: 'correct', value: {present: true}},
    {id: 'sound.tempo', verdict: 'correct', value: {bpm: 60}},
  ]);
  const x = next.sound.sfx.find(s => s.id === 'X01');
  assert.deepEqual([x.basis, x.status, x.confidence, x.reviewedWith, x.heardBy], ['heard', 'confirmed', 'high', 'ear', 'creator']);
  assert.equal(x.reason, undefined);
  assert.equal(next.sound.sfx.some(s => s.id === 'X02'), false);
  assert.ok(next.rejected.includes('X02'));
  assert.equal(next.sound.bed.present, true);
  assert.equal(next.sound.tempo.bpm, 60);
  assert.deepEqual(next.sound.beats, []);
  assert.match(next.sound.tempo.note, /beat grid/);
  assert.deepEqual(next.reviewQueue, []);
});

test('ear answers refuse picture items, unknown beds and bad values', () => {
  const b = reel();
  b.text = [{id: 'T01', ...pending(), start: 0, end: 1}]; b.reviewQueue.push('T01');
  assert.throws(() => applyEarReview(b, [{id: 'T01', verdict: 'confirm'}]), /picture item/);
  assert.throws(() => applyEarReview(reel(), [{id: 'sound.bed', verdict: 'confirm'}]), /unknown music bed/);
  assert.throws(() => applyEarReview(reel(), [{id: 'X01', verdict: 'correct', value: {type: 'boing'}}]), /type/);
  assert.throws(() => applyEarReview(reel(), [{id: 'sound.tempo', verdict: 'correct', value: {bpm: 400}}]), /40 and 240/);
  assert.throws(() => applyEarReview(reel(), [{id: 'sound.bed', verdict: 'reject'}]), /Only a sound effect/);
});

test('image answers still cannot touch sound items', () => {
  assert.throws(() => applyReview(reel(), [{id: 'X01', verdict: 'confirm'}]), /Audio required/);
});


test('ear answers reject duplicates, nonpending ids and contradictory confirms without mutating input', () => {
  const b = reel(), before = structuredClone(b);
  assert.throws(() => applyEarReview(b, [{id: 'X01', verdict: 'confirm'}, {id: 'X01', verdict: 'reject'}]), /Duplicate/);
  assert.throws(() => applyEarReview({...b, reviewQueue: []}, [{id: 'X01', verdict: 'confirm'}]), /not pending/);
  assert.throws(() => applyEarReview(b, [{id: 'X01', verdict: 'confirm', value: {type: 'impact'}}]), /contradicts/);
  assert.deepEqual(b, before);
});
