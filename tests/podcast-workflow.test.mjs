import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT, run} from '../scripts/lib/media.mjs';
import {assertProjectOutput} from '../scripts/lib/project-paths.mjs';
import {atomicJson, fileSnapshot, readJson} from '../scripts/lib/job-paths.mjs';
import {proposePodcastBatch, selectPodcastBatch, preparePodcastBatch, podcastBatchStatus, podcastClipProjectId} from '../scripts/lib/podcast-batch.mjs';

test('real late-window CLI preparation is resumable and preserves original source, transcript, profile and manual edits', {timeout: 180000}, async () => {
  const id = `podcast-smoke-${randomUUID().slice(0, 8)}`;
  const base = `Projects/${id}`;
  const projectId = podcastClipProjectId(id, 'late-window');
  const collisionId = podcastClipProjectId(id, 'occupied');
  try {
    await fs.mkdir(path.join(ROOT, base), {recursive: true});
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000',
      '-t', '635', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k', path.join(ROOT, base, 'source.mp4')]);
    const transcript = {words: [
      {text: 'تجربة', startMs: 630000, endMs: 630300}, {text: 'شرح', startMs: 630500, endMs: 630900},
      {text: 'واضح', startMs: 631200, endMs: 631800}, {text: 'سلام', startMs: 633000, endMs: 633700},
    ]};
    await atomicJson(`${base}/words.json`, transcript, {project: id});
    await fs.copyFile(path.join(ROOT, 'PROFILE.example.json'), path.join(ROOT, base, 'profile.json'));
    const original = await Promise.all(['source.mp4', 'words.json', 'profile.json'].map(file => fileSnapshot(`${base}/${file}`)));
    const batch = await proposePodcastBatch({id, source: `${base}/source.mp4`, transcript: `${base}/words.json`, reviewedBy: 'Fixture reviewer', minSec: 1, maxSec: 5});
    assert.equal(batch.status, 'needs-selection');
    const proposalSnapshot = await fileSnapshot(batch.batch);
    assert.equal((await proposePodcastBatch({id, source: `${base}/source.mp4`, transcript: `${base}/words.json`, reviewedBy: 'Fixture reviewer', minSec: 1, maxSec: 5})).cached, true);
    assert.deepEqual(await fileSnapshot(batch.batch), proposalSnapshot, 'same proposal leaves the batch file untouched');
    const selections = JSON.parse(await fs.readFile(new URL('./fixtures/podcast-selection.json', import.meta.url), 'utf8'));
    await atomicJson(`${base}/selection.json`, selections, {project: id});
    await selectPodcastBatch(batch.batch, `${base}/selection.json`);
    const result = await run(process.execPath, [path.join(ROOT, 'scripts/podcast.mjs'), 'prepare', batch.batch, '--profile', `${base}/profile.json`, '--no-proxy'], {cwd: ROOT, allowFail: true});
    assert.equal(result.ok, true, result.stdout);
    const lines = result.stdout.trim().split(/\r?\n/);
    assert.match(lines.at(-2), /مقطع|المقاطع/);
    assert.equal(JSON.parse(lines.at(-1)).ok, true);
    const manifestPath = `Projects/${projectId}/edit.json`;
    const manifest = await readJson(manifestPath);
    assert.deepEqual(manifest.captions.words.map(w => w.text), ['تجربة', 'شرح', 'واضح', 'سلام']);
    assert.equal(manifest.captions.words[0].startMs, 0);
    assert.equal(manifest.source.totalFrames, 120);
    assert.equal(manifest.captions.reviewer, 'Fixture reviewer');
    assert.deepEqual(manifest.segments, [{fromFrame: 0, toFrame: 120}]);
    assert.equal(manifest.scenes[0].fromFrame, 0);
    assert.equal(manifest.scenes[0].durationInFrames, 60);
    const prepared = await readJson(`Projects/${projectId}/prepared/preparation.json`);
    assert.equal(prepared.durationInFrames, 120);
    const decodeAudio = (input, start) => run('ffmpeg', ['-v', 'error', '-ss', String(start), '-i', path.join(ROOT, input), '-t', '4', '-map', '0:a:0', '-c:a', 'pcm_s24le', '-f', 's24le', 'pipe:1'], {encoding: 'buffer'});
    const [originalAudio, windowAudio] = await Promise.all([decodeAudio(`${base}/source.mp4`, 630), decodeAudio(`Projects/${projectId}/source/window.mkv`, 0)]);
    assert.deepEqual(windowAudio.stdout, originalAudio.stdout, 'lossless extracted audio preserves the exact selected original samples in order');
    assert.equal((await podcastBatchStatus(batch.batch)).clips[0].status, 'prepared');
    manifest.captions.grouping = 'single';
    await atomicJson(manifestPath, manifest, {project: projectId});
    const manual = await fileSnapshot(manifestPath);
    const second = await preparePodcastBatch(batch.batch, {profile: `${base}/profile.json`, noProxy: true});
    assert.equal(second.ok, true);
    assert.deepEqual(await fileSnapshot(manifestPath), manual, 'batch resume preserves an authored manual edit');
    assert.deepEqual(await Promise.all(['source.mp4', 'words.json', 'profile.json'].map(file => fileSnapshot(`${base}/${file}`))), original);
    const alteredWords = structuredClone(manifest);
    alteredWords.captions.words[0].text = 'كلمة غير مسجّلة';
    await atomicJson(manifestPath, alteredWords, {project: projectId});
    await assert.rejects(preparePodcastBatch(batch.batch, {profile: `${base}/profile.json`, noProxy: true}), /approved.*words|transcript/i);
    assert.deepEqual(await readJson(manifestPath), alteredWords, 'a refused edit is preserved for human review');
    await atomicJson(manifestPath, {...manifest, segments: [{fromFrame: 0, toFrame: 118}]}, {project: projectId});
    await assert.rejects(preparePodcastBatch(batch.batch, {profile: `${base}/profile.json`, noProxy: true}), /approved.*window|cuts/i);
    const alteredSignoff = structuredClone(manifest);
    alteredSignoff.creator.ending.signOff = 'سلام';
    alteredSignoff.signoffFromFrame = 90;
    await atomicJson(manifestPath, alteredSignoff, {project: projectId});
    await assert.rejects(preparePodcastBatch(batch.batch, {profile: `${base}/profile.json`, noProxy: true}), /signoff/i);
    await atomicJson(manifestPath, manifest, {project: projectId});
    assert.equal((await selectPodcastBatch(batch.batch, `${base}/selection.json`)).cached, true);
    await fs.mkdir(path.join(ROOT, `Projects/${collisionId}`), {recursive: true});
    const sentinel = `Projects/${collisionId}/edit.json`;
    await atomicJson(sentinel, {manual: 'keep'}, {project: collisionId});
    const occupiedSelections = {...selections, clips: [{...selections.clips[0], id: 'occupied'}]};
    await atomicJson(`${base}/occupied-selection.json`, occupiedSelections, {project: id});
    await assert.rejects(selectPodcastBatch(batch.batch, `${base}/occupied-selection.json`), /already|different|collision/i);
    assert.deepEqual(await readJson(sentinel), {manual: 'keep'});
    await atomicJson(`${base}/words.json`, {words: transcript.words.slice(1)}, {project: id});
    assert.equal((await podcastBatchStatus(batch.batch)).status, 'inputs-changed');
    await assert.rejects(preparePodcastBatch(batch.batch, {profile: `${base}/profile.json`, noProxy: true}), /changed/i);
  } finally {
    for (const dir of [base, `Projects/${projectId}`, `Projects/${collisionId}`, `engine/public/_prepared/${projectId}`]) {
      await fs.rm(assertProjectOutput(path.join(ROOT, dir)), {recursive: true, force: true});
    }
  }
});
