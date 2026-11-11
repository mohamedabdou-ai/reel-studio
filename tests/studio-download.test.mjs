import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createReadStream, promises as fs} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {downloadVerified, partialPath, renameWithRetry} from '../scripts/lib/studio-download.mjs';

async function sandbox(t) {
  const parent = path.join(ROOT, 'state', 'tmp', 'studio-download-tests');
  await fs.mkdir(parent, {recursive: true});
  const root = await fs.mkdtemp(path.join(parent, 'case-'));
  t.after(async () => { assert.equal(path.dirname(root), parent); await fs.rm(root, {recursive: true, force: true}); });
  return root;
}

async function serve(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => { requests.push(req.headers.range ?? null); handler(req, res, requests.length); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return {url: `http://127.0.0.1:${server.address().port}/file.bin`, requests};
}

// Serves `body` with Range support; `cut(n)` returns how many bytes request n sends before the socket is destroyed, or null for all.
function ranged(body, {cut = () => null, ignoreRange = () => false} = {}) {
  return (req, res, n) => {
    const match = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
    const start = match && !ignoreRange(n) ? Number(match[1]) : 0;
    if (start >= body.length) { res.writeHead(416, {'content-range': `bytes */${body.length}`}); res.end(); return; }
    const part = body.subarray(start);
    res.writeHead(start ? 206 : 200, {'content-length': part.length, ...(start ? {'content-range': `bytes ${start}-${body.length - 1}/${body.length}`} : {})});
    const limit = cut(n);
    if (limit === null) { res.end(part); return; }
    res.write(part.subarray(0, limit));
    setTimeout(() => res.destroy(), 50);
  };
}

const BODY = Buffer.from(Array.from({length: 300_000}, (_, i) => (i * 7) % 251));
const SHA = createHash('sha256').update(BODY).digest('hex');
const quick = (extra = {}) => {
  const waits = [], lines = [];
  return {waits, lines, options: {sleep: async ms => { waits.push(ms); }, log: line => lines.push(line), stallMs: 2000, ...extra}};
};
const locked = code => Object.assign(new Error(`${code}: file is locked`), {code});
const leftovers = async dir => (await fs.readdir(dir)).filter(name => name.endsWith('.partial'));

test('the final rename retries while antivirus holds the new file, then succeeds', async () => {
  const attempts = [];
  const failures = [locked('EPERM'), locked('EBUSY'), locked('EACCES')];
  const rename = async (from, to) => { attempts.push([from, to]); const failure = failures.shift(); if (failure) throw failure; };
  await renameWithRetry('a.partial', 'a', {rename, delayMs: 0});
  assert.equal(attempts.length, 4);
  assert.deepEqual(attempts.at(-1), ['a.partial', 'a']);
});

test('the rename gives up after its tries and does not retry other errors', async () => {
  let calls = 0;
  await assert.rejects(renameWithRetry('a.partial', 'a', {rename: async () => { calls += 1; throw locked('EPERM'); }, tries: 4, delayMs: 0}), /EPERM/);
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(renameWithRetry('a.partial', 'a', {rename: async () => { calls += 1; throw Object.assign(new Error('missing'), {code: 'ENOENT'}); }, delayMs: 0}), /missing/);
  assert.equal(calls, 1, 'only a lock-style error is retried');
});

test('a download is verified, renamed into place and cached on the second call', async t => {
  const root = await sandbox(t), body = Buffer.from('pinned file body');
  const {url} = await serve(t, (_req, res) => { res.writeHead(200); res.end(body); });
  const target = path.join(root, 'nested', 'file.bin');
  const sha256 = createHash('sha256').update(body).digest('hex');
  assert.deepEqual(await downloadVerified({url, sha256, bytes: body.length, target}), {cached: false, target, bytes: body.length});
  assert.deepEqual(await fs.readFile(target), body);
  assert.deepEqual(await leftovers(path.dirname(target)), []);
  assert.deepEqual(await downloadVerified({url, sha256, bytes: body.length, target}), {cached: true, target});
  await assert.rejects(downloadVerified({url, sha256: 'f'.repeat(64), bytes: body.length, target: path.join(root, 'bad.bin')}), error => error.reason === 'hash' && /SHA-256/.test(error.message));
  assert.deepEqual(await leftovers(root), []);
});

test('a dropped connection resumes from the kept bytes', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  const {url, requests} = await serve(t, ranged(BODY, {cut: n => (n === 1 ? 100_000 : null)}));
  const {waits, lines, options} = quick();
  assert.deepEqual(await downloadVerified({url, sha256: SHA, bytes: BODY.length, target, ...options}), {cached: false, target, bytes: BODY.length});
  assert.equal(requests[0], null);
  assert.match(requests[1], /^bytes=\d+-$/);
  assert.ok(Number(/\d+/.exec(requests[1])[0]) > 0, 'the second request starts after the kept bytes');
  assert.deepEqual(await fs.readFile(target), BODY);
  assert.deepEqual(waits, [2000]);
  assert.match(lines.join('\n'), /retry 1 of 3/);
});

test('a 503 is retried and Retry-After is honoured up to a minute', async t => {
  const root = await sandbox(t);
  const {url, requests} = await serve(t, (req, res, n) => {
    if (n === 1) { res.writeHead(503); res.end(); return; }
    if (n === 2) { res.writeHead(429, {'retry-after': '7'}); res.end(); return; }
    if (n === 3) { res.writeHead(503, {'retry-after': '600'}); res.end(); return; }
    ranged(BODY)(req, res, n);
  });
  const {waits, options} = quick();
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target: path.join(root, 'file.bin'), ...options});
  assert.equal(requests.length, 4);
  assert.deepEqual(waits, [2000, 7000, 60000]);
});

