import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from './project-paths.mjs';
import {buildGenerateBody, buildListenerPrompt, validateHeard} from './breakdown-listener-request.mjs';

const API = 'https://generativelanguage.googleapis.com';
export const KEY_FILE = path.join(ROOT, 'state', 'secrets', 'gemini.json');
const KEY_PATTERN = /^[A-Za-z0-9_-]{20,200}$/u;

export class ListenerError extends Error {
  constructor(code, message) { super(message); this.name = 'ListenerError'; this.code = code; }
}

export function resolveGeminiKey({env = process.env, file = KEY_FILE} = {}) {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) {
    if (!KEY_PATTERN.test(fromEnv)) throw new ListenerError('no-key', 'GEMINI_API_KEY is set but does not look like an API key.');
    return {key: fromEnv, source: 'env'};
  }
  let saved;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {key: null, source: null}; throw new ListenerError('no-key', 'The saved Gemini key file is unreadable.'); }
  if (saved?.schema !== 1 || !KEY_PATTERN.test(saved.apiKey ?? '')) throw new ListenerError('no-key', 'The saved Gemini key file is invalid.');
  return {key: saved.apiKey, source: 'file'};
}

export async function saveGeminiKey(key, {file = KEY_FILE} = {}) {
  key = String(key ?? '').trim();
  if (!KEY_PATTERN.test(key)) throw new ListenerError('no-key', 'That does not look like a Gemini API key.');
  // POSIX mode is not a Windows ACL or encryption: same-account programs can read this secret.
  await fsp.mkdir(path.dirname(file), {recursive: true});
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(tmp, `${JSON.stringify({schema: 1, apiKey: key})}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
    await fsp.rename(tmp, file);
  } finally { await fsp.rm(tmp, {force: true}); }
  return file;
}


// Text redaction is for string values, never serialized JSON syntax.
export const redactListenerText = (text, key) => (key ? String(text).split(key).join('[key]') : String(text))
  .replace(/AIza[A-Za-z0-9_-]+/gu, '[key]')
  .replace(/((?:x-goog-api-key|api[_ -]?key|key)\s*[=:]\s*)[^\s,"'&}]+/giu, '$1[key]');
export function redactListenerData(value, key) {
  if (typeof value === 'string') return redactListenerText(value, key);
  if (Array.isArray(value)) return value.map(v => redactListenerData(v, key));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [redactListenerText(k, key), redactListenerData(v, key)]));
  return value;
}
const safeServiceText = (text, key) => {
  try { return JSON.stringify(redactListenerData(JSON.parse(text), key)); } catch { return redactListenerText(text, key); }
};
const API_CODES = new Set(['no-key','auth','quota','billing','too-large','blocked','truncated','invalid-response','network','timeout','upload','http']);
const classify = (status, body) => {
  let error; try { error = JSON.parse(body)?.error; } catch {}
  const invalidKey = (Array.isArray(error?.details) && error.details.some(d => d?.reason === 'API_KEY_INVALID')) || error?.reason === 'API_KEY_INVALID'
    || /API key not valid\. Please pass a valid API key\./iu.test(error?.message ?? '');
  return invalidKey || status === 401 || status === 403 ? 'auth' : status === 429 ? 'quota' : status === 402 ? 'billing' : status === 413 ? 'too-large' : 'http';
};
function address(url, kind = 'http') {
  let u; try { u = new URL(url); } catch { throw new ListenerError(kind, 'Invalid Gemini address.'); }
  if (u.origin !== API || u.username || u.password || u.hash || [...u.searchParams.keys()].some(k => /^(?:key|x-goog-api-key)$/iu.test(k)) || !/^\/(?:upload\/)?v1beta\//u.test(u.pathname))
    throw new ListenerError(kind, 'The service returned an unsafe Gemini address.');
  return u.href;
}
// Race even a fake/noncooperative fetch or reader; also abort the real fetch.
function deadline(ms, now) {
  const controller = new AbortController(), until = now() + ms;
  let rejectTimeout;
  const expired = new Promise((_, reject) => { rejectTimeout = reject; });
  const fail = () => { controller.abort(); rejectTimeout(new ListenerError('timeout', 'Gemini did not answer within the time limit.')); };
  const timer = setTimeout(fail, ms);
  return {signal: controller.signal, close: () => clearTimeout(timer), run: async operation => {
    if (now() >= until || controller.signal.aborted) { controller.abort(); throw new ListenerError('timeout', 'Gemini did not answer within the time limit.'); }
    return Promise.race([expired, Promise.resolve().then(operation)]);
  }};
}
async function call(fetchImpl, url, init, {key, sleep, budget, attempts = 3, retry = true, json = true}) {
  address(url);
  if (key && String(url).includes(key)) throw new ListenerError('upload', 'A Gemini address cannot contain credentials.');
  for (let attempt = 1; ; attempt++) {
    let response, text;
    try {
      response = await budget.run(() => fetchImpl(url, {...init, redirect: 'error', signal: budget.signal}));
      text = await budget.run(() => response.text());
    } catch (e) {
      if (e instanceof ListenerError && e.code === 'timeout') throw e;
      if (retry && attempt < attempts) { await budget.run(() => sleep(1000 * 3 ** (attempt - 1))); continue; }
      throw new ListenerError('network', redactListenerText('Network error: ' + e.message, key).slice(0, 400));
    }
    if (!response.ok) {
      const code = classify(response.status, text);
      if (code !== 'auth' && retry && (response.status === 429 || response.status === 408 || response.status >= 500) && attempt < attempts) {
        await budget.run(() => sleep(1000 * 3 ** (attempt - 1))); continue;
      }
      throw new ListenerError(code, 'Gemini API ' + response.status + ': ' + safeServiceText(text, key).slice(0, 400));
    }
    if (!json) return response;
    try { return JSON.parse(text); }
    catch { throw new ListenerError('invalid-response', 'Gemini returned text that is not JSON.'); }
  }
}

export async function listenToReference({file, mimeType, breakdown, key, config, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), pollMs = 2000}) {
  if (!KEY_PATTERN.test(key ?? '')) throw new ListenerError('no-key', 'No valid Gemini key is set.');
  if (!Number.isFinite(config.processingTimeoutMs) || config.processingTimeoutMs <= 0) throw new ListenerError('timeout', 'Invalid listener time limit.');
  const headers = {'x-goog-api-key': key}, size = (await fsp.stat(file)).size;
  if (size > config.maxBytes) throw new ListenerError('too-large', 'The reference is larger than the listener accepts.');
  const budget = deadline(config.processingTimeoutMs, now), options = {key, sleep, budget};
  let remote, fileUrl, result, failure, uploadAttempted = false;
  try {
    const start = await call(fetchImpl, API + '/upload/v1beta/files', {method: 'POST', headers: {...headers, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mimeType, 'Content-Type': 'application/json'},
      body: JSON.stringify({file: {display_name: 'reference'}})}, {...options, json: false});
    const uploadUrl = address(start.headers.get('x-goog-upload-url'), 'upload');
    const blob = await budget.run(() => fs.openAsBlob(file, {type: mimeType}));
    uploadAttempted = true;
    const uploaded = await call(fetchImpl, uploadUrl, {method: 'POST', headers: {...headers, 'Content-Length': String(size), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize'}, body: blob}, {...options, retry: false});
    remote = uploaded.file;
    if (!/^files\/[A-Za-z0-9_-]+$/u.test(remote?.name ?? '')) throw new ListenerError('upload', 'The upload returned no file name.');
    fileUrl = API + '/v1beta/' + remote.name;
    while (remote.state !== 'ACTIVE') {
      if (remote.state !== 'PROCESSING') throw new ListenerError('upload', 'Gemini could not process the reference.');
      await budget.run(() => sleep(pollMs));
      remote = await call(fetchImpl, fileUrl, {headers}, options);
    }
    if (address(remote.uri, 'upload') !== fileUrl) throw new ListenerError('upload', 'The active file does not match the upload.');
    const body = buildGenerateBody({fileUri: remote.uri, mimeType, prompt: buildListenerPrompt(breakdown), config});
    const res = await call(fetchImpl, API + '/v1beta/models/' + config.model + ':generateContent', {method: 'POST', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify(body)}, options);
    if (res.promptFeedback?.blockReason) throw new ListenerError('blocked', 'Gemini blocked the request.');
    const candidate = res.candidates?.[0];
    if (!candidate) throw new ListenerError('invalid-response', 'Gemini returned no answer.');
    if (candidate.finishReason === 'MAX_TOKENS') throw new ListenerError('truncated', 'Gemini stopped before finishing its answer.');
    if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new ListenerError('blocked', 'Gemini blocked its answer.');
    const text = (candidate.content?.parts ?? []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
    let raw; try { raw = redactListenerData(JSON.parse(text), key); } catch { throw new ListenerError('invalid-response', 'Gemini returned text that is not JSON.'); }
    const heard = validateHeard(raw, breakdown);
    const u = res.usageMetadata ?? {}, token = v => Number.isInteger(v) && v >= 0 ? v : null;
    const output = (token(u.candidatesTokenCount) ?? 0) + (token(u.thoughtsTokenCount) ?? 0);
    result = redactListenerData({heard, raw, model: typeof res.modelVersion === 'string' ? res.modelVersion.slice(0, 120) : config.model,
      usage: {promptTokens: token(u.promptTokenCount), outputTokens: output, totalTokens: token(u.totalTokenCount)}}, key);
  } catch (e) {
    failure = new ListenerError(API_CODES.has(e.code) ? e.code : 'http', redactListenerText(e.message, key).slice(0, 400));
  } finally { budget.close(); }
  let remoteDeleted = fileUrl || uploadAttempted ? false : null;
  if (fileUrl) {
    const cleanup = deadline(Math.min(config.cleanupTimeoutMs ?? 10000, 10000), now);
    try { await call(fetchImpl, fileUrl, {method: 'DELETE', headers}, {key, sleep, budget: cleanup, attempts: 2, json: false}); remoteDeleted = true; }
    catch { remoteDeleted = false; } finally { cleanup.close(); }
  }
  if (failure) { failure.remoteDeleted = remoteDeleted; throw failure; }
  return {...result, remoteDeleted};
}
