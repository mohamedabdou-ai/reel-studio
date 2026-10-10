import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {checkForUpdate, pullUpdate} from '../scripts/lib/studio-git.mjs';
import {normalizeProfile} from '../scripts/lib/branding.mjs';
import {compileEdit} from '../engine/src/prepared-edit/timeline.ts';

const oldManifest = {
  version: 1, id: 'kept-reel', purpose: 'test', style: 'section-deck',
  source: {path: 'Raw/example.mp4', sha256: 'a'.repeat(64), fps: 30, width: 1080, height: 1920, totalFrames: 120},
  segments: [{fromFrame: 0, toFrame: 120}],
  captions: {status: 'reviewed', reviewer: 'Creator', words: [{text: 'شرح', startMs: 0, endMs: 1000, confidence: 1}]},
  scenes: [{id: 'intro', fromFrame: 0, durationInFrames: 120, family: 'intro', layout: 'takeover', motion: 'quiet',
    data: {kicker: 'مثال', title: 'مشروع محفوظ', subtitle: 'المحتوى الأصلي', caption: 'شرح'}}],
  sounds: [], camera: [], presenter: false,
};

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('2.0 release retains the existing profile and manifest formats', async () => {
  const lock = JSON.parse(await readFile(new URL('../versions.lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.edition, '2.0.0');
  assert.equal(compileEdit(oldManifest).durationInFrames, 120);
  const profile = JSON.parse(await readFile(new URL('../PROFILE.example.json', import.meta.url), 'utf8'));
  profile.schemaVersion = 2;
  delete profile.preferences;
  const bytes = JSON.stringify(profile);
  const normalized = normalizeProfile(profile);
  assert.deepEqual(normalized.ending, profile.ending);
  assert.equal(JSON.stringify(profile), bytes);
});

test('a 1.8.6 clone updates by fast-forward while preserving profile and project bytes', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-update-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const origin = path.join(root, 'origin'), consumer = path.join(root, 'consumer');
  await mkdir(path.join(origin, 'engine'), {recursive: true});
  git(origin, 'init', '-b', 'main');
  git(origin, 'config', 'user.name', 'Reel Studio Test');
  git(origin, 'config', 'user.email', 'noreply@github.com');
  const lock = {schema: 1, edition: '1.8.6', engine: '0.6.0', node: {version: '22.20.0'}};
  await writeFile(path.join(origin, 'versions.lock.json'), JSON.stringify(lock));
  await writeFile(path.join(origin, 'engine', 'package-lock.json'), '{"lockfileVersion":3}');
  await writeFile(path.join(origin, '.gitignore'), '/PROFILE.json\n/Projects/\n/Raw/\n/Outputs/\n');
  git(origin, 'add', 'versions.lock.json', 'engine/package-lock.json', '.gitignore');
  git(origin, 'commit', '-m', 'initial');
  const from = git(origin, 'rev-parse', 'HEAD');
  git(root, '-c', 'protocol.file.allow=always', 'clone', '--quiet', pathToFileURL(origin).href, consumer);
  git(consumer, 'config', 'protocol.file.allow', 'always');
  const profile = await readFile(new URL('../PROFILE.example.json', import.meta.url));
  const project = Buffer.from(JSON.stringify(oldManifest, null, 2));
  await mkdir(path.join(consumer, 'Projects', 'kept-reel'), {recursive: true});
  await mkdir(path.join(consumer, 'Outputs'), {recursive: true});
  await writeFile(path.join(consumer, 'PROFILE.json'), profile);
  await writeFile(path.join(consumer, 'Projects', 'kept-reel', 'edit.json'), project);
  await writeFile(path.join(consumer, 'Outputs', 'kept.mp4'), 'unchanged-output');
  await writeFile(path.join(origin, 'versions.lock.json'), JSON.stringify({...lock, edition: '2.0.0', engine: '1.0.0'}));
  git(origin, 'add', 'versions.lock.json');
  git(origin, 'commit', '-m', 'update');
  const check = await checkForUpdate(consumer, {gitExe: 'git'});
  assert.equal(check.current, '1.8.6');
  assert.equal(check.latest, '2.0.0');
  assert.equal(check.updateAvailable, true);
  const result = pullUpdate(consumer, {gitExe: 'git'});
  assert.equal(result.ok, true);
  assert.equal(result.from, from);
  assert.equal(result.updated, true);
  assert.deepEqual(result.changed, {packages: false, tools: false});
  assert.deepEqual(await readFile(path.join(consumer, 'PROFILE.json')), profile);
  assert.deepEqual(await readFile(path.join(consumer, 'Projects', 'kept-reel', 'edit.json')), project);
  assert.equal(await readFile(path.join(consumer, 'Outputs', 'kept.mp4'), 'utf8'), 'unchanged-output');
  assert.equal(compileEdit(JSON.parse(project)).durationInFrames, 120);
  assert.equal(pullUpdate(consumer, {gitExe: 'git'}).updated, false);
});
