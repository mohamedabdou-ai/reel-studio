import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {sha256File} from '../scripts/lib/studio-download.mjs';
import {validateLock} from '../scripts/lib/studio-lock.mjs';
import {setupSteps} from '../scripts/lib/studio-setup.mjs';
import {ffmpegPaths, installPinnedFfmpeg, unpackWith7zr} from '../scripts/lib/ffmpeg-install.mjs';

const lock = JSON.parse(await fs.readFile(path.join(ROOT, 'versions.lock.json'), 'utf8'));
const pins = lock.ffmpeg;

async function sandbox(t) {
  const parent = path.join(ROOT, 'state', 'tmp', 'ffmpeg-install-tests');
  await fs.mkdir(parent, {recursive: true});
  const root = await fs.mkdtemp(path.join(parent, 'case-'));
  t.after(async () => { assert.equal(path.dirname(root), parent); await fs.rm(root, {recursive: true, force: true}); });
  return root;
}

function fakes() {
  const calls = [];
  const download = async ({url, target}) => { calls.push(url); await fs.mkdir(path.dirname(target), {recursive: true}); await fs.writeFile(target, url); return {cached: false, target}; };
  const unpack = async ({destination}) => { for (const name of ['ffmpeg.exe', 'ffprobe.exe']) await fs.writeFile(path.join(destination, name), `new ${name}`); };
  const check = async () => {};
  return {calls, download, unpack, check};
}

const leftoverStaging = async root => (await fs.readdir(path.join(root, 'state/tmp')).catch(() => [])).filter(name => name.startsWith('ffmpeg-install-'));

test('the lock pins the 7zr extractor and rejects an ffmpeg entry without it', () => {
  assert.equal(validateLock(lock), lock);
  assert.equal(pins.extractor.name, '7zr');
  const {extractor, ...bare} = pins;
  assert.throws(() => validateLock({...lock, ffmpeg: bare}), /ffmpeg\.extractor/);
});

test('install downloads both pins, unpacks into staging, moves both programs and writes the report', async t => {
  const root = await sandbox(t), {calls, download, unpack, check} = fakes();
  const report = await installPinnedFfmpeg(pins, {root, download, unpack, check});
  const paths = ffmpegPaths(root, pins);
  assert.deepEqual(calls, [pins.url, pins.extractor.url]);
  assert.equal(await fs.readFile(path.join(paths.bin, 'ffmpeg.exe'), 'utf8'), 'new ffmpeg.exe');
  assert.equal(await fs.readFile(path.join(paths.bin, 'ffprobe.exe'), 'utf8'), 'new ffprobe.exe');
  assert.deepEqual({ok: report.ok, archiveSha256: report.archiveSha256, extractor: report.extractor, version: report.version}, {ok: true, archiveSha256: pins.sha256, extractor: '7zr 26.06', version: pins.version});
  assert.deepEqual(JSON.parse(await fs.readFile(paths.report, 'utf8')), report);
  await assert.rejects(fs.stat(paths.archive), {code: 'ENOENT'});
  assert.ok((await fs.stat(paths.extractor)).isFile(), 'the small extractor stays cached');
  assert.deepEqual(await leftoverStaging(root), []);
});

test('a failed unpack or check leaves Tools/bin as it was and names the reason', async t => {
  for (const broken of ['unpack', 'check']) {
    const root = await sandbox(t), parts = fakes();
    const paths = ffmpegPaths(root, pins);
    await fs.mkdir(paths.bin, {recursive: true});
    await fs.writeFile(path.join(paths.bin, 'ffmpeg.exe'), 'old');
    parts[broken] = async () => { throw Object.assign(new Error(`${broken} failed`), {reason: 'extract'}); };
    await assert.rejects(installPinnedFfmpeg(pins, {root, ...parts}), error => error.reason === 'extract');
    assert.equal(await fs.readFile(path.join(paths.bin, 'ffmpeg.exe'), 'utf8'), 'old');
    await assert.rejects(fs.stat(paths.report), {code: 'ENOENT'});
    assert.deepEqual(await leftoverStaging(root), []);
  }
});

