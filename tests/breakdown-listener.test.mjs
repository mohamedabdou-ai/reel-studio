import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {loadListenerConfig} from '../scripts/lib/breakdown-listener-request.mjs';
import {ListenerError, listenToReference, resolveGeminiKey, saveGeminiKey} from '../scripts/lib/breakdown-listener.mjs';

const API = 'https://generativelanguage.googleapis.com';
const KEY = 'AIzaTESTKEY_abcdefghijklmnop1234';
const b = {durationSec: 14.6, sound: {sfx: [{id: 'X01', t: 3.25, type: 'pop'}]}, text: []};
const answer = {sfx: [{id: 'X01', heard: true, type: 'pop'}], extraSfx: [], text: [], music: {present: true, character: 'piano', characterAr: 'بيانو', bpm: 120}, voice: {present: false, character: 'none', characterAr: 'مفيش'}};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

async function sample(t) {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'listener-'));
  t.after(() => fsp.rm(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'ref.mp4');
  await fsp.writeFile(file, Buffer.alloc(2048, 7));
  return {dir, file};
}
function fakeApi(steps) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}});
    const step = steps.shift();
    if (!step) throw new Error(`unexpected call ${url}`);
    return typeof step === 'function' ? step(url, init) : step;
  };
  return {calls, fetchImpl};
}
const happy = () => [
  new Response(null, {status: 200, headers: {'x-goog-upload-url': `${API}/upload/v1beta/files?upload_id=u1`}}),
  json({file: {name: 'files/abc123', uri: `${API}/v1beta/files/abc123`, state: 'PROCESSING'}}),
  json({name: 'files/abc123', uri: `${API}/v1beta/files/abc123`, state: 'ACTIVE'}),
  json({candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify(answer)}]}}], usageMetadata: {promptTokenCount: 9000, candidatesTokenCount: 400, thoughtsTokenCount: 100, totalTokenCount: 9500}, modelVersion: 'gemini-3.8-flash'}),
  json({}),
];

test('uploads, waits, asks, validates and deletes; the key travels only in a header', async t => {
  const {file} = await sample(t), {calls, fetchImpl} = fakeApi(happy()), slept = [];
  const got = await listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl, sleep: async ms => slept.push(ms), pollMs: 5});
  assert.deepEqual(got.heard.sfx, [{id: 'X01', heard: true, type: 'pop'}]);
  assert.deepEqual(got.usage, {promptTokens: 9000, outputTokens: 500, totalTokens: 9500});
  assert.equal(got.remoteDeleted, true);
  assert.deepEqual(calls.map(c => c.method), ['POST', 'POST', 'GET', 'POST', 'DELETE']);
  assert.match(calls[3].url, /models\/gemini-3\.8-flash:generateContent$/);
  for (const c of calls) { assert.doesNotMatch(c.url, /key=|AIza/); assert.equal(c.headers['x-goog-api-key'], KEY); }
  assert.deepEqual(slept, [5]);
});

test('an auth failure is redacted, still deletes the upload and reports it', async t => {
  const {file} = await sample(t), steps = happy();
  steps[3] = json({error: {message: `API key ${KEY} not valid`}}, 403);
  const {calls, fetchImpl} = fakeApi(steps);
  await assert.rejects(() => listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl, sleep: async () => {}, pollMs: 1}),
    e => e instanceof ListenerError && e.code === 'auth' && !e.message.includes(KEY) && e.remoteDeleted === true);
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('an upload address on another host is refused before any bytes are sent', async t => {
  const {file} = await sample(t);
  const {calls, fetchImpl} = fakeApi([new Response(null, {status: 200, headers: {'x-goog-upload-url': 'https://evil.example/upload'}})]);
  await assert.rejects(() => listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl, sleep: async () => {}}), e => e.code === 'upload');
  assert.equal(calls.length, 1);
});

test('rate limits retry with backoff; a truncated answer is a clear failure', async t => {
  const {file} = await sample(t), steps = happy(), slept = [];
  steps.splice(3, 0, json({error: {}}, 429), json({error: {}}, 503));
  const {fetchImpl} = fakeApi(steps);
  await listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl, sleep: async ms => slept.push(ms), pollMs: 1});
  assert.deepEqual(slept, [1, 1000, 3000]);
  const cut = happy(); cut[3] = json({candidates: [{finishReason: 'MAX_TOKENS', content: {parts: [{text: '{"sfx":'}]}}]});
  await assert.rejects(() => listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: fakeApi(cut).fetchImpl, sleep: async () => {}, pollMs: 1}), e => e.code === 'truncated');
});

test('keys resolve from the environment first, then the ignored file; bad keys are refused', async t => {
  const {dir} = await sample(t), file = path.join(dir, 'secrets', 'gemini.json');
  assert.deepEqual(resolveGeminiKey({env: {}, file}), {key: null, source: null});
  await saveGeminiKey(KEY, {file});
  assert.deepEqual(JSON.parse(await fsp.readFile(file, 'utf8')), {schema: 1, apiKey: KEY});
  assert.deepEqual(resolveGeminiKey({env: {}, file}), {key: KEY, source: 'file'});
  assert.deepEqual(resolveGeminiKey({env: {GEMINI_API_KEY: `${KEY}X`}, file}), {key: `${KEY}X`, source: 'env'});
  await assert.rejects(() => saveGeminiKey('short', {file}), e => e.code === 'no-key');
});


