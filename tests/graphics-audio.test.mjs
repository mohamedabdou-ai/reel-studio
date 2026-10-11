import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../scripts/lib/mix-contract.mjs';

const paths = {video: 'Projects/audio-test/base.mp4', sfx: 'Projects/audio-test/sounds.wav', out: 'Projects/audio-test/result.mp4'};
const silent = {mean: -91, max: -91, silent: true, peakDb: null};
const audible = {mean: -24, max: -16, silent: false, peakDb: -16};

test('graphics audio requires an explicit mode and forbids speech cleanup', () => {
  assert.equal(policy.normalizeMixOptions(paths).graphicsAudio, false);
  assert.equal(policy.normalizeMixOptions({...paths, 'graphics-audio': true}).graphicsAudio, true);
  for (const voice of ['clean', 'denoise']) assert.throws(() => policy.normalizeMixOptions({...paths, 'graphics-audio': true, voice}), /graphics|cleanup/i);
});

test('graphics effects can be mastered over digital silence without a fake voice gain', () => {
  const mixed = policy.chooseGraphicsSfx(silent, audible);
  assert.equal(mixed.status, 'mixed');
  assert.equal(mixed.gain, 1);
  assert.equal(mixed.expectedSilence, false);
  for (const effects of [null, silent]) assert.equal(policy.chooseGraphicsSfx(silent, effects).expectedSilence, true);
  assert.throws(() => policy.chooseGraphicsSfx(audible, audible), /silent|silence/i);
  assert.throws(() => policy.chooseMixSfxGain(silent, audible, 5), /voice|primary/i);
});

test('graphics silence reports no invented loudness or true peak and still verifies duration', () => {
  const result = policy.assessGraphicsSilence(silent, 3, 3);
  assert.equal(result.ok, true);
  assert.equal(result.delivered.LUFS, null);
  assert.equal(result.delivered.truePeakDb, null);
  assert.equal(result.delivered.digitalPeak, '-inf');
  assert.equal(policy.assessGraphicsSilence(audible, 3, 3).ok, false);
  assert.equal(policy.assessGraphicsSilence(silent, 2, 3).ok, false);
  assert.equal(policy.assessGraphicsSilence(silent, 19.99, 20).ok, false, 'missing audio coverage must not pass as encoder padding');
});

test('render accepts the graphics audio flag only for verified graphics props', () => {
  assert.equal(policy.resolveRenderAudioMode({composition: 'PreparedEdit', edit: {contentMode: 'graphics'}, graphicsAudio: true, voice: 'off'}), 'graphics');
  assert.equal(policy.resolveRenderAudioMode({composition: 'PreparedEdit', edit: {}, voice: 'off'}), 'dialogue');
  assert.throws(() => policy.resolveRenderAudioMode({composition: 'PreparedEdit', edit: {}, graphicsAudio: true, voice: 'off'}), /graphics/i);
  assert.throws(() => policy.resolveRenderAudioMode({composition: 'Doctor', edit: {contentMode: 'graphics'}, graphicsAudio: true, voice: 'off'}), /graphics/i);
  assert.throws(() => policy.resolveRenderAudioMode({composition: 'PreparedEdit', edit: {contentMode: 'graphics'}, graphicsAudio: true, voice: 'clean'}), /cleanup|voice/i);
});
