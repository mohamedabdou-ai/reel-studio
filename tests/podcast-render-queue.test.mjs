import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT, atomicJson, digest, fileSnapshot, readJson} from '../scripts/lib/job-paths.mjs';
import {assertProjectOutput} from '../scripts/lib/project-paths.mjs';
import {podcastClipProjectId, renderPodcastBatch, podcastBatchStatus} from '../scripts/lib/podcast-batch.mjs';

test('sequential queue checkpoints each clip, resumes a failure and refuses stale output/QC collisions', async () => {
  const id = `podcast-queue-${randomUUID().slice(0, 8)}`, base = `Projects/${id}`;
  const clips = ['first', 'second'].map((clipId, i) => ({id: clipId, projectId: podcastClipProjectId(id, clipId), fromSec: i * 4, toSec: i * 4 + 3,
    signoff: {mode: 'none'}, editor: {purpose: 'story', tone: 'calm', beats: [{id: 'quote', fromSec: i * 4, toSec: i * 4 + 1,
      intent: 'intro', data: {kicker: 'تجربة', title: 'شرح', subtitle: 'واضح', caption: 'تجربة شرح واضح'}}]}}));
  try {
    await fs.mkdir(path.join(ROOT, base), {recursive: true});
    // Queue tests mock the renderer only. These bytes are not claimed as real media.
    await fs.writeFile(path.join(ROOT, base, 'source.mp4'), 'queue source fixture', 'utf8');
    const words = [{text: 'أول', startMs: 0, endMs: 500}, {text: 'ثاني', startMs: 4000, endMs: 4500}];
    await atomicJson(`${base}/words.json`, {words}, {project: id});
    const inputs = await Promise.all([`${base}/source.mp4`, `${base}/words.json`].map(p => fileSnapshot(p)));
    const batchFile = `${base}/podcast/batch.json`;
    const batch = {version: 1, id, source: {path: inputs[0].path, sha256: inputs[0].sha256, durationSec: 8, fps: 30}, transcript: inputs[1].path,
      transcriptReview: {reviewedBy: 'Fixture reviewer'}, inputs, proposals: {candidates: []}, selections: {version: 1, selectionApproved: true, approvedBy: 'Fixture reviewer', clips}, clipStates: {}};
    for (const clip of clips) {
      const manifest = {version: 1, id: clip.projectId, purpose: 'test', style: 'section-deck',
        creator: {displayName: 'Queue fixture', handle: null, ending: {cta: null, followCard: false, signOff: null}},
        source: {path: inputs[0].path, sha256: inputs[0].sha256, fps: 30, width: 64, height: 64, totalFrames: 90},
        segments: [{fromFrame: 0, toFrame: 90}], captions: {status: 'reviewed', reviewer: 'Fixture reviewer', words: [{text: clip.id === 'first' ? 'أول' : 'ثاني', startMs: 0, endMs: 500, confidence: null}]}, scenes: [], sounds: [], camera: []};
      const manifestPath = `Projects/${clip.projectId}/edit.json`;
      await atomicJson(manifestPath, manifest, {project: clip.projectId});
      await atomicJson(`Projects/${clip.projectId}/source/intake.json`, {edit: inputs[0].path}, {project: clip.projectId});
      batch.clipStates[clip.id] = {manifest: manifestPath, status: 'prepared'};
    }
    await atomicJson(batchFile, batch, {project: id});
    const optionsFile = `${base}/render-options.json`;
    await atomicJson(optionsFile, Object.fromEntries(clips.map(c => [c.id, {chunkFrames: 60, chunkJobs: 1, intentionalBlack: '0-0'}])), {project: id});
    const assetPath = `${base}/scene-asset.png`;
    await fs.writeFile(path.join(ROOT, assetPath), 'mock-asset-v1', 'utf8');
    const preparer = async manifestPath => {
      const manifest = await readJson(manifestPath), preparedBase = `Projects/${manifest.id}/prepared`;
      const propsFile = `${preparedBase}/props.json`, sfxFile = `${preparedBase}/sounds.wav`, plate = `${preparedBase}/plate.mp4`;
      await fs.mkdir(path.join(ROOT, preparedBase), {recursive: true});
      for (const file of [sfxFile, plate]) if (!(await fs.stat(path.join(ROOT, file)).catch(() => null))) await fs.writeFile(path.join(ROOT, file), `mock-${path.basename(file)}`, 'utf8');
      await atomicJson(propsFile, {edit: manifest, assets: [await fileSnapshot(assetPath)]}, {project: manifest.id});
      return {propsFile, sfxFile, plate};
    };
    const dependencies = {renderEditorManifest: undefined, prepareEditorManifest: preparer, verifyPreparedProps: async props => props};
    const started = [], finished = [];
    let active = 0, maxActive = 0, failSecond = true;
    const renderer = async (manifestPath, options) => {
      const manifest = await readJson(manifestPath), clipId = clips.find(c => c.projectId === manifest.id).id;
      assert.equal(options.chunkFrames, 60);
      assert.equal(options.chunkJobs, 1);
      assert.equal(options.intentionalBlack, '0-0');
      started.push(clipId); active++; maxActive = Math.max(maxActive, active);
      try {
        await new Promise(resolve => setTimeout(resolve, 15));
        if (clipId === 'second' && failSecond) throw new Error('Intentional renderer interruption');
        const output = options.out, qcPath = `${output}.qc.json`;
        await fs.mkdir(path.dirname(path.join(ROOT, output)), {recursive: true});
        await fs.writeFile(path.join(ROOT, output), `mock-render-${clipId}`, 'utf8');
        const outputSnapshot = await fileSnapshot(output);
        await atomicJson(qcPath, {ok: true, outputSha256: outputSnapshot.sha256, inputProps: {edit: manifest}, mode: 'preview'}, {project: manifest.id});
        finished.push(clipId);
        return {ok: true, output, qc: qcPath, safeReport: null, manifestHash: digest(manifest)};
      } finally {active--;}
    };
    dependencies.renderEditorManifest = renderer;
    await assert.rejects(renderPodcastBatch(batchFile, {optionsFile}, dependencies), /Intentional renderer interruption/);
    assert.deepEqual(started, ['first', 'second']);
    assert.deepEqual(finished, ['first']);
    assert.equal(maxActive, 1);
    assert.equal((await readJson(batchFile)).clipStates.second.status, 'failed');
    failSecond = false;
    const resumed = await renderPodcastBatch(batchFile, {optionsFile}, dependencies);
    assert.deepEqual(resumed.clips.map(c => [c.id, c.cached]), [['first', true], ['second', false]]);
    assert.deepEqual(started, ['first', 'second', 'second']);
    const complete = await podcastBatchStatus(batchFile);
    assert.equal(complete.status, 'rendered');
    assert.equal(complete.clips.every(c => c.status === 'rendered'), true);
    await fs.appendFile(path.join(ROOT, assetPath), '-changed');
    assert.notEqual((await podcastBatchStatus(batchFile)).clips[0].status, 'rendered', 'replaced same-path scene asset invalidates the saved render');
    const changedAssets = await renderPodcastBatch(batchFile, {optionsFile}, dependencies);
    assert.equal(changedAssets.clips.every(c => c.cached === false), true, 'replaced same-path asset must not reuse either old video');
    const firstSfx = `Projects/${clips[0].projectId}/prepared/sounds.wav`;
    await fs.appendFile(path.join(ROOT, firstSfx), '-changed');
    assert.notEqual((await podcastBatchStatus(batchFile)).clips[0].status, 'rendered', 'changed prepared SFX invalidates the saved render');
    const changedSfx = await renderPodcastBatch(batchFile, {optionsFile}, dependencies);
    assert.deepEqual(changedSfx.clips.map(c => c.cached), [false, true]);
    const firstManifestPath = `Projects/${clips[0].projectId}/edit.json`, firstManifest = await readJson(firstManifestPath);
    await atomicJson(firstManifestPath, {...firstManifest, presenter: false}, {project: clips[0].projectId});
    await assert.rejects(renderPodcastBatch(batchFile, {optionsFile}, dependencies), /source kind|presenter/i);
    await atomicJson(firstManifestPath, firstManifest, {project: clips[0].projectId});
    const racingPreparer = async (manifestPath, options) => {
      const prepared = await preparer(manifestPath, options);
      if (manifestPath === firstManifestPath) {
        const changed = await readJson(manifestPath);
        changed.captions.grouping = 'single';
        await atomicJson(manifestPath, changed, {project: clips[0].projectId});
      }
      return prepared;
    };
    await assert.rejects(renderPodcastBatch(batchFile, {optionsFile}, {...dependencies, prepareEditorManifest: racingPreparer}), /changed during preparation/i);
    await atomicJson(firstManifestPath, firstManifest, {project: clips[0].projectId});
    const firstOutput = changedSfx.clips[0].output;
    await fs.appendFile(path.join(ROOT, firstOutput), 'changed');
    assert.notEqual((await podcastBatchStatus(batchFile)).clips[0].status, 'rendered');
    await assert.rejects(renderPodcastBatch(batchFile, {optionsFile}, dependencies), /already exists.*QC/i);
    assert.equal((await fs.readFile(path.join(ROOT, firstOutput), 'utf8')).endsWith('changed'), true);
    await assert.rejects(renderPodcastBatch(batchFile, {delivery: true}, dependencies), /approver/i);
  } finally {
    for (const directory of [base, ...clips.map(c => `Projects/${c.projectId}`)]) await fs.rm(assertProjectOutput(path.join(ROOT, directory)), {recursive: true, force: true});
  }
});
