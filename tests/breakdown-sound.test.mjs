// tests/breakdown-sound.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {inspectBreakdownRuntime, runtimeTestSkip} from '../scripts/lib/breakdown-runtime.mjs';
import {FIXTURE_TRUTH, synthAudio} from '../scripts/lib/breakdown-fixture.mjs';
import {run} from '../scripts/lib/media.mjs';
import {runAnalyser} from '../scripts/lib/breakdown-python.mjs';

const readiness = await inspectBreakdownRuntime();
const skip = runtimeTestSkip(readiness);

test('sound finds the bed, 120 BPM and the three off-beat effects with their types', {skip, timeout: 300000}, async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-sound-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  await fsp.writeFile(path.join(dir, 'a48.wav'), synthAudio(FIXTURE_TRUTH.durationSec));
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(dir, 'a48.wav'), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', path.join(dir, 'a16.wav')]);
  const {sound} = await runAnalyser('sound', {wav: path.join(dir, 'a16.wav'), speech: [], cuts: FIXTURE_TRUTH.cuts.map(c => c.t), anchors: []}, {workDir: dir});
  assert.equal(sound.bed.present, FIXTURE_TRUTH.sound.bed);
  assert.ok(Math.abs(sound.tempo.bpm - 120) / 120 <= 0.04, String(sound.tempo.bpm));
  for (const truth of FIXTURE_TRUTH.sound.sfx) {
    const hit = sound.sfx.find(x => Math.abs(x.t - truth.t) <= 0.15);
    assert.ok(hit, `${truth.type} at ${truth.t} missing: ${JSON.stringify(sound.sfx.map(x => [x.t, x.type]))}`);
    assert.equal(hit.type, truth.type, JSON.stringify(sound.sfx));
  }
  assert.equal(sound.sfx.length, FIXTURE_TRUTH.sound.sfx.length, JSON.stringify(sound.sfx.map(x => x.t)));
});
