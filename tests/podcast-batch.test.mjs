import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizePodcastWords, proposePodcastCandidates, validatePodcastSelections, rebasePodcastClip, podcastClipProjectId} from '../scripts/lib/podcast-batch.mjs';

const words = [
  {text: 'أول', startMs: 1000, endMs: 1300},
  {text: 'مقطع.', startMs: 1500, endMs: 1900},
  {text: 'تجربة', startMs: 630000, endMs: 630300},
  {text: 'شرح', startMs: 630500, endMs: 630900},
  {text: 'واضح', startMs: 631200, endMs: 631800},
  {text: 'سلام', startMs: 633000, endMs: 633700},
];
const source = {path: 'Raw/podcast.mp4', sha256: 'a'.repeat(64), durationSec: 700, fps: 30};
const selection = JSON.parse(await readFile(new URL('./fixtures/podcast-selection.json', import.meta.url), 'utf8'));

test('local proposals quote reviewed words and include windows after ten minutes without approving cuts', () => {
  const result = proposePodcastCandidates(words, {durationSec: 700, fps: 30, minSec: 1, maxSec: 5, gapSec: 2});
  assert.equal(result.method, 'transcript-boundaries-v1');
  assert.equal(result.selectionApproved, false);
  const late = result.candidates.find(c => c.fromSec >= 630);
  assert.ok(late, 'late recording window must be proposed');
  assert.equal(late.text, 'تجربة شرح واضح سلام');
  assert.deepEqual(late.wordIndices, [2, 3, 4, 5]);
  assert.equal(late.toSec, 633.7);
});

test('selected late window rebases exact recorded words and authored beats in order', () => {
  const accepted = validatePodcastSelections(selection, {source, words, batchId: 'podcast-demo'});
  const result = rebasePodcastClip(accepted.clips[0], words);
  assert.deepEqual(result.words.map(w => w.text), ['تجربة', 'شرح', 'واضح', 'سلام']);
  assert.deepEqual(result.wordIndices, [2, 3, 4, 5]);
  assert.deepEqual(result.words.map(w => [w.startMs, w.endMs]), [[0, 300], [500, 900], [1200, 1800], [3000, 3700]]);
  assert.deepEqual(result.editor.beats.map(b => [b.fromSec, b.toSec]), [[0, 2]]);
  assert.equal(result.signoffFromSec, undefined);
  assert.deepEqual(words[2], {text: 'تجربة', startMs: 630000, endMs: 630300});
});

test('approval, word boundaries, source bounds, ordering and duplicate selection IDs are enforced', () => {
  const context = {source, words, batchId: 'podcast-demo'};
  assert.throws(() => validatePodcastSelections({...selection, selectionApproved: false}, context), /approved/i);
  assert.throws(() => validatePodcastSelections({...selection, approvedBy: ''}, context), /approver/i);
  const change = patch => ({...selection, clips: [{...selection.clips[0], ...patch}]});
  assert.throws(() => validatePodcastSelections(change({fromSec: 630.1}), context), /word/i);
  assert.throws(() => validatePodcastSelections(change({toSec: 701}), context), /duration|bounds/i);
  assert.throws(() => validatePodcastSelections(change({fromSec: 0, toSec: 650}), context), /600|ten minutes/i);
  assert.throws(() => validatePodcastSelections(change({id: '../escape'}), context), /slug|path/i);
  assert.throws(() => validatePodcastSelections(change({id: 'con'}), context), /unsafe/i);
  assert.throws(() => validatePodcastSelections({...selection, clips: [selection.clips[0], {...selection.clips[0], id: 'other'}]}, context), /overlap|ordered/i);
  assert.throws(() => validatePodcastSelections({...selection, clips: [selection.clips[0], selection.clips[0]]}, context), /unique/i);
  assert.throws(() => validatePodcastSelections(change({signoff: undefined}), context), /signoff/i);
});

test('recorded signoff is explicitly rebased and cannot omit later reviewed speech', () => {
  const clip = {...selection.clips[0], signoff: {mode: 'recorded', text: 'سلام', fromSec: 633}};
  const accepted = validatePodcastSelections({...selection, clips: [clip]}, {source, words, batchId: 'podcast-demo'});
  assert.equal(rebasePodcastClip(accepted.clips[0], words).signoffFromSec, 3);
  assert.throws(() => validatePodcastSelections({...selection, clips: [{...clip, signoff: {...clip.signoff, text: 'مع السلامة'}}]}, {source, words, batchId: 'podcast-demo'}), /recorded|signoff/i);
});

test('UTF-8 words stay exact and malformed transcript timestamps are refused', () => {
  assert.deepEqual(normalizePodcastWords({words})[2], {...words[2], confidence: null});
  assert.throws(() => normalizePodcastWords([{text: 'خطأ', startMs: 2, endMs: 1}]), /timestamp/i);
  assert.throws(() => normalizePodcastWords([words[2], words[0]]), /ordered/i);
  assert.throws(() => normalizePodcastWords([{text: '  ', startMs: 0, endMs: 1}]), /text/i);
});

test('long names have deterministic collision-safe project IDs without path escape', () => {
  const a = podcastClipProjectId('a'.repeat(64), 'b'.repeat(64));
  const b = podcastClipProjectId('a'.repeat(64), `${'b'.repeat(63)}c`);
  assert.ok(a.length <= 64);
  assert.notEqual(a, b);
  assert.equal(a, podcastClipProjectId('a'.repeat(64), 'b'.repeat(64)));
  assert.throws(() => podcastClipProjectId('demo', 'nul'), /unsafe/i);
  assert.notEqual(podcastClipProjectId('a--b', 'c'), podcastClipProjectId('a', 'b--c'), 'embedded delimiters must not alias different batches');
});
