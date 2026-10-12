import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {normalizeGraphicsSpec} from '../scripts/lib/graphics-project.mjs';
import {loadReviewProject} from '../scripts/lib/review-editor-project.mjs';
import {createJobManager} from '../scripts/lib/review-editor-jobs.mjs';
import {reviewManifest} from './helpers/review-manifest.mjs';

const GB = 1024 ** 3;

const graphics = id => normalizeGraphicsSpec({version: 1, id, style: 'paper-collage', fps: 30,
  reviewedBy: 'Approved illustrative copy', scenes: [{id: 'idea', family: 'intro', fromFrame: 0,
    durationInFrames: 90, layout: 'takeover', motion: 'quiet',
    data: {kicker: 'ILLUSTRATIVE', title: 'One clear idea', subtitle: 'Authored graphic copy', caption: 'Example'}}]},
{delivery: true});

const recording = id => {
  const manifest = reviewManifest(id);
  manifest.purpose = 'delivery';
  manifest.captions.status = 'reviewed';
  manifest.captions.reviewer = 'Recorded words reviewed';
  return manifest;
};

const screen = id => ({...recording(id), presenter: false, camera: []});

async function project(t, makeManifest, {motionPlan = false} = {}) {
  const id = `review-export-${randomUUID()}`;
  const manifest = makeManifest(id);
  const manifestPath = `Projects/${id}/edit.json`;
  const directory = path.join(ROOT, 'Projects', id);
  const captured = path.join(directory, 'export-args.json');
  const pipelineScript = path.join(directory, 'capture-export.mjs');
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(ROOT, manifestPath), JSON.stringify(manifest) + '\n');
  if (motionPlan) await writeFile(path.join(directory, 'motion-plan.json'), '{}\n');
  // The real job planner/launcher runs; only the expensive media pipeline is replaced.
  await writeFile(pipelineScript, `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(captured)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write(JSON.stringify({ok:false}));\n`);
  const manager = createJobManager({manifestPath, pipelineScript, freeBytes: () => 100 * GB, freeMem: () => 100 * GB});
  t.after(async () => {
    const deadline = Date.now() + 5000;
    while (manager.busy() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(manager.busy(), false, 'The argument-capture pipeline must finish before cleanup.');
    await manager.dispose();
    assert.equal(path.dirname(directory), path.join(ROOT, 'Projects'));
    await rm(directory, {recursive: true, force: true});
  });
  return {manifest, manifestPath, manager, captured};
}

async function captureArguments(file) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('The editor did not launch its media pipeline.');
}

for (const [mode, makeManifest] of [['graphics', graphics], ['screen-only', screen]]) {
  test(`the editor offers final export for reviewed ${mode} without a presenter motion plan`, async t => {
    const {manifestPath} = await project(t, makeManifest);
    const review = await loadReviewProject(manifestPath);
    assert.equal(review.hasMotionPlan, false);
    assert.equal(review.exportModes.find(item => item.id === 'deliver')?.available, true);
  });

  test(`the editor launches ${mode} delivery without presenter motion arguments`, async t => {
    const {manifestPath, manager, captured} = await project(t, makeManifest);
    const result = await manager.start('export', 'deliver');
    assert.ok(result.jobId);
    const args = await captureArguments(captured);
    assert.deepEqual(args.slice(0, 2), ['render', manifestPath]);
    assert.ok(args.includes('--deliver'));
    assert.ok(args.includes('--png'));
    assert.equal(args[args.indexOf('--crf') + 1], '10');
    assert.equal(args.includes('--motion-plan'), false);
    assert.equal(args.includes('--motion-crop'), false);
  });
}

test('a leftover motion plan is not passed to a source without a presenter', async t => {
  const {manager, captured} = await project(t, graphics, {motionPlan: true});
  await manager.start('export', 'deliver');
  assert.equal((await captureArguments(captured)).includes('--motion-plan'), false);
});

test('presenter delivery still requires a measured motion plan', async t => {
  const {manifestPath, manager} = await project(t, recording);
  assert.equal((await loadReviewProject(manifestPath)).exportModes.find(item => item.id === 'deliver')?.available, false);
  await assert.rejects(manager.start('export', 'deliver'), error => error.status === 422 && /motion-plan/.test(error.message));
});

test('presenter delivery still passes its measured motion plan to the pipeline', async t => {
  const {manifestPath, manager, captured} = await project(t, recording, {motionPlan: true});
  await manager.start('export', 'deliver');
  const args = await captureArguments(captured);
  assert.equal(args[args.indexOf('--motion-plan') + 1], `${path.posix.dirname(manifestPath)}/motion-plan.json`);
});

test('screen-only export still refuses an empty recording transcript', async t => {
  const {manager} = await project(t, id => {
    const manifest = screen(id);
    manifest.captions.words = [];
    return manifest;
  });
  await assert.rejects(manager.start('export', 'deliver'), error => error.status === 422 && error.extra?.issues?.some(issue => issue.code === 'delivery:captions-empty'));
});

test('graphics export still requires delivery purpose', async t => {
  const {manager} = await project(t, id => ({...graphics(id), purpose: 'test'}));
  await assert.rejects(manager.start('export', 'deliver'), error => error.status === 422 && error.extra?.issues?.some(issue => issue.code === 'delivery:purpose'));
});
