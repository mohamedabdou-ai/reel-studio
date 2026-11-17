import {PassThrough} from 'node:stream';
import {projectRecordingHashes} from '../scripts/breakdown.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import fs from 'node:fs';
import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {sha256File} from '../scripts/lib/studio-download.mjs';
import {outDirFor, referenceIdFor} from '../scripts/lib/breakdown-prepare.mjs';
import {loadListenerConfig} from '../scripts/lib/breakdown-listener-request.mjs';
import {ListenerError} from '../scripts/lib/breakdown-listener.mjs';
import {assertListenable, listenBreakdown, promptHidden} from '../scripts/breakdown.mjs';

const config = loadListenerConfig(), KEY = 'AIzaTESTKEY_abcdefghijklmnop1234';
async function registry(t) {
  const root = await fsp.mkdtemp(path.join(PROJECT_TMP, 'listener-registry-'));
  t.after(() => fsp.rm(root, {recursive: true, force: true}));
  const project = path.join(root, 'Projects', 'sample');
  await fsp.mkdir(path.join(project, 'podcast'), {recursive: true});
  return {root, project, recordingHashes: () => projectRecordingHashes({root})};
}
async function stored(t) {
  // Scan real registry files in a private root, never the suite's shared Projects/.
  const isolated = await registry(t);
  const slug = `breakdown-listen-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, project = path.join(ROOT, 'Projects', slug);
  t.after(() => fsp.rm(project, {recursive: true, force: true}));
  await fsp.mkdir(project, {recursive: true});
  const source = path.join(project, 'ref.mp4'); await fsp.writeFile(source, `reference ${slug}`);
  const sha = await sha256File(source), ref = referenceIdFor(sha);
  const outDir = outDirFor(slug, ref), workDir = path.join(outDir, 'work');
  await fsp.mkdir(workDir, {recursive: true});
  const proxy = path.join(workDir, 'proxy.mp4'); await fsp.writeFile(proxy, 'proxy');
  const breakdown = {schema: 1, referenceId: ref, source: {name: 'ref.mp4', sha256: sha}, durationSec: 14.6, shots: [], cuts: [], transitions: [], events: [], text: [], overlays: [], limitations: [],
    sound: {hasAudio: true, sfx: [{id: 'X01', t: 3.25, type: 'pop', basis: 'measured', confidence: 'medium', status: 'confirmed'}], bed: null, tempo: null, beats: [], cutsOnBeat: null}, reviewQueue: []};
  await fsp.writeFile(path.join(outDir, 'breakdown.json'), JSON.stringify(breakdown));
  await fsp.writeFile(path.join(workDir, 'prepare.json'), JSON.stringify({schema: 1, referenceId: ref, source: {name: 'ref.mp4', path: source, sha256: sha}, outDir, workDir, proxy: {path: proxy}, wav: null, cache: {proxySha256: await sha256File(proxy)}}));
  const writes = [];
  const write = async next => { writes.push(next); await fsp.writeFile(path.join(outDir, 'breakdown.json'), JSON.stringify(next)); return [path.join(outDir, 'breakdown.json')]; };
  // Saved credentials must never leak into a test.
  return {slug, ref, outDir, writes, write, source, project, recordingProject: isolated.project,
    recordingHashes: isolated.recordingHashes, keyFile: path.join(outDir, 'no-key.json')};
}
const heard = {sfx: [{id: 'X01', heard: true, type: 'pop'}], extraSfx: [], text: [], music: {present: false, character: 'none', characterAr: 'مفيش', bpm: null}, voice: {present: true, character: 'calm male', characterAr: 'راجل هادي'}, ignoredIds: []};

test('the guard refuses Raw files, project recordings, silent and long references and unknown formats', () => {
  const base = {root: ROOT, sha256: 'a'.repeat(64), ownHashes: new Set(), durationSec: 20, hasAudio: true, listener: null, config};
  assert.equal(assertListenable({...base, source: path.join(ROOT, 'Projects', 'x', 'ref.mp4')}), 'video/mp4');
  assert.throws(() => assertListenable({...base, source: path.join(ROOT, 'Raw', 'me.mp4')}), /Raw/);
  assert.throws(() => assertListenable({...base, source: path.join(ROOT, 'Projects', 'x', 'ref.mp4'), ownHashes: new Set(['a'.repeat(64)])}), /recording/);
  assert.throws(() => assertListenable({...base, source: 'a.mkv'}), /mp4, mov or webm/);
  assert.throws(() => assertListenable({...base, source: 'a.mp4', hasAudio: false}), /no audio/);
  assert.throws(() => assertListenable({...base, source: 'a.mp4', durationSec: 400}), /up to 180/);
  assert.throws(() => assertListenable({...base, source: 'a.mp4', listener: {status: 'merged'}}), /already merged/);
});

test('without consent nothing is sent and the plan names file, model, estimate and data use', async t => {
  const s = await stored(t);
  let sent = false;
  const plan = await listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, env: {}, keyFile: s.keyFile, transport: async () => { sent = true; }, write: s.write});
  assert.equal(sent, false);
  assert.deepEqual([plan.sent, plan.consentRequired, plan.keyPresent, plan.model, plan.wouldSend.name], [false, true, false, config.model, 'ref.mp4']);
  assert.ok(plan.estimateUsd.usdMax > 0);
  assert.match(plan.dataUse, /free-tier/);
  assert.equal(s.writes.length, 0);
});

test('consent without a key explains how the creator saves it', async t => {
  const s = await stored(t);
  await assert.rejects(() => listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, env: {}, keyFile: s.keyFile, transport: async () => heard, write: s.write}), /listener-key/);
});

test('consent with a key merges the answer; a listener failure is recorded, not thrown', async t => {
  const s = await stored(t);
  const ok = await listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, env: {GEMINI_API_KEY: KEY}, keyFile: s.keyFile,
    transport: async ({key}) => { assert.equal(key, KEY); return {heard, raw: {}, model: config.model, usage: {promptTokens: 1, outputTokens: 1, totalTokens: 2}, remoteDeleted: true}; }, write: s.write});
  assert.deepEqual([ok.sent, ok.merged], [true, true]);
  assert.equal(s.writes.at(-1).listener.status, 'merged');
  assert.equal(s.writes.at(-1).sound.voice.characterAr, 'راجل هادي');
  const s2 = await stored(t);
  const failed = await listenBreakdown({project: s2.slug, recordingHashes: s2.recordingHashes, ref: s2.ref, consent: true, env: {GEMINI_API_KEY: KEY}, keyFile: s2.keyFile,
    transport: async () => { throw Object.assign(new ListenerError('quota', 'Gemini API 429: busy'), {remoteDeleted: true}); }, write: s2.write});
  assert.deepEqual([failed.merged, failed.code], [false, 'quota']);
  assert.equal(s2.writes.at(-1).listener.status, 'failed');
});

test('the key prompt refuses to run without a terminal', async () => {
  await assert.rejects(() => promptHidden('Key: ', {input: {isTTY: false}, output: {write() {}}}), /terminal/);
});


test('Raw guard uses Windows casing and rejects all case variants', () => {
  for (const name of ['Raw', 'raw', 'RAW', 'rAw']) assert.throws(() => assertListenable({root: ROOT, source: path.join(ROOT, name, 'voice.mp4'),
    ownHashes: new Set(), sha256: 'a'.repeat(64), durationSec: 10, hasAudio: true, config}), /Raw/);
});

test('source and breakdown are checked again under the lock before sending', async t => {
  for (const changed of ['source', 'breakdown']) {
    const s = await stored(t); let sent = false;
    const env = {get GEMINI_API_KEY() { fs.writeFileSync(changed === 'source' ? s.source : path.join(s.outDir, 'breakdown.json'), 'changed'); return KEY; }};
    await assert.rejects(listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, env, keyFile: s.keyFile,
      transport: async () => { sent = true; }, write: s.write}), /changed|stale/);
    assert.equal(sent, false); assert.equal(s.writes.length, 0);
  }
});

test('partial project saves fail closed initially and under the send lock, then allow a fresh retry', async t => {
  for (const phase of ['initial', 'before-lock']) {
    for (const partial of ['', '{"source":']) {
      const s = await stored(t), file = path.join(s.recordingProject, 'edit.json');
      const valid = JSON.stringify({source: {sha256: 'a'.repeat(64)}});
      await fsp.writeFile(file, phase === 'initial' ? partial : valid);
      let calls = 0;
      const env = {get GEMINI_API_KEY() {
        // Deterministically pause another project's save between truncate and
        // completion, after the initial guard and before its locked recheck.
        if (phase === 'before-lock') fs.writeFileSync(file, partial);
        return KEY;
      }};
      const options = {project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, keyFile: s.keyFile,
        transport: async () => { calls++; return {heard, raw: {}, model: config.model, remoteDeleted: true}; }, write: s.write};
      const before = await fsp.readFile(path.join(s.outDir, 'breakdown.json'), 'utf8');
      await assert.rejects(listenBreakdown({...options, env}), error => {
        assert.match(error.message, /Cannot verify project recording registry/);
        assert.ok(error.message.includes(file));
        assert.match(error.message, /Wait for project saves to finish/);
        return true;
      });
      assert.equal(calls, 0); assert.equal(s.writes.length, 0);
      assert.equal(await fsp.readFile(path.join(s.outDir, 'breakdown.json'), 'utf8'), before);
      await fsp.writeFile(file, valid);
      const result = await listenBreakdown({...options, env: {GEMINI_API_KEY: KEY}});
      assert.equal(result.merged, true); assert.equal(calls, 1);
    }
  }
});

test('a recording registered after the initial guard is rejected under the send lock', async t => {
  const s = await stored(t), sha256 = await sha256File(s.source);
  let scans = 0, sent = false;
  const env = {get GEMINI_API_KEY() {
    fs.writeFileSync(path.join(s.recordingProject, 'edit.json'), JSON.stringify({source: {sha256}}));
    return KEY;
  }};
  await assert.rejects(listenBreakdown({project: s.slug, ref: s.ref, consent: true, env, keyFile: s.keyFile,
    recordingHashes: () => { scans++; return s.recordingHashes(); },
    transport: async () => { sent = true; }, write: s.write}), /project recording/);
  assert.equal(scans, 2); assert.equal(sent, false); assert.equal(s.writes.length, 0);
});

test('stale publication is rejected even when a fake transport returns successfully', async t => {
  const s = await stored(t);
  await assert.rejects(listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, env: {GEMINI_API_KEY: KEY}, keyFile: s.keyFile,
    transport: async () => { await fsp.writeFile(path.join(s.outDir, 'breakdown.json'), 'manual draft');
      return {heard, raw: {}, model: config.model, remoteDeleted: true}; }, write: s.write}), /stale save/);
  assert.equal(s.writes.length, 0);
  assert.equal(await fsp.readFile(path.join(s.outDir, 'breakdown.json'), 'utf8'), 'manual draft');
  const recovery = JSON.parse(await fsp.readFile(path.join(s.outDir, 'work/listener/response.json'), 'utf8'));
  assert.deepEqual(recovery.heard, heard);
  assert.equal(recovery.referenceSha256, await sha256File(s.source));
});


test('paid answers survive merge and output-write errors with a redacted recovery file', async t => {
  for (const failure of ['merge', 'write', 'source']) {
    const s = await stored(t), before = await fsp.readFile(path.join(s.outDir, 'breakdown.json'), 'utf8');
    const claims = structuredClone(heard);
    if (failure === 'merge') claims.sfx.push({...claims.sfx[0]});
    let calls = 0, error;
    try {
      await listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, env: {GEMINI_API_KEY: KEY}, keyFile: s.keyFile,
        transport: async () => { calls++; if (failure === 'source') await fsp.writeFile(s.source, 'changed source');
          return {heard: claims, raw: {note: 'key=\\"x\\" ' + KEY}, model: config.model, usage: {totalTokens: 2}, remoteDeleted: true}; },
        write: async () => { throw new Error('disk failure ' + KEY); }});
      assert.fail('expected an error');
    } catch (e) { error = e; }
    assert.ok(error.answerFile, error.message);
    const bytes = await fsp.readFile(error.answerFile, 'utf8'), answer = JSON.parse(bytes);
    assert.deepEqual(answer.heard, claims); assert.equal(answer.remoteDeleted, true); assert.equal(answer.usage.totalTokens, 2);
    assert.ok(!bytes.includes(KEY)); assert.ok(!error.message.includes(KEY)); assert.equal(calls, 1);
    assert.equal(await fsp.readFile(path.join(s.outDir, 'breakdown.json'), 'utf8'), before);
  }
});

test('quoted text in a transport reply still saves and merges without a serialization failure', async t => {
  const s = await stored(t), claims = structuredClone(heard);
  claims.voice.character = 'key=\\"x\\" ' + KEY;
  const got = await listenBreakdown({project: s.slug, recordingHashes: s.recordingHashes, ref: s.ref, consent: true, env: {GEMINI_API_KEY: KEY}, keyFile: s.keyFile,
    transport: async () => ({heard: claims, raw: {note: claims.voice.character}, model: config.model, remoteDeleted: true}), write: s.write});
  assert.equal(got.merged, true);
  assert.ok(!JSON.stringify(s.writes).includes(KEY));
});

test('recording registry covers normal edits, podcast episodes and original clip ownership', async t => {
  const {root, project: dir} = await registry(t);
  const write = async (name, data) => fsp.writeFile(path.join(dir, name), JSON.stringify(data));
  await write('edit.json', {source: {sha256: 'a'.repeat(64)}, scenes: [{data: {clips: []}}]});
  await write('podcast/batch.json', {source: {sha256: 'b'.repeat(64)}});
  await write('podcast/owner.json', {sourceSha256: 'c'.repeat(64)});
  const hashes = await projectRecordingHashes({root});
  assert.deepEqual([...hashes].sort(), ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]);
  for (const sha256 of hashes) assert.throws(() => assertListenable({root, source: path.join(dir, 'ref.mp4'), sha256, ownHashes: hashes, durationSec: 10, hasAudio: true, config}), /recording/);
  await write('edit.json', null);
  await assert.rejects(projectRecordingHashes({root}), /Invalid recording registry record/);
  await write('edit.json', {source: {path: 'unknown'}});
  await assert.rejects(projectRecordingHashes({root}), /identity is missing/);
  await assert.rejects(projectRecordingHashes({root: path.join(root, 'missing')}), e => e.code === 'ENOENT');
});

function fakeTerminal() {
  const input = new PassThrough(), logs = [];
  input.isTTY = true; input.isRaw = false;
  input.setRawMode = raw => { input.isRaw = raw; };
  return {input, logs, output: {write: text => logs.push(text)}};
}

test('hidden key input handles EOF, stream errors and Ctrl-D and cleans up handlers', async () => {
  for (const event of ['end', 'close', 'error', 'ctrl-d', 'ctrl-c']) {
    const io = fakeTerminal(), pending = promptHidden('Key: ', io);
    if (event === 'ctrl-d' || event === 'ctrl-c') io.input.write(event === 'ctrl-d' ? '\u0004' : '\u0003');
    else io.input.emit(event, ...(event === 'error' ? [new Error('input failure')] : []));
    await assert.rejects(pending, /closed|failed|Cancelled/);
    for (const name of ['data', 'end', 'close', 'error']) assert.equal(io.input.listenerCount(name), 0);
    assert.equal(io.input.isRaw, false);
  }
});

test('hidden key input accepts bracketed paste across chunks without echoing the key', async () => {
  const io = fakeTerminal(), pending = promptHidden('Key: ', io);
  for (const chunk of ['\x1b[20', '0~', KEY.slice(0, 10), KEY.slice(10), '\x1b[201', '~', '\r']) io.input.write(chunk);
  assert.equal(await pending, KEY); assert.equal(io.input.isRaw, false);
  assert.ok(!io.logs.join('').includes(KEY));
});


test('hidden prompt rejects an already closed terminal without activating raw mode', async () => {
  const io = fakeTerminal(); io.input.destroy();
  await assert.rejects(promptHidden('Key: ', io), /closed before Enter/);
  assert.equal(io.input.isRaw, false); assert.equal(io.logs.length, 0);
});
