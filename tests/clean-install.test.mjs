import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';

async function fixture(t) {
  const parent = path.join(ROOT, 'state', 'tmp', 'clean-install-tests');
  await fs.mkdir(parent, {recursive: true});
  const root = await fs.mkdtemp(path.join(parent, 'case-'));
  t.after(async () => { assert.equal(path.dirname(root), parent); await fs.rm(root, {recursive: true, force: true}); });
  return root;
}

test('a fresh installation refuses inherited NODE_PATH packages', async t => {
  const root = await fixture(t);
  await assert.rejects(async () => {
    const {assertFreshTarget} = await import('../scripts/lib/clean-install.mjs');
    await assertFreshTarget(path.join(root, 'target'), {nodePath: '/shared/node_modules'});
  }, /NODE_PATH/);
});

test('a fresh installation refuses an ancestor package.json', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  const {assertFreshTarget} = await import('../scripts/lib/clean-install.mjs');
  await assert.rejects(assertFreshTarget(path.join(root, 'target'), {nodePath: ''}), /package\.json/);
});

test('a fresh installation preserves an existing destination instead of clearing it', async t => {
  const root = await fixture(t);
  const target = path.join(root, 'target');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'kept.txt'), 'keep this');
  const {assertFreshTarget} = await import('../scripts/lib/clean-install.mjs');
  await assert.rejects(assertFreshTarget(target, {nodePath: ''}), /already exists/);
  assert.equal(await fs.readFile(path.join(target, 'kept.txt'), 'utf8'), 'keep this');
});

test('a candidate snapshot refuses dependency folders and private project data', async t => {
  const root = await fixture(t);
  const {snapshotWorktree} = await import('../scripts/lib/clean-install.mjs');
  for (const file of ['engine/node_modules/extra/index.js', 'state/setup.json', 'PROFILE.json', 'Raw/private.mp4', '../escape.txt', 'engine/../Raw/private.mp4', 'Raw\\private.mp4']) {
    await assert.rejects(snapshotWorktree(path.join(root, 'source'), path.join(root, 'target'), [file]), /snapshot|outside/);
  }
});

test('a candidate snapshot copies exact public bytes without installed artifacts', async t => {
  const root = await fixture(t), source = path.join(root, 'source'), target = path.join(root, 'target');
  await fs.mkdir(path.join(source, 'engine'), {recursive: true});
  await fs.mkdir(path.join(source, 'scripts'));
  await fs.writeFile(path.join(source, 'engine', 'package.json'), '{"name":"example"}\n');
  await fs.writeFile(path.join(source, 'scripts', 'example.mjs'), 'export const value = 7;\n');
  const {snapshotWorktree, verifySnapshot} = await import('../scripts/lib/clean-install.mjs');
  const manifest = await snapshotWorktree(source, target, ['engine/package.json', 'scripts/example.mjs']);
  assert.equal(await fs.readFile(path.join(target, 'scripts', 'example.mjs'), 'utf8'), 'export const value = 7;\n');
  assert.equal(manifest.length, 2);
  assert.equal(await fs.stat(path.join(target, 'engine', 'node_modules')).catch(() => null), null);
  await verifySnapshot(source, target, manifest);
  await fs.writeFile(path.join(source, 'scripts', 'example.mjs'), 'export const value = 8;\n');
  await assert.rejects(verifySnapshot(source, target, manifest), /changed/);
});
