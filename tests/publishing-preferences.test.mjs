import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validatePublishCopy, renderPublishPack} from '../scripts/lib/publish-pack.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = JSON.parse(await readFile(new URL('../PROFILE.example.json', import.meta.url), 'utf8'));
const copy = {title: 'فكرتك أوضح', notes: [], instagram: {caption: 'شرح مفيد وواضح.', hashtags: ['#مونتاج']}, tiktok: {caption: 'جرّب تقسّم فكرتك لخطوات.', hashtags: ['#فيديو']}};

test('short preference constrains the real publish copy without changing platform or CTA checks', () => {
  assert.deepEqual(validatePublishCopy(copy, {profile, cta: null, writingStyle: 'short'}), copy);
  const long = {...copy, instagram: {...copy.instagram, caption: 'كلام '.repeat(100)}};
  assert.throws(() => validatePublishCopy(long, {profile, cta: null, writingStyle: 'short'}), /450/);
  assert.doesNotThrow(() => validatePublishCopy(long, {profile, cta: null, writingStyle: 'educational'}));
  assert.throws(() => validatePublishCopy(copy, {profile, cta: 'مفتاح', writingStyle: 'short'}), /مفتاح/);
  assert.match(renderPublishPack({profile, copy, cta: null, writingStyle: 'educational', video: {path: 'Outputs/test.mp4', sha256: 'a'.repeat(64)}}), /Description style: educational/);
});

test('writing command uses the planned style and explicit no-CTA despite later profile defaults', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'reel-writing-'));
  const id = `writing-${Date.now()}`;
  const directory = path.join(root, 'Projects', id);
  await mkdir(directory, {recursive: true});
  t.after(async () => {await rm(temp, {recursive: true, force: true}); await rm(directory, {recursive: true, force: true});});
  const profileFile = path.join(temp, 'profile.json');
  await writeFile(profileFile, JSON.stringify({...profile, ending: {...profile.ending, ctaDefault: 'محفوظ'}, preferences: {...profile.preferences, writingStyle: {mode: 'fixed', value: 'short'}}}));
  await writeFile(path.join(directory, 'edit.json'), JSON.stringify({writingStyle: 'educational', creator: {ending: {cta: null}}}));
  const result = JSON.parse((await exec(process.execPath, ['scripts/profile.mjs', 'writing', '--profile', profileFile, '--project', id], {cwd: root, windowsHide: true})).stdout);
  assert.equal(result.writingStyle, 'educational'); assert.equal(result.cta, null); assert.match(result.guide, /نقط عملية/);
});
