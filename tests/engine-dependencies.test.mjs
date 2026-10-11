import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {setupSteps} from '../scripts/lib/studio-setup.mjs';
import {quickChecks} from '../scripts/lib/studio-doctor.mjs';
import {checkEngineDependencies} from '../scripts/lib/engine-dependencies.mjs';

async function incompleteInstall(t) {
  const parent = path.join(ROOT, 'state', 'tmp', 'dependency-tests');
  await fs.mkdir(parent, {recursive: true});
  const root = await fs.mkdtemp(path.join(parent, 'install-'));
  t.after(async () => {
    assert.equal(path.dirname(root), parent);
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, 'engine', 'node_modules', 'remotion'), {recursive: true});
  await fs.mkdir(path.join(root, 'state'), {recursive: true});
  await fs.writeFile(path.join(root, 'engine', 'package.json'), JSON.stringify({dependencies: {remotion: '1.0.0', 'lucide-react': '1.48.0'}}));
  await fs.writeFile(path.join(root, 'engine', 'package-lock.json'), '{}');
  await fs.writeFile(path.join(root, 'engine', 'node_modules', 'remotion', 'package.json'), JSON.stringify({name: 'remotion', version: '1.0.0', main: 'index.js'}));
  await fs.writeFile(path.join(root, 'engine', 'node_modules', 'remotion', 'index.js'), 'module.exports = {};\n');
  await fs.writeFile(path.join(root, 'engine', 'node_modules', '.package-lock.json'), '{}');
  await fs.writeFile(path.join(root, 'state', 'setup.json'), JSON.stringify({schema: 1, status: 'done', steps: {}}));
  return root;
}

const lock = {ffmpeg: {version: '0'}, browser: {exe: 'browser.exe'}, fonts: [], models: []};

test('setup refuses a remotion-only install when an editor dependency is missing', async t => {
  const root = await incompleteInstall(t);
  const packages = setupSteps(root, lock).find(step => step.id === 'packages');
  assert.equal(await packages.verify(), false, 'a remotion marker must not certify incomplete engine packages');
});

test('doctor reports missing editor packages despite completed setup and remotion', async t => {
  const root = await incompleteInstall(t);
  const result = await quickChecks(root, {lock, gitExe: null, readProfile: async () => ({}), runsTool: () => false, locationProblem: () => null});
  assert.equal(result.checks.packages.ok, false, 'doctor must detect the missing editor library');
  assert.ok(result.failed.includes('packages'));
});

test('a package in an ancestor node_modules cannot hide a missing local dependency', async t => {
  const root = await incompleteInstall(t);
  const outside = path.join(root, 'node_modules', 'lucide-react');
  await fs.mkdir(outside, {recursive: true});
  await fs.writeFile(path.join(outside, 'package.json'), JSON.stringify({name: 'lucide-react', main: 'index.js'}));
  await fs.writeFile(path.join(outside, 'index.js'), 'module.exports = {};\n');
  const result = await checkEngineDependencies(root);
  assert.ok(result.external.includes('lucide-react'), 'ancestor resolution must be reported as outside the engine install');
  assert.equal(result.ok, false);
});

test('a shared node_modules junction cannot certify an independent install', async t => {
  const root = await incompleteInstall(t);
  const modules = path.join(root, 'engine', 'node_modules');
  const shared = path.join(root, 'shared-modules');
  await fs.rename(modules, shared);
  await fs.symlink(shared, modules, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const result = await checkEngineDependencies(root);
    assert.equal(result.ok, false);
    assert.deepEqual(result.external, ['engine/node_modules']);
    const packages = setupSteps(root, lock).find(step => step.id === 'packages');
    await assert.rejects(packages.key(), /junction|symlink|outside/i, 'setup must stop before npm can touch a shared tree');
  } finally {
    await fs.unlink(modules);
  }
});

test('doctor refuses an editor bundle failure even when its engine packages resolve', async () => {
  const result = await quickChecks(ROOT, {lock, gitExe: null, readProfile: async () => ({}), runsTool: () => false, locationProblem: () => null,
    buildEditor: async () => { throw new Error('The editor entry cannot be bundled'); }});
  assert.ok(result.failed.includes('editor'), 'compilation must be part of readiness');
  assert.equal(result.checks.editor.error, 'The editor entry cannot be bundled');
});
