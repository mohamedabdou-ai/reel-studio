import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {BROWSER_RETRY_DELAYS_MS, PACKAGES_TIMEOUT_MS, runProcess, setupSteps} from '../scripts/lib/studio-setup.mjs';
import {classifySetupError} from '../scripts/lib/setup-failure.mjs';

const lock = JSON.parse(await fs.readFile(path.join(ROOT, 'versions.lock.json'), 'utf8'));
const roomy = {statfs: async () => ({bavail: 1e7, bsize: 4096})};
const cramped = {statfs: async () => ({bavail: 10, bsize: 4096})};

async function sandbox(t) {
  const parent = path.join(ROOT, 'state', 'tmp', 'setup-steps-tests');
  await fs.mkdir(parent, {recursive: true});
  const root = await fs.mkdtemp(path.join(parent, 'case-'));
  t.after(async () => { assert.equal(path.dirname(root), parent); await fs.rm(root, {recursive: true, force: true}); });
  await fs.mkdir(path.join(root, 'engine'), {recursive: true});
  return root;
}
const stepOf = (root, id, deps) => setupSteps(root, lock, deps).find(step => step.id === id);
const failWith = outputTail => Object.assign(new Error('npm-cli.js exited with code 1'), {outputTail});

test('a failed child keeps the end of its output for the reason', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', "process.stdout.write('ok '); process.stderr.write('npm error code EPERM'); process.exit(1)"], {cwd: ROOT}),
    error => /exited with code 1/.test(error.message) && /EPERM/.test(error.outputTail) && classifySetupError(error) === 'file-locked');
});

test('a child that runs too long is stopped with the timeout reason', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {cwd: ROOT, timeoutMs: 200}), error => error.reason === 'timeout');
});

test('packages run npm ci with network retries and once more from the cache after a network error', async t => {
  const root = await sandbox(t), calls = [];
  const run = async (command, args, options) => { calls.push({args, options}); if (calls.length === 1) throw failWith('npm error code ECONNRESET'); };
  await assert.rejects(stepOf(root, 'packages', {run, ...roomy}).run(() => {})); // The empty sandbox then fails the dependency check.
  assert.equal(calls.length, 2);
  for (const flag of ['ci', '--ignore-scripts', '--fetch-retries=5', '--fetch-retry-mintimeout=10000', '--fetch-retry-maxtimeout=120000']) assert.ok(calls[0].args.includes(flag), flag);
  assert.ok(!calls[0].args.includes('--prefer-offline'));
  assert.ok(calls[1].args.includes('--prefer-offline'));
  assert.equal(calls[0].options.timeoutMs, PACKAGES_TIMEOUT_MS);
});

test('packages do not rerun after a full disk and refuse to start without space', async t => {
  const root = await sandbox(t);
  let calls = 0;
  const run = async () => { calls += 1; throw failWith('npm error code ENOSPC'); };
  await assert.rejects(stepOf(root, 'packages', {run, ...roomy}).run(() => {}), error => classifySetupError(error) === 'disk-full');
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(stepOf(root, 'packages', {run, ...cramped}).run(() => {}), error => error.reason === 'disk-full' && Boolean(error.hint));
  assert.equal(calls, 0, 'nothing is downloaded when the disk is short');
});

test('the browser download is retried three times before setup gives up', async t => {
  const root = await sandbox(t), waits = [];
  let calls = 0;
  const run = async () => { calls += 1; throw failWith('Error: getaddrinfo ENOTFOUND storage.googleapis.com'); };
  await assert.rejects(stepOf(root, 'browser', {run, sleep: async ms => { waits.push(ms); }, ...roomy}).run(() => {}), error => classifySetupError(error) === 'network');
  assert.equal(calls, 4);
  assert.deepEqual(waits, [...BROWSER_RETRY_DELAYS_MS]);
});

test('a browser that downloads but does not match its pin is a hash failure', async t => {
  const root = await sandbox(t);
  await assert.rejects(stepOf(root, 'browser', {run: async () => {}, sleep: async () => {}, ...roomy}).run(() => {}), error => error.reason === 'hash');
});

test('ffmpeg installs in-process with the lock pins after the space check', async t => {
  const root = await sandbox(t), seen = [];
  const installFfmpeg = async (pins, options) => { seen.push([pins, options.root]); };
  await stepOf(root, 'ffmpeg', {installFfmpeg, ...roomy}).run(() => {});
  assert.deepEqual(seen, [[lock.ffmpeg, root]]);
  await assert.rejects(stepOf(root, 'ffmpeg', {installFfmpeg, ...cramped}).run(() => {}), error => error.reason === 'disk-full');
  assert.equal(seen.length, 1);
});
