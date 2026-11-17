// tests/breakdown-fixture.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {ffprobeJson, summarizeProbe} from '../scripts/lib/media.mjs';
import {FIXTURE_TRUTH, synthAudio, buildSyntheticReel} from '../scripts/lib/breakdown-fixture.mjs';

const fontSkip = fs.existsSync('C:/Windows/Fonts/arial.ttf') ? false : 'Arial is not installed';

test('synthetic audio is a mono 16-bit WAV of the right length', () => {
  const wav = synthAudio(2, 48000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt32LE(40), 2 * 48000 * 2);
});

test('synthetic reel matches its truth duration and size', {skip: fontSkip, timeout: 180000}, async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-fixture-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const {video, truthFile} = await buildSyntheticReel(dir);
  const probe = summarizeProbe(video, await ffprobeJson(video));
  assert.equal(probe.width, 540);
  assert.equal(probe.height, 960);
  assert.ok(Math.abs(probe.durationSec - FIXTURE_TRUTH.durationSec) < 0.1, String(probe.durationSec));
  assert.ok(probe.hasAudio);
  assert.deepEqual(JSON.parse(await fsp.readFile(truthFile, 'utf8')), FIXTURE_TRUTH);
});

import {createHash} from 'node:crypto';
import {SYNTH_VARIANTS, offBeat, truthFor} from '../scripts/lib/breakdown-fixture.mjs';

const PINNED_AUDIO_SHA256 = '183735b0d0255bbce590b09a92bdcb53a939ce2d3446d6d5d09a7b9fd27e861d';
test('the default variant reproduces the original fixture exactly', () => {
  assert.deepEqual(truthFor(SYNTH_VARIANTS[0]), FIXTURE_TRUTH);
  assert.equal(createHash('sha256').update(synthAudio(14.6)).digest('hex'), PINNED_AUDIO_SHA256);
  assert.equal(createHash('sha256').update(synthAudio(14.6, 48000, SYNTH_VARIANTS[0])).digest('hex'), PINNED_AUDIO_SHA256);
});

test('variants cover the tempo range with and without a bed and keep effects off the beat', () => {
  assert.deepEqual(SYNTH_VARIANTS.map(v => v.bpm), [120, 72, 96, 140, 160, 174]);
  assert.deepEqual(SYNTH_VARIANTS.map(v => v.bed), [true, true, false, true, false, true]);
  for (const v of SYNTH_VARIANTS) for (const s of v.sfx) {
    const phase = (s.t * v.bpm / 60) % 1;
    assert.ok(Math.abs(phase - 0.5) < 0.01, `${v.name} ${s.t}`);
    assert.ok(s.t > 0.5 && s.t < 14);
  }
  assert.equal(offBeat(3.25, 120), 3.25);
  assert.equal(new Set(SYNTH_VARIANTS.flatMap(v => v.texts)).size, 12);
});
