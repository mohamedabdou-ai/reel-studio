import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {acquireProfileSaveLock} from '../scripts/lib/profile-save-lock.mjs';

test('OS ownership prevents two settings processes saving together and permits the next save', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reel-owner-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const release = await acquireProfileSaveLock(root);
  try {await assert.rejects(acquireProfileSaveLock(root), error => error.status === 409);}
  finally {await release();}
  const second = await acquireProfileSaveLock(root); await second();
});

test('a process crash releases ownership without an empty or stale lock file', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reel-crash-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const script = path.join(root, 'crash.mjs');
  await writeFile(script, `import {acquireProfileSaveLock} from ${JSON.stringify(new URL('../scripts/lib/profile-save-lock.mjs', import.meta.url).href)}; await acquireProfileSaveLock(${JSON.stringify(root)}); process.exit(7);`);
  await assert.rejects(promisify(execFile)(process.execPath, [script], {windowsHide: true}), error => error.code === 7);
  const release = await acquireProfileSaveLock(root); await release();
});
