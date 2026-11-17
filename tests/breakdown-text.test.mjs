// tests/breakdown-text.test.mjs
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {inspectBreakdownRuntime, runtimeTestSkip, loadPins, modelPaths} from '../scripts/lib/breakdown-runtime.mjs';
import {buildSyntheticReel, FIXTURE_TRUTH} from '../scripts/lib/breakdown-fixture.mjs';
import {prepareReference} from '../scripts/lib/breakdown-prepare.mjs';
import {runAnalyser} from '../scripts/lib/breakdown-python.mjs';
import {charErrorRate} from '../scripts/lib/breakdown-score.mjs';

const readiness = await inspectBreakdownRuntime();
const skip = runtimeTestSkip(readiness) ? runtimeTestSkip(readiness)
  : !fs.existsSync('C:/Windows/Fonts/arial.ttf') ? 'Arial is not installed' : false;

test('text reads both Arabic cues with timing, style and entrance', {skip, timeout: 600000}, async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-text-'));
  const slug = `breakdown-test-${path.basename(dir).slice(-6).toLowerCase()}`;
  t.after(async () => { await fsp.rm(dir, {recursive: true, force: true}); await fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}); });
  const {video} = await buildSyntheticReel(dir);
  const prepared = await prepareReference({reference: video, project: slug});
  const result = await runAnalyser('text', {proxy: prepared.proxy.path, models: modelPaths(), visualOrder: loadPins().ocr.visualOrder}, {workDir: prepared.workDir});
  for (const truth of FIXTURE_TRUTH.text) {
    const cue = result.text.find(c => Math.abs(c.start - truth.start) <= 0.5);
    assert.ok(cue, `cue ${truth.text} missing: ${JSON.stringify(result.text)}`);
    assert.ok(charErrorRate(truth.text, cue.text) <= 0.1, `${truth.text} read as ${cue.text}`);
    assert.ok(Math.abs(cue.start - truth.start) <= 0.15 && Math.abs(cue.end - truth.end) <= 0.15, JSON.stringify(cue));
    assert.equal(cue.zone, truth.zone);
    assert.equal(cue.entrance, truth.entrance);
  }
});
