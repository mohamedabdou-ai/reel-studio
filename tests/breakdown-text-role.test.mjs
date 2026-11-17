import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeBreakdown} from '../scripts/lib/breakdown-merge.mjs';
import {buildRecipe} from '../scripts/lib/breakdown-recipe.mjs';
import {buildDna, deriveTraits} from '../scripts/lib/breakdown-dna.mjs';

// Generated measurements only: no third-party media, OCR words or frames.
const measured = {basis: 'measured', confidence: 'high', status: 'confirmed'};
function input() {
  const durationSec = 24;
  return {
    prepare: {referenceId: 'ref-dddddddddddd', source: {name: 'synthetic.mp4', sha256: 'd'.repeat(64)},
      probe: {durationSec, width: 640, height: 960, hasAudio: true}},
    shots: {durationSec, cuts: Array.from({length: 7}, (_, i) => ({t: (i + 1) * 3, kind: 'cut', score: .9})), transitions: [],
      shots: Array.from({length: 8}, (_, i) => ({id: `S${String(i + 1).padStart(2, '0')}`, start: i * 3, end: (i + 1) * 3, len: 3}))},
    camera: {camera: []}, overlays: {overlays: []}, look: {look: {label: 'natural', metrics: {}, score: .9}}, sound: null,
    text: {text: [{text: 'Synthetic cue', start: 1, end: 2, kind: 'caption', zone: 'bottom', sizePct: .04,
      box: [.1, .7, .7, .06], style: {fill: '#ffffff'}, entrance: 'cut', exit: 'cut', score: .99}]}, captions: null,
  };
}

test('a generated static list with stepping emphasis and no speech survives merge, recipe and DNA', () => {
  const p = input(), cue = p.text.text[0];
  Object.assign(cue, {text: Array.from({length: 6}, (_, i) => `Item ${i + 1}`).join('\n'), start: .5, end: 20, zone: 'middle',
    events: Array.from({length: 5}, (_, i) => ({t: 2 + i * 3, kind: 'highlight-change', lineIndex: i + 1, score: .9}))});
  const b = mergeBreakdown(p), r = buildRecipe(b), dna = buildDna([{breakdown: b, recipe: r}]);
  assert.equal(b.text[0].kind, 'label');
  assert.equal(b.text[0].basis, 'measured');
  assert.equal(r.features.list, 'yes');
  assert.equal(r.features.measures.numberedLines, 0, 'list detection must not depend on OCR prefixes');
  assert.equal(r.features.measures.highlightSteps, 5);
  assert.equal(r.features.captions, 'no');
  assert.equal(r.captions.present, false);
  assert.ok(dna.observedInvariants.some(t => t.key === 'text.highlight-steps'));
  assert.ok(!dna.uncertainTraits.some(t => t.key === 'captions.look'));
});

test('static blocks are labels by long persistence, multiple shot boundaries, or emphasis alone', () => {
  for (const change of [{start: 1, end: 22}, {start: 1, end: 11},
    {events: [{t: 1.5, kind: 'highlight-change', lineIndex: 1, score: .8}]}]) {
    const p = input(); Object.assign(p.text.text[0], change);
    assert.equal(mergeBreakdown(p).text[0].kind, 'label', JSON.stringify(change));
  }
  const p = input(); p.prepare.probe.hasAudio = false;
  assert.equal(mergeBreakdown(p).text[0].kind, 'label');
  p.prepare.probe.hasAudio = true; p.captions = [];
  assert.equal(mergeBreakdown(p).text[0].kind, 'label');
});

test('short caption candidates need matching timed speech or remain explicitly uncertain', () => {
  for (const captions of [null, [{text: 'Unrelated words', startMs: 1000, endMs: 2000}],
    [{text: 'Synthetic cue', startMs: 4000, endMs: 5000}]]) {
    const b = mergeBreakdown({...input(), captions}), t = b.text[0], r = buildRecipe(b);
    assert.equal(t.kind, 'caption');
    assert.equal(t.confidence, 'low');
    assert.equal(t.status, 'needs-confirmation');
    assert.equal(t.basis, 'measured');
    assert.ok(b.reviewQueue.includes(t.id));
    assert.equal(r.features.captions, 'unknown');
    assert.equal(r.captions.pending, 1);
    const dna = buildDna([{breakdown: b, recipe: r}]);
    assert.ok(dna.uncertainTraits.some(t => t.key === 'captions.look'));
  }
  const b = mergeBreakdown({...input(), captions: [{text: 'Synthetic cue!', startMs: 1000, endMs: 2000}]});
  assert.equal(b.text[0].kind, 'caption');
  assert.equal(b.text[0].status, 'confirmed');
  assert.equal(buildRecipe(b).features.captions, 'yes');
});

test('scene text inside generated clips cannot change editorial text traits or recipe features', () => {
  const p = input(); p.text.text[0].kind = 'title';
  const base = mergeBreakdown(p), original = buildRecipe(base);
  p.text.text.push(...Array.from({length: 12}, (_, i) => ({...p.text.text[0], text: 'Footage word',
    start: i, end: i + 1, kind: 'scene-text', zone: 'top', entrance: 'pop', style: {fill: '#ff0000'},
    events: [{t: i + .5, kind: 'highlight-change', lineIndex: 1, score: .9}]})));
  const b = mergeBreakdown(p), recipe = buildRecipe(b);
  assert.equal(b.text.filter(t => t.kind === 'scene-text').length, 12, 'keep footage text in the breakdown');
  assert.deepEqual(recipe.features, original.features);
  assert.deepEqual(recipe.captions, original.captions);
  const editorialTraits = (b, r) => deriveTraits(b, r).filter(t => /^(text\.|captions\.)/.test(t.key));
  assert.deepEqual(editorialTraits(b, recipe), editorialTraits(base, original));
  const onlyScene = {...b, text: b.text.filter(t => t.kind === 'scene-text')};
  assert.equal(buildRecipe(onlyScene).features.measures.textCoverage, 0);
  assert.equal(buildRecipe(onlyScene).features.list, 'no');
});

test('highlight steps on any non-scene kind count, and other text events do not', () => {
  for (const kind of ['caption', 'title', 'label']) {
    const b = mergeBreakdown(input());
    b.text = [{...b.text[0], kind, events: Array.from({length: 3}, (_, i) =>
      ({id: `step-${i}`, t: 1 + i / 10, kind: 'highlight-change', ...measured}))}];
    const r = buildRecipe(b);
    assert.equal(r.features.list, 'yes', kind);
    assert.ok(deriveTraits(b, r).some(t => t.key === 'text.highlight-steps'), kind);
    b.text[0].events.forEach(e => { e.kind = 'other'; });
    assert.equal(buildRecipe(b).features.list, 'no');
    assert.ok(!deriveTraits(b, buildRecipe(b)).some(t => t.key === 'text.highlight-steps'));
  }
});
