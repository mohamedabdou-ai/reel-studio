import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {createReviewServer} from '../scripts/lib/review-editor-server.mjs';
import {createApiClient} from '../engine/src/review-editor/api-client.ts';
import {reviewManifest} from './helpers/review-manifest.mjs';

test('the browser client sends its baseline and the live HTTP API refuses a stale overwrite', async t => {
  const id = `live-http-${randomUUID()}`;
  const directory = path.join(ROOT, 'Projects', id);
  const manifestPath = `Projects/${id}/edit.json`;
  const manifest = reviewManifest(id);
  await mkdir(directory, {recursive: true});
  await writeFile(path.join(ROOT, manifestPath), JSON.stringify(manifest));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.join(ROOT, 'Projects'));
    await rm(directory, {recursive: true, force: true});
  });
  const app = await createReviewServer({manifestPath});
  t.after(() => app.close());
  const origin = new URL(app.url).origin;
  const client = createApiClient({token: app.token, fetch: (url, options) => fetch(origin + url, options)});
  assert.equal((await fetch(app.url)).status, 200, 'the real browser bundle is served');
  assert.equal((await fetch(`${origin}/api/project`)).status, 401);
  const initial = await client.project();
  const assistant = structuredClone(manifest); assistant.captions.words[0].text = 'المساعد';
  await writeFile(path.join(ROOT, manifestPath), JSON.stringify(assistant));
  const manual = structuredClone(manifest); manual.captions.words[0].text = 'يدوي';
  await assert.rejects(client.save(manual, 'يدوي', initial.manifestRevision), error => error.status === 409 && error.body.code === 'PROJECT_CHANGED');
  assert.equal(JSON.parse(await readFile(path.join(ROOT, manifestPath), 'utf8')).captions.words[0].text, 'المساعد');
  const current = await client.project();
  const saved = await client.save(manual, 'يدوي', current.manifestRevision);
  assert.equal((await client.project()).manifestRevision, saved.manifestRevision);
  assert.equal(JSON.parse(await readFile(path.join(ROOT, saved.backup), 'utf8')).captions.words[0].text, 'المساعد');
});