test('API_KEY_INVALID on 400 is auth; unrelated INVALID_ARGUMENT stays http without retry', async t => {
  const {file} = await sample(t);
  for (const [error, code] of [
    [{status: 'INVALID_ARGUMENT', details: [{reason: 'API_KEY_INVALID'}], message: KEY}, 'auth'],
    [{status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.'}, 'auth'],
    [{status: 'INVALID_ARGUMENT', message: 'Unsupported video'}, 'http'],
  ]) {
    const steps = happy(); steps[3] = json({error}, 400); const api = fakeApi(steps);
    await assert.rejects(listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: api.fetchImpl, sleep: async () => {}}),
      e => e.code === code && e.remoteDeleted === true && !e.message.includes(KEY));
    assert.equal(api.calls.length, 5);
  }
});

test('deadline cancels stuck fetch and response readers and still cleans up', async t => {
  const {file} = await sample(t);
  for (const readBody of [false, true]) {
    let signal; const steps = happy();
    steps[3] = (_url, init) => { signal = init.signal; assert.equal(init.redirect, 'error');
      return readBody ? {ok: true, text: () => new Promise(() => {})} : new Promise(() => {}); };
    const api = fakeApi(steps);
    await assert.rejects(listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY,
      config: {...loadListenerConfig(), processingTimeoutMs: 50}, fetchImpl: api.fetchImpl, sleep: async () => {}}),
      e => e.code === 'timeout' && e.remoteDeleted === true);
    assert.equal(signal.aborted, true); assert.equal(api.calls.at(-1).method, 'DELETE');
  }
});

test('cleanup has an independent bounded deadline and failure stays explicit', async t => {
  const {file} = await sample(t), steps = happy(); let signal;
  steps[4] = (_url, init) => { signal = init.signal; return new Promise(() => {}); };
  const got = await listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY,
    config: {...loadListenerConfig(), cleanupTimeoutMs: 20}, fetchImpl: fakeApi(steps).fetchImpl, sleep: async () => {}});
  assert.equal(got.remoteDeleted, false); assert.equal(signal.aborted, true);
});

test('network exceptions, model strings and raw answers never expose the key', async t => {
  const {file} = await sample(t), steps = happy();
  steps[3] = json({candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify({...answer, voice: {...answer.voice, character: KEY}})}]}}], modelVersion: KEY});
  const got = await listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: fakeApi(steps).fetchImpl, sleep: async () => {}});
  assert.ok(!JSON.stringify(got).includes(KEY));
  await assert.rejects(listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(),
    fetchImpl: async () => { throw new Error('network ' + KEY); }, sleep: async () => {}}), e => e.code === 'network' && !e.message.includes(KEY));
});

test('blocked and malformed replies preserve cleanup; active URI must match the upload', async t => {
  const {file} = await sample(t);
  for (const [value, code] of [[{promptFeedback: {blockReason: 'SAFETY'}}, 'blocked'], [{candidates: []}, 'invalid-response'],
    [{candidates: [{finishReason: 'STOP', content: {parts: [{text: '{}'}]}}]}, 'invalid-response']]) {
    const steps = happy(); steps[3] = json(value);
    await assert.rejects(listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: fakeApi(steps).fetchImpl, sleep: async () => {}}),
      e => e.code === code && e.remoteDeleted === true);
  }
  const steps = happy(); steps[2] = json({name: 'files/abc123', state: 'ACTIVE', uri: 'https://evil.example/video'}); steps.splice(3, 1);
  const api = fakeApi(steps);
  await assert.rejects(listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: api.fetchImpl, sleep: async () => {}}), e => e.code === 'upload' && e.remoteDeleted === true);
  assert.equal(api.calls.length, 4);
});


test('JSON-escaped credentials are redacted after decoding, in errors and returned data', async t => {
  const {file} = await sample(t), escaped = KEY.replace('A', '\\u0041');
  for (const failure of [false, true]) {
    const steps = happy();
    steps[3] = failure ? new Response('{"error":{"message":"' + escaped + '"}}', {status: 400})
      : json({candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify({...answer, voice: {...answer.voice, character: KEY}}).replace(KEY, escaped)}]}}], modelVersion: KEY});
    const request = listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: fakeApi(steps).fetchImpl, sleep: async () => {}});
    if (failure) await assert.rejects(request, e => !e.message.includes(KEY) && !e.message.includes(escaped));
    else assert.ok(!JSON.stringify(await request).includes(KEY));
  }
});


test('redaction walks parsed text leaves and preserves quoted and escaped description JSON', async t => {
  const {file} = await sample(t), steps = happy();
  const description = 'key="x" and key=\\"x\\" and slash\\end with ' + KEY;
  const raw = {...answer, voice: {...answer.voice, character: description}};
  steps[3] = json({candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify(raw)}]}}]});
  const got = await listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: fakeApi(steps).fetchImpl, sleep: async () => {}});
  assert.ok(got.raw.voice.character.includes('key="x"'));
  assert.ok(got.raw.voice.character.includes('[key]'));
  assert.ok(!JSON.stringify(got).includes(KEY));
  assert.equal(typeof got.heard.voice.character, 'string'); assert.equal(got.remoteDeleted, true);
});

test('credential query parameters and embedded keys in upload URLs stay forbidden', async t => {
  const {file} = await sample(t);
  for (const suffix of ['?key=dummy', '?X-Goog-Api-Key=dummy', '?upload_id=' + KEY]) {
    const api = fakeApi([new Response(null, {headers: {'x-goog-upload-url': API + '/upload/v1beta/files' + suffix}})]);
    await assert.rejects(listenToReference({file, mimeType: 'video/mp4', breakdown: b, key: KEY, config: loadListenerConfig(), fetchImpl: api.fetchImpl, sleep: async () => {}}), e => e.code === 'upload' && !e.message.includes(KEY));
    assert.equal(api.calls.length, 1);
  }
});
