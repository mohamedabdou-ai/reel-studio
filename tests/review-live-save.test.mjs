import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {promises as filesystem} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {reviewManifest} from './helpers/review-manifest.mjs';
import {loadReviewProject} from '../scripts/lib/review-editor-project.mjs';
import {createManifestStore} from '../scripts/lib/review-editor-jobs.mjs';

async function project(t) {
  const id = `live-save-${randomUUID()}`;
  const manifestPath = `Projects/${id}/edit.json`;
  const directory = path.join(ROOT, 'Projects', id);
  const manifest = reviewManifest(id);
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(ROOT, manifestPath), JSON.stringify(manifest, null, 2) + '\n');
  t.after(async () => {
    assert.equal(path.dirname(directory), path.join(ROOT, 'Projects'));
    await rm(directory, {recursive: true, force: true});
  });
  const write = value => writeFile(path.join(ROOT, manifestPath), JSON.stringify(value, null, 2) + '\n');
  return {manifestPath, manifest, write, store: createManifestStore({manifestPath})};
}

test('live reads detect assistant changes and provide a stable save baseline', async t => {
  const {manifestPath, manifest, write} = await project(t);
  const first = await loadReviewProject(manifestPath);
  assert.match(first.manifestRevision ?? '', /^[a-f0-9]{64}$/);
  assert.equal((await loadReviewProject(manifestPath)).manifestRevision, first.manifestRevision);
  const next = structuredClone(manifest); next.captions.words[0].text = 'جديد';
  await write(next);
  const current = await loadReviewProject(manifestPath);
  assert.equal(current.manifest.captions.words[0].text, 'جديد');
  assert.notEqual(current.manifestRevision, first.manifestRevision);
});

test('a stale viewer cannot overwrite a newer assistant edit', async t => {
  const {manifestPath, manifest, write, store} = await project(t);
  const first = await loadReviewProject(manifestPath);
  const assistant = structuredClone(manifest); assistant.captions.words[0].text = 'المساعد';
  await write(assistant);
  const manual = structuredClone(manifest); manual.captions.words[0].text = 'المستخدم';
  await assert.rejects(store.save({manifest: manual, baseRevision: first.manifestRevision, label: 'يدوي'}),
    error => error.status === 409 && error.extra?.code === 'PROJECT_CHANGED');
  assert.equal(JSON.parse(await readFile(path.join(ROOT, manifestPath), 'utf8')).captions.words[0].text, 'المساعد');
});

test('a save against the current baseline returns the new revision and keeps the replaced version', async t => {
  const {manifestPath, manifest, store} = await project(t);
  const first = await loadReviewProject(manifestPath);
  const next = structuredClone(manifest); next.captions.words[0].text = 'يدوي';
  const saved = await store.save({manifest: next, baseRevision: first.manifestRevision, label: 'يدوي'});
  assert.match(saved.manifestRevision ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(saved.manifestRevision, first.manifestRevision);
  assert.equal((await loadReviewProject(manifestPath)).manifestRevision, saved.manifestRevision);
  assert.equal(JSON.parse(await readFile(path.join(ROOT, saved.backup), 'utf8')).captions.words[0].text, 'شرح');
  await assert.rejects(store.save({manifest, baseRevision: first.manifestRevision}), {status: 409});
});

test('a Windows rename retry cannot overwrite an assistant update that arrived while the file was busy', async t => {
  const {manifestPath, manifest, write, store} = await project(t);
  const first = await loadReviewProject(manifestPath);
  const assistant = structuredClone(manifest); assistant.captions.words[0].text = 'المساعد أثناء الحفظ';
  const manual = structuredClone(manifest); manual.captions.words[0].text = 'يدوي';
  const absolute = path.join(ROOT, manifestPath);
  const rename = filesystem.rename;
  let busy = false;

  filesystem.rename = async (from, to) => {
    if (to === absolute && !busy) {
      busy = true;
      await write(assistant);
      throw Object.assign(new Error('Windows busy-file boundary'), {code: 'EBUSY'});
    }
    return rename(from, to);
  };
  try {
    await assert.rejects(store.save({manifest: manual, baseRevision: first.manifestRevision}),
      error => error.status === 409 && error.extra?.code === 'PROJECT_CHANGED');
    assert.equal(JSON.parse(await readFile(absolute, 'utf8')).captions.words[0].text, 'المساعد أثناء الحفظ');
  } finally { filesystem.rename = rename; }
});
