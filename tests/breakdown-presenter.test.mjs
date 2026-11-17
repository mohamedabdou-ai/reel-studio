import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {summarisePresenter, measurePresenter, sizeLabel} from '../scripts/lib/breakdown-presenter.mjs';

const face = (score = 0.92, height = 0.34) => ({x: 0.3, y: 0.2, width: 0.25, height, score, model: 'blazeface-short-range-float16-v1'});
const samples = Array.from({length: 8}, (_, i) => ({timeSec: i / 2, faces: i < 4 ? [face()] : []}));
const shots = [{id: 'S01', start: 0, end: 2}, {id: 'S02', start: 2, end: 4}];

test('share, size, spans and per-shot share come from the sampled faces', () => {
  const p = summarisePresenter(samples, {shots, durationSec: 4});
  assert.equal(p.samples, 8);
  assert.equal(p.share, 0.5);
  assert.equal(p.size, 'close');
  assert.equal(p.faceHeight, 0.34);
  assert.deepEqual(p.spans, [{start: 0, end: 2}]);
  assert.deepEqual(p.perShot, [{shotId: 'S01', share: 1}, {shotId: 'S02', share: 0}]);
  assert.equal(p.basis, 'measured');
  assert.equal(p.status, 'confirmed');
});

test('weak detections and empty footage are honest', () => {
  const none = summarisePresenter(samples.map(s => ({...s, faces: []})), {shots, durationSec: 4});
  assert.equal(none.share, 0);
  assert.equal(none.size, 'none');
  assert.equal(none.faceHeight, null);
  assert.deepEqual(none.spans, []);
  const weak = summarisePresenter(samples.map(s => ({...s, faces: s.faces.map(() => face(0.6))})), {shots, durationSec: 4});
  assert.equal(weak.status, 'needs-confirmation');
  assert.match(weak.confirmHow, /real person/);
  const few = summarisePresenter(samples.slice(0, 3), {shots, durationSec: 4});
  assert.equal(few.status, 'needs-confirmation');
  assert.equal(sizeLabel(0.2), 'medium');
  assert.equal(sizeLabel(0.1), 'wide');
  assert.equal(sizeLabel(null), 'none');
  assert.throws(() => summarisePresenter([], {durationSec: 4}), /face samples/);
});

test('the measurement passes a studio-relative proxy and never throws', async () => {
  const proxy = path.join(ROOT, 'Projects', 'x', 'style-analysis', 'ref-000000000000', 'work', 'proxy.mp4');
  let seen;
  const ok = await measurePresenter({proxy, shots, durationSec: 4, analyze: async args => { seen = args; return {samples}; }});
  assert.equal(seen.source, 'Projects/x/style-analysis/ref-000000000000/work/proxy.mp4');
  assert.equal(seen.sampleFps, 2);
  assert.equal(ok.presenter.share, 0.5);
  assert.equal(ok.limitation, null);
  const missing = await measurePresenter({proxy, shots, durationSec: 4, analyze: async () => { throw new Error('Local face model blazeface-short-range-float16-v1 missing; run node scripts/reframe.mjs install'); }});
  assert.equal(missing.presenter, null);
  assert.match(missing.limitation, /not installed/);
  assert.match(missing.limitation, /yes/);
  const broken = await measurePresenter({proxy, shots, durationSec: 4, analyze: async () => { throw new Error('browser failed'); }});
  assert.match(broken.limitation, /browser failed/);
});

test('multiface samples, sparse spans and shots without samples retain their measurements', () => {
  const rows = [{timeSec: 0, faces: [face(), face(.95, .2)]}, {timeSec: .5, faces: []}, {timeSec: 1, faces: [face()]}];
  const p = summarisePresenter(rows, {durationSec: 3, shots: [{id: 'S01', start: 2, end: 3}]});
  assert.equal(p.share, .667);
  assert.equal(p.multiFaceShare, .333);
  assert.deepEqual(p.spans, [{start: 0, end: .5}, {start: 1, end: 1.5}]);
  assert.deepEqual(p.perShot, [{shotId: 'S01', share: null}]);
});

test('invalid sampling data cannot produce a confident absence claim', async () => {
  for (const rows of [[{timeSec: NaN, faces: []}], [{timeSec: -1, faces: []}], [{timeSec: 4, faces: []}], [samples[0], samples[0]]]) {
    assert.throws(() => summarisePresenter(rows, {durationSec: 4}), /timestamp/);
  }
  assert.throws(() => summarisePresenter(samples, {durationSec: 4, sampleFps: 0}), /sample rate/);
  const result = await measurePresenter({proxy: path.join(ROOT, 'Projects/x/proxy.mp4'), durationSec: 4, analyze: async () => ({samples: [{faces: []}]})});
  assert.equal(result.presenter, null);
  assert.match(result.limitation, /timestamp/);
  let called = false;
  const external = await measurePresenter({proxy: path.resolve(ROOT, '../outside.mp4'), durationSec: 4, analyze: async () => { called = true; }});
  assert.equal(called, false);
  assert.match(external.limitation, /inside the studio/);
});
