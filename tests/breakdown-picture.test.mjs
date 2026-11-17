// tests/breakdown-picture.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {inspectBreakdownRuntime, runtimeTestSkip} from '../scripts/lib/breakdown-runtime.mjs';
import {buildSyntheticReel, FIXTURE_TRUTH} from '../scripts/lib/breakdown-fixture.mjs';
import {prepareReference} from '../scripts/lib/breakdown-prepare.mjs';
import {runAnalyser} from '../scripts/lib/breakdown-python.mjs';

const readiness = await inspectBreakdownRuntime();
const skip = runtimeTestSkip(readiness) ? runtimeTestSkip(readiness)
  : !fs.existsSync('C:/Windows/Fonts/arial.ttf') ? 'Arial is not installed' : false;

let shared;
async function fixture(t) {
  if (shared) return shared;
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-picture-'));
  const slug = `breakdown-test-${path.basename(dir).slice(-6).toLowerCase()}`;
  t.after(async () => { await fsp.rm(dir, {recursive: true, force: true}); await fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}); shared = null; });
  const {video} = await buildSyntheticReel(dir);
  const prepared = await prepareReference({reference: video, project: slug});
  const shots = await runAnalyser('shots', {proxy: prepared.proxy.path}, {workDir: prepared.workDir});
  shared = {prepared, shots};
  return shared;
}

test('shots finds every hard cut within two frames and names the jump cut', {skip, timeout: 300000}, async t => {
  const {shots} = await fixture(t);
  for (const truth of FIXTURE_TRUTH.cuts) {
    const found = shots.cuts.find(c => Math.abs(c.t - truth.t) <= 2 / 30 + 1e-6);
    assert.ok(found, `cut at ${truth.t} missing: ${JSON.stringify(shots.cuts)}`);
    assert.equal(found.kind, truth.kind, `cut at ${truth.t}`);
  }
  assert.equal(shots.cuts.length, FIXTURE_TRUTH.cuts.length, JSON.stringify(shots.cuts));
});

test('shots finds the dissolve and the slide', {skip, timeout: 300000}, async t => {
  const {shots} = await fixture(t);
  for (const truth of FIXTURE_TRUTH.transitions) {
    const centre = (truth.start + truth.end) / 2;
    const found = shots.transitions.find(r => Math.abs((r.start + r.end) / 2 - centre) <= 0.25);
    assert.ok(found, `transition ${truth.kind} missing: ${JSON.stringify(shots.transitions)}`);
    assert.equal(found.kind, truth.kind);
    assert.equal(found.direction, truth.direction);
  }
});

test('camera labels the zoompan shot as a zoom-in', {skip, timeout: 300000}, async t => {
  const {prepared, shots} = await fixture(t);
  const camera = await runAnalyser('camera', {proxy: prepared.proxy.path, shots: shots.shots}, {workDir: prepared.workDir});
  const truth = FIXTURE_TRUTH.camera[0];
  const shot = shots.shots.find(s => s.start <= truth.start + 0.1 && s.end >= truth.end - 0.1);
  assert.ok(shot, JSON.stringify(shots.shots));
  assert.equal(camera.camera.find(c => c.shotId === shot.id).label, truth.label);
});
