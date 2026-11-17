// tests/breakdown-layers.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTokens, renderLayers} from '../scripts/lib/breakdown-layers.mjs';

const sample = {
  referenceId: 'ref-abc', durationSec: 10, aspect: '1080x1920', pace: {cutCount: 1, cutsPerMinute: 6, shotLen: {min: 4, median: 5, max: 6}},
  shots: [{id: 'S01', start: 0, end: 4, len: 4, camera: {label: 'static', status: 'confirmed'}}, {id: 'S02', start: 4, end: 10, len: 6, camera: {label: 'zoom-in', status: 'confirmed'}}],
  cuts: [{id: 'C01', t: 4, kind: 'jump', status: 'confirmed'}], transitions: [], events: [],
  text: [{id: 'T01', text: 'سر النجاح', start: 0.5, end: 3, zone: 'bottom', kind: 'caption', entrance: 'pop', exit: 'cut', style: {fill: '#ffffff', stroke: '#000000', box: null}, status: 'confirmed'}],
  overlays: [], look: {label: 'warm', status: 'confirmed'},
  sound: {bed: {present: true, status: 'confirmed'}, tempo: {bpm: 120, status: 'confirmed'}, sfx: [{id: 'X01', t: 4.02, type: 'pop', anchor: {kind: 'cut', id: 'C01', dt: 0.02}, status: 'needs-confirmation'}], hitsPerMinute: 6, speech: null, beats: [], cutsOnBeat: null},
  reviewQueue: ['X01'], limitations: [],
};

test('token estimate uses utf-8 bytes', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('سر'), 1);
});

test('layers give a small card, a map and one timeline line per shot', () => {
  const files = renderLayers(sample);
  assert.deepEqual(Object.keys(files).sort(), ['BREAKDOWN.md', 'look.md', 'picture.md', 'sound.md', 'text.md', 'timeline.md']);
  const card = files['BREAKDOWN.md'];
  assert.match(card, /^---\nreferenceId: ref-abc\n/u);
  assert.ok(estimateTokens(card.split('\n---\n')[0]) < 400);
  assert.match(card, /\| timeline\.md \| ~\d+ \|/u);
  const lines = files['timeline.md'].trim().split('\n').filter(l => l.startsWith('S'));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^S01 00:00\.00–00:04\.00 4s .*T01 «سر النجاح» pop/u);
  assert.match(lines[1], /^S02 .*jump cut.*zoom-in.*~X01 pop/u);
});

import {buildRecipe} from '../scripts/lib/breakdown-recipe.mjs';

const tiny = () => ({schema: 1, referenceId: 'ref-bbbbbbbbbbbb', source: {name: 'tiny.mp4', sha256: 'b'.repeat(64)}, durationSec: 4, aspect: '720x1280',
  pace: {cutCount: 0, cutsPerMinute: 0, shotLen: {min: 4, median: 4, max: 4}},
  shots: [{id: 'S01', start: 0, end: 4, len: 4, camera: {label: 'static', basis: 'measured', confidence: 'high', status: 'confirmed'}}],
  cuts: [], transitions: [], events: [], text: [], overlays: [],
  look: {label: 'natural', metrics: {meanLevel: 50}, basis: 'measured', confidence: 'medium', status: 'confirmed'},
  presenter: {share: 0.9, size: 'close', faceHeight: 0.35, spans: [{start: 0, end: 4}], perShot: [{shotId: 'S01', share: 0.9}], basis: 'measured', confidence: 'high', status: 'confirmed'},
  sound: {hasAudio: false, sfx: [], hitsPerMinute: null, bed: null, tempo: null, beats: [], cutsOnBeat: null, speech: null},
  limitations: ['The reference has no audio.'], reviewQueue: []});

test('studio-recipe.md is written only with a recipe and is listed on the card', () => {
  const b = tiny();
  assert.equal(renderLayers(b)['studio-recipe.md'], undefined);
  const files = renderLayers(b, {recipe: buildRecipe(b)});
  assert.match(files['studio-recipe.md'], /^# Studio recipe/m);
  assert.match(files['BREAKDOWN.md'], /\| studio-recipe\.md \| ~\d+ \| how to make it in Reel Studio \(suggestions\) \|/);
  assert.match(files['BREAKDOWN.md'], /presenterShare: 0\.9/);
  assert.match(files['picture.md'], /\| presenter \| 00:00/);
});
