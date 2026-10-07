import test from 'node:test';
import assert from 'node:assert/strict';
import {fittingCaptionCue} from '../engine/src/prepared-edit/caption-fit.ts';

const spoken = 'اختياراتك الشخصية بتساعد المونتاج يوصل فكرتك بوضوح لكل جمهورك'.split(' ');
const cue = {fromFrame: 0, toFrame: 90, words: spoken.map((text, sourceIndex) => ({text, sourceIndex, segmentIndex: 0, fromFrame: sourceIndex * 10, toFrame: sourceIndex * 10 + 9, startMs: sourceIndex * 1000 / 3, endMs: sourceIndex * 1000 / 3 + 300, confidence: 1}))};

test('a realistic long clause is partitioned without dropping, repeating or reordering speech', () => {
  const fits = text => text.length <= 42;
  const groups = new Map();
  for (let frame = 0; frame < 90; frame++) {
    const current = fittingCaptionCue(cue, frame, fits);
    assert.ok(fits(current.words.map(word => word.text).join(' ')));
    assert.ok(current.fromFrame <= frame && current.toFrame > frame);
    groups.set(current.fromFrame, current);
  }
  assert.deepEqual([...groups.values()].flatMap(group => group.words), cue.words);
  const list = [...groups.values()];
  for (let i = 0; i < list.length - 1; i++) assert.equal(list[i].toFrame, list[i + 1].fromFrame);
  assert.equal(list.at(-1).toFrame, cue.toFrame);
});

test('a fitting cue keeps its exact original grouping and timing', () => {
  assert.equal(fittingCaptionCue(cue, 10, () => true), cue);
});

test('an unfit individual timestamped token is refused rather than rewriting it', () => {
  assert.throws(() => fittingCaptionCue(cue, 10, () => false), /اختياراتك/);
});

test('word timestamps rounding onto one frame cannot silently hide a split chunk', () => {
  const collapsed = {fromFrame: 0, toFrame: 48, words: [
    {...cue.words[0], text: 'ا'.repeat(35), fromFrame: 0, toFrame: 1, startMs: 0, endMs: 10},
    {...cue.words[1], text: 'ب'.repeat(35), fromFrame: 0, toFrame: 1, startMs: 10, endMs: 20},
  ]};
  assert.throws(() => fittingCaptionCue(collapsed, 0, text => text.length <= 40), /Caption timing collapses/);
});