test('a missing program in the archive is an extract failure', async t => {
  const root = await sandbox(t), parts = fakes();
  parts.unpack = async ({destination}) => { await fs.writeFile(path.join(destination, 'ffmpeg.exe'), 'only one'); };
  await assert.rejects(installPinnedFfmpeg(pins, {root, ...parts}), error => error.reason === 'extract' && /ffprobe\.exe/.test(error.message));
});

test('7zr failures become extract errors; a blocked start keeps its code', async () => {
  const exit = async () => { throw Object.assign(new Error('Command failed'), {code: 2, stderr: 'ERROR: Data Error : ffmpeg.exe\n'}); };
  await assert.rejects(unpackWith7zr({sevenZip: '7zr.exe', archive: 'a.7z', base: 'b', destination: 'd', exec: exit}), error => error.reason === 'extract' && /Data Error/.test(error.message));
  const blocked = async () => { throw Object.assign(new Error('spawn EPERM'), {code: 'EPERM'}); };
  await assert.rejects(unpackWith7zr({sevenZip: '7zr.exe', archive: 'a.7z', base: 'b', destination: 'd', exec: blocked}), error => error.code === 'EPERM' && error.reason === undefined);
});

test('the pinned 7zr unpacks only the two programs from a gyan-shaped archive', async t => {
  const sevenZip = path.join(ROOT, 'state/cache/tools', `7zr-${pins.extractor.version}.exe`);
  if ((await sha256File(sevenZip)) !== pins.extractor.sha256) { t.skip('run setup once so the pinned 7zr is cached'); return; }
  const root = await sandbox(t), destination = path.join(root, 'out');
  await fs.mkdir(destination);
  await unpackWith7zr({sevenZip, archive: path.join(ROOT, 'tests/fixtures/ffmpeg-layout.7z'), base: `ffmpeg-${pins.version}-full_build`, destination});
  assert.deepEqual((await fs.readdir(destination)).sort(), ['ffmpeg.exe', 'ffprobe.exe']);
  assert.equal(await fs.readFile(path.join(destination, 'ffmpeg.exe'), 'utf8'), 'stub ffmpeg 8.1.2');
});

test('the ffmpeg installer no longer uses Windows tar', async () => {
  for (const file of ['scripts/install-ffmpeg.mjs', 'scripts/lib/ffmpeg-install.mjs']) {
    assert.doesNotMatch(await fs.readFile(path.join(ROOT, file), 'utf8'), /tar\.exe/, file);
  }
});

test('a partial replacement removes the old report and makes setup verify fail', async t => {
  const root = await sandbox(t), parts = fakes();
  const paths = ffmpegPaths(root, pins);
  await fs.mkdir(paths.bin, {recursive: true});
  await fs.writeFile(path.join(paths.bin, 'ffmpeg.exe'), 'old ffmpeg');
  await fs.writeFile(path.join(paths.bin, 'ffprobe.exe'), 'old ffprobe');
  await fs.writeFile(paths.report, JSON.stringify({ok: true, archiveSha256: pins.sha256}));
  const step = setupSteps(root, lock).find(step => step.id === 'ffmpeg');
  assert.equal(await step.verify(), true);
  const moved = [];
  const locked = Object.assign(new Error('ffprobe.exe is locked'), {code: 'EPERM'});
  const rename = async (from, to) => {
    moved.push(path.basename(to));
    if (path.basename(to) === 'ffprobe.exe') throw locked;
    await fs.rename(from, to);
  };
  await assert.rejects(installPinnedFfmpeg(pins, {root, ...parts, rename}), error => error === locked);
  assert.deepEqual(moved, ['ffmpeg.exe', 'ffprobe.exe']);
  assert.equal(await fs.readFile(path.join(paths.bin, 'ffmpeg.exe'), 'utf8'), 'new ffmpeg.exe');
  assert.equal(await fs.readFile(path.join(paths.bin, 'ffprobe.exe'), 'utf8'), 'old ffprobe');
  await assert.rejects(fs.stat(paths.report), {code: 'ENOENT'});
  assert.equal(await step.verify(), false);
  assert.ok((await fs.stat(paths.archive)).isFile(), 'the archive stays available for another install');
  assert.deepEqual(await leftoverStaging(root), []);
});
