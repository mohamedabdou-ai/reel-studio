import {createHash} from 'node:crypto';
import {createReadStream, createWriteStream, promises as fs} from 'node:fs';
import path from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {NETWORK_CODES} from './setup-failure.mjs';

export async function sha256File(file) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || !stat.isFile()) return null;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Antivirus may hold a freshly written file for a moment; retry only that kind of error so the verified download is kept.
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES']);
export async function renameWithRetry(from, to, {rename = fs.rename, tries = 10, delayMs = 500} = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await rename(from, to); }
    catch (error) {
      if (!LOCKED.has(error.code) || attempt >= tries) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export const RETRY_DELAYS_MS = Object.freeze([2000, 10000, 30000]);
// The kept bytes belong to one exact pinned file, so a pin change never appends to old bytes.
export const partialPath = (target, sha256) => `${target}.${sha256.slice(0, 16)}.partial`;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sizeOf = async file => (await fs.stat(file).catch(() => null))?.size ?? 0;
const codeOf = error => [error?.code, error?.cause?.code, error?.cause?.cause?.code].find(code => typeof code === 'string');
const failure = (message, fields) => Object.assign(new Error(message), fields);

function httpFailure(response, url) {
  const message = `Download failed (HTTP ${response.status}): ${url}`;
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    const header = response.headers.get('retry-after');
    const seconds = header === null || header.trim() === '' ? NaN : Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(header ?? '') - Date.now());
    return failure(message, {reason: 'network', retry: true, retryAfterMs: Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 60_000) : null});
  }
  return failure(message, {reason: 'unavailable'});
}

// One request: resume when a partial file exists, stream into it while hashing, and abort when no data arrives for stallMs.
async function fetchOnce({url, partial, fetchImpl, stallMs, readPartial}) {
  const have = await sizeOf(partial);
  // Hash kept bytes before starting the request so disk reads do not consume the network stall timeout.
  let hash = createHash('sha256');
  if (have) {
    for await (const chunk of readPartial(partial)) hash.update(chunk);
  }
  const controller = new AbortController();
  let stalled = false, timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; controller.abort(); }, stallMs); };
  arm();
  try {
    const response = await fetchImpl(url, {headers: have ? {range: `bytes=${have}-`} : {}, signal: controller.signal});
    if (response.status === 416) {
      await response.body?.cancel().catch(() => {});
      throw failure(`Download range was refused (HTTP 416): ${url}`, {reason: 'network', retry: true, restart: true, free: true});
    }
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw httpFailure(response, url); }
    const append = response.status === 206 && Number(/^bytes (\d+)-/.exec(response.headers.get('content-range') ?? '')?.[1]) === have && have > 0;
    if (response.status === 206 && !append) {
      await response.body.cancel().catch(() => {});
      throw failure(`Download returned an unexpected range: ${url}`, {reason: 'network', retry: true, restart: true});
    }
    if (have && !append) hash = createHash('sha256');
    let size = append ? have : 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) { arm(); hash.update(chunk); size += chunk.length; callback(null, chunk); },
    });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial, {flags: append ? 'a' : 'w'}));
    return {size, digest: hash.digest('hex'), resumed: append};
  } catch (error) {
    if (stalled) throw failure(`Download stalled: no data for ${Math.round(stallMs / 1000)} s: ${url}`, {reason: 'network', retry: true});
    if (error.retry !== undefined || error.reason) throw error;
    if (NETWORK_CODES.includes(codeOf(error)) || error?.message === 'fetch failed' || error?.message === 'terminated') {
      throw failure(`Download interrupted (${codeOf(error) ?? error.message}): ${url}`, {reason: 'network', retry: true, cause: error});
    }
    throw error; // A write error such as ENOSPC or EPERM fails at once.
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadVerified({url, sha256, bytes = null, target, log = () => {}, fetch: fetchImpl = globalThis.fetch, retries = RETRY_DELAYS_MS.length, stallMs = 60_000, sleep = wait, readPartial = createReadStream}) {
  if ((await sha256File(target)) === sha256) return {cached: true, target};
  await fs.mkdir(path.dirname(target), {recursive: true});
  const partial = partialPath(target, sha256);
  let failures = 0;
  let rangeRestarted = false;
  let mismatchRestarted = false;
  for (;;) {
    try {
      const have = await sizeOf(partial);
      if (bytes !== null && have > bytes) await fs.rm(partial, {force: true});
      const partialDigest = bytes !== null && have === bytes ? await sha256File(partial) : null;
      const result = partialDigest
        ? {size: have, digest: partialDigest, resumed: true}
        : await fetchOnce({url, partial, fetchImpl, stallMs, readPartial});
      const wrong = result.digest !== sha256 ? `failed its SHA-256 check (expected ${sha256}, got ${result.digest})`
        : bytes !== null && result.size !== bytes ? `has ${result.size} bytes, expected ${bytes}` : null;
      if (wrong) {
        await fs.rm(partial, {force: true});
        if (result.resumed && !mismatchRestarted) {
          mismatchRestarted = true;
          log(`download: ${path.basename(target)} ${wrong} after resuming; starting again from zero`);
          continue;
        }
        throw failure(`Downloaded file ${wrong}: ${url}`, {reason: 'hash'});
      }
      await renameWithRetry(partial, target, {tries: 30, delayMs: 1000}); // Antivirus may hold a large fresh file for a while.
      return {cached: false, target, bytes: result.size};
    } catch (error) {
      if (error.restart) await fs.rm(partial, {force: true});
      if (error.free && !rangeRestarted) { rangeRestarted = true; continue; } // A refused range costs no retry: start over once.
      if (!error.retry || failures >= retries) {
        delete error.retry; delete error.restart; delete error.free; delete error.retryAfterMs;
        throw error;
      }
      const delay = error.retryAfterMs ?? RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)];
      failures += 1;
      log(`download: ${path.basename(target)}: ${error.message}; retry ${failures} of ${retries} in ${Math.round(delay / 1000)} s, keeping ${((await sizeOf(partial)) / 1e6).toFixed(1)} MB`);
      await sleep(delay);
    }
  }
}