test('a server that ignores Range restarts the file from zero', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  const {url} = await serve(t, ranged(BODY, {cut: n => (n === 1 ? 50_000 : null), ignoreRange: () => true}));
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target, ...quick().options});
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('a 416 drops an unusable partial file and starts over', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  await fs.writeFile(partialPath(target, SHA), Buffer.alloc(BODY.length + 10));
  const {url, requests} = await serve(t, ranged(BODY));
  await downloadVerified({url, sha256: SHA, bytes: null, target, ...quick().options});
  assert.deepEqual(requests, [`bytes=${BODY.length + 10}-`, null]);
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('a stalled body is aborted and resumed', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  const {url, requests} = await serve(t, (req, res, n) => {
    if (n === 1) { res.writeHead(200, {'content-length': BODY.length}); res.write(BODY.subarray(0, 64_000)); return; } // then silence
    ranged(BODY)(req, res, n);
  });
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target, ...quick({stallMs: 1000}).options});
  assert.equal(requests.length, 2);
  assert.match(requests[1], /^bytes=\d+-$/);
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('a mismatch after a resume starts once more from zero', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  await fs.writeFile(partialPath(target, SHA), Buffer.alloc(1000, 0xee));
  const {url, requests} = await serve(t, ranged(BODY));
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target, ...quick().options});
  assert.deepEqual(requests, ['bytes=1000-', null]);
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('a 404 fails at once as unavailable', async t => {
  const root = await sandbox(t);
  const {url, requests} = await serve(t, (_req, res) => { res.writeHead(404); res.end(); });
  await assert.rejects(downloadVerified({url, sha256: SHA, bytes: BODY.length, target: path.join(root, 'file.bin'), ...quick().options}),
    error => error.reason === 'unavailable' && /HTTP 404/.test(error.message));
  assert.equal(requests.length, 1);
});

test('after the last retry the kept bytes survive for the next setup run', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  const broken = await serve(t, ranged(BODY, {cut: () => 20_000}));
  await assert.rejects(downloadVerified({url: broken.url, sha256: SHA, bytes: BODY.length, target, ...quick().options}), error => error.reason === 'network');
  assert.equal(broken.requests.length, 4, 'one attempt and three retries');
  const kept = (await fs.stat(partialPath(target, SHA))).size;
  assert.ok(kept >= 20_000);
  const healthy = await serve(t, ranged(BODY));
  await downloadVerified({url: healthy.url, sha256: SHA, bytes: BODY.length, target, ...quick().options});
  assert.deepEqual(healthy.requests, [`bytes=${kept}-`]);
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('a complete partial file is only checked and renamed', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  await fs.writeFile(partialPath(target, SHA), BODY);
  const {url, requests} = await serve(t, () => assert.fail('no request is needed'));
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target, ...quick().options});
  assert.equal(requests.length, 0);
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('Retry-After also honours HTTP dates up to a minute', async t => {
  const root = await sandbox(t);
  const {url} = await serve(t, (req, res, n) => {
    if (n === 1) {
      res.writeHead(503, {'retry-after': new Date(Date.now() + 120_000).toUTCString()});
      res.end();
      return;
    }
    ranged(BODY)(req, res, n);
  });
  const {waits, options} = quick();
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target: path.join(root, 'file.bin'), ...options});
  assert.deepEqual(waits, [60000]);
});

test('an empty pinned file is downloaded and verified', async t => {
  const root = await sandbox(t);
  const body = Buffer.alloc(0);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const {url, requests} = await serve(t, (_req, res) => { res.writeHead(200); res.end(body); });
  const target = path.join(root, 'empty.bin');
  assert.deepEqual(await downloadVerified({url, sha256, bytes: 0, target, ...quick().options}), {cached: false, target, bytes: 0});
  assert.equal(requests.length, 1);
  assert.deepEqual(await fs.readFile(target), body);
});

test('slow hashing of kept bytes does not consume the network stall timeout', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  const partial = partialPath(target, SHA);
  await fs.writeFile(partial, BODY.subarray(0, 64_000));
  let delayedReads = 0;
  const readPartial = async function* (file) {
    assert.equal(file, partial);
    delayedReads += 1;
    await delay(1500);
    yield* createReadStream(file);
  };
  const {url, requests} = await serve(t, ranged(BODY));
  const {waits, options} = quick({stallMs: 1000, retries: 0, readPartial});
  await downloadVerified({url, sha256: SHA, bytes: BODY.length, target, ...options});
  assert.equal(delayedReads, 1, 'the kept bytes were hashed with a delay longer than stallMs');
  assert.deepEqual(requests, ['bytes=64000-']);
  assert.deepEqual(waits, []);
  assert.deepEqual(await fs.readFile(target), BODY);
});

test('a refused range and a resumed mismatch each get one restart without spending a retry', async t => {
  const root = await sandbox(t), target = path.join(root, 'file.bin');
  await fs.writeFile(partialPath(target, SHA), Buffer.alloc(BODY.length + 10));
  const corrupted = Buffer.from(BODY);
  corrupted[0] ^= 0xff;
  const {url, requests} = await serve(t, (req, res, n) => {
    if (n === 2) {
      ranged(corrupted, {cut: () => 64_000})(req, res, n);
      return;
    }
    ranged(BODY)(req, res, n);
  });
  const {waits, options} = quick({retries: 1});
  await downloadVerified({url, sha256: SHA, bytes: null, target, ...options});
  assert.deepEqual(requests, ['bytes=' + (BODY.length + 10) + '-', null, 'bytes=64000-', null]);
  assert.deepEqual(waits, [2000], 'only the dropped connection spends the retry budget');
  assert.deepEqual(await fs.readFile(target), BODY);
});
