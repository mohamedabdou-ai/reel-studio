import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, rm, mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createSettingsServer} from '../scripts/lib/settings-server.mjs';

const example = JSON.parse(await readFile(new URL('../PROFILE.example.json', import.meta.url), 'utf8'));
async function instance(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reel-settings-test-'));
  const app = await createSettingsServer({root});
  t.after(async () => {await app.close(); await rm(root, {recursive: true, force: true});});
  const api = (route, options = {}) => fetch(`${app.origin}/api/${route}`, {...options, headers: {'x-reel-studio-token': app.token, ...options.headers}});
  const save = (profile, etag) => api('profile', {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({profile, etag})});
  return {root, app, api, save};
}

test('new profile saves, reopens, backs up and refuses stale edits', async t => {
  const {root, api, save} = await instance(t);
  const first = await (await api('profile')).json();
  assert.equal(first.profile, null); assert.equal(first.etag, null);
  const result = await save({...example, name: 'أحمد'}, null); assert.equal(result.status, 200);
  const saved = await result.json(); assert.equal(saved.profile.name, 'أحمد');
  assert.equal((await (await api('profile')).json()).etag, saved.etag);
  const changed = await save({...saved.profile, name: 'منى'}, saved.etag); assert.equal(changed.status, 200);
  assert.equal((await save({...saved.profile, name: 'خطأ'}, saved.etag)).status, 409);
  assert.equal(JSON.parse(await readFile(path.join(root, 'PROFILE.json'), 'utf8')).name, 'منى');
  const backups = await readdir(path.join(root, 'state', 'profile-backups'));
  assert.equal(backups.length, 1);
  assert.equal(JSON.parse(await readFile(path.join(root, 'state', 'profile-backups', backups[0]), 'utf8')).name, 'أحمد');
});

test('legacy profile is never rewritten merely by opening settings', async t => {
  const {root, api, save} = await instance(t);
  const old = {...example, schemaVersion: 2, name: 'قديم'}; delete old.preferences;
  const bytes = '\ufeff' + JSON.stringify(old);
  await writeFile(path.join(root, 'PROFILE.json'), bytes, 'utf8');
  const state = await (await api('profile')).json();
  assert.equal(state.profile.schemaVersion, 3);
  assert.equal(await readFile(path.join(root, 'PROFILE.json'), 'utf8'), bytes);
  assert.equal((await save(state.profile, state.etag)).status, 200);
  assert.equal(JSON.parse(await readFile(path.join(root, 'PROFILE.json'), 'utf8')).schemaVersion, 3);
});

test('unauthorized origin, token, invalid input and stale creation cannot overwrite data', async t => {
  const {root, app, api, save} = await instance(t);
  const body = JSON.stringify({profile: example, etag: null});
  const write = {method: 'PUT', headers: {'content-type': 'application/json'}, body};
  assert.equal((await fetch(`${app.origin}/api/profile`, write)).status, 403);
  assert.equal((await api('profile', {...write, headers: {...write.headers, origin: 'https://example.com'}})).status, 403);
  assert.equal((await save({...example, name: ''}, null)).status, 400);
  await assert.rejects(readFile(path.join(root, 'PROFILE.json')), {code: 'ENOENT'});
  assert.equal((await save(example, null)).status, 200);
  assert.equal((await save({...example, name: 'stale'}, null)).status, 409);
  assert.equal((await api('profile', {method: 'PUT', headers: {'content-type': 'text/plain'}, body})).status, 415);
});

test('setup status exposes real stages and setup cannot start before profile save', async t => {
  const {root, api, save} = await instance(t);
  assert.equal((await api('setup', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'})).status, 400);
  await mkdir(path.join(root, 'state'), {recursive: true});
  await writeFile(path.join(root, 'state', 'setup.json'), JSON.stringify({status: 'running', pid: process.pid, step: 'fonts', steps: {folders: {ok: true}, packages: {ok: true}}}));
  const status = await (await api('status')).json();
  assert.equal(status.setup.step, 'fonts'); assert.equal(status.setup.done.folders, true);
  await save(example, null);
  const running = await api('setup', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(running.status, 200);
  assert.equal((await running.json()).setup.status, 'running');
});

test('bad existing JSON remains intact and errors explain recovery', async t => {
  const {root, api} = await instance(t);
  await writeFile(path.join(root, 'PROFILE.json'), '{invalid', 'utf8');
  const response = await api('profile'); assert.equal(response.status, 400);
  assert.match((await response.json()).error, /PROFILE.json/);
  assert.equal(await readFile(path.join(root, 'PROFILE.json'), 'utf8'), '{invalid');
});

test('HTML, scripts and fonts stay local; foreign hosts and oversized writes are rejected', async t => {
  const {app, api} = await instance(t);
  const page = await fetch(app.url); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /lang="ar" dir="rtl"/);
  assert.equal((await fetch(`${app.origin}/app.js?token=${app.token}`)).status, 200);
  assert.equal((await fetch(`${app.origin}/fonts/PROFILE.json?token=${app.token}`)).status, 404);
  const hostResponse = await new Promise((resolve, reject) => {
    const req = http.get(`${app.origin}/api/profile`, {headers: {host: 'attacker.example', 'x-reel-studio-token': app.token}}, res => {res.resume(); resolve(res.statusCode);}); req.on('error', reject);
  });
  assert.equal(hostResponse, 403);
  const large = await api('profile', {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({profile: {...example, name: 'x'.repeat(70_000)}, etag: null})});
  assert.equal(large.status, 413);
});

test('setup executes the edition command from the edition root and reports its result', async t => {
  const {root, api, save} = await instance(t);
  await mkdir(path.join(root, 'scripts'), {recursive: true});
  await writeFile(path.join(root, 'scripts', 'studio.mjs'), "import {writeFile,mkdir} from 'node:fs/promises'; await mkdir('state',{recursive:true}); await writeFile('state/args.json',JSON.stringify(process.argv.slice(2))); await writeFile('state/setup.json',JSON.stringify({status:'done',steps:{folders:{ok:true},packages:{ok:true},browser:{ok:true},ffmpeg:{ok:true},fonts:{ok:true},models:{ok:true}}}));");
  await save(example, null);
  const response = await api('setup', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(response.status, 200); assert.equal((await response.json()).setup.status, 'done');
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'state', 'args.json'), 'utf8')), ['setup']);
});

test('a dead settings process cannot leave a permanent save lock', async t => {
  const {root, save} = await instance(t);
  const exited = await promisify(execFile)(process.execPath, ['-p', 'process.pid'], {windowsHide: true});
  await mkdir(path.join(root, 'state'), {recursive: true});
  await writeFile(path.join(root, 'state', 'profile-save.lock'), JSON.stringify({pid: Number(exited.stdout.trim())}));
  assert.equal((await save(example, null)).status, 200);
});

test('setup refuses an unsafe Node package location before invoking the installer', async t => {
  const {root, api, save} = await instance(t);
  await save(example, null);
  await writeFile(path.join(root, 'package.json'), '{}');
  const response = await api('setup', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /package.json/);
});
