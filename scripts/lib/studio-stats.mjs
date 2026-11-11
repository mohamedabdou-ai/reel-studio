// Counts successful installs (a new version counts once), daily use per version, finished videos and stopped installs so the
// maintainer can see that updates arrive and work. Each event carries only schema, installationId (a random UUID created here,
// not derived from the user or the machine), event, version and occurredAt. A stopped install adds `step` (one of STEP_IDS) and,
// when known, `reason` (one of SETUP_FAILURE_REASONS); a finished video adds `style` (a style id, or "other"); never names,
// handles, media, files, paths or error text. The key that stops one
// finished file from counting twice is a local hash kept in state/studio-stats.json and is never sent.
// README (privacy) and the thank-you line at the end of setup tell the user. Network or local-state failures never affect the studio.
// REEL_STUDIO_STATS accepts off, 0, false or no (trimmed, case-insensitive) to disable recording and sending completely.
// QA installs (verify-clean-install) set it to off so they are not counted.
import {createHash, randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {STEP_IDS} from './studio-state.mjs';
import {SETUP_FAILURE_REASONS} from './setup-failure.mjs';

const ENDPOINT = 'https://store.pyraai.cloud/wp-json/reel-studio-stats/v1/events';
const MAX_AGE = 30 * 86400000;
const MAX_DELIVERED = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SLUG = /^[a-z][a-z0-9-]{0,39}$/;
const BASE_KEYS = ['schema', 'installationId', 'event', 'version', 'occurredAt'];
// The detail keys each event may carry: the first is required, `reason` is optional.
const DETAIL_KEYS = {installed: [], studio_used: [], setup_failed: ['step', 'reason'], reel_delivered: ['style']};
const OPTIONAL = new Set(['reason']);
const enabled = options => !['off', '0', 'false', 'no'].includes(process.env.REEL_STUDIO_STATS?.trim().toLowerCase()) && (options.endpoint || !(process.env.CI || process.env.NODE_TEST_CONTEXT));
const nowOf = options => options.now ? options.now() : new Date();
const keyOf = event => `${event.event}:${event.version}:${event.occurredAt}:${event.step ?? event.style ?? ''}`;
const fileOf = root => path.join(root, 'state/studio-stats.json');
const readJson = async(file) => JSON.parse(await fs.readFile(file, 'utf8'));
const isKind = event => typeof event === 'string' && Object.hasOwn(DETAIL_KEYS, event);

function detailFits(event) {
  const allowed = DETAIL_KEYS[event.event];
  const extra = Object.keys(event).filter(key => !BASE_KEYS.includes(key));
  if (!allowed.every(key => OPTIONAL.has(key) || extra.includes(key))) return false;
  return extra.every(key => allowed.includes(key) && typeof event[key] === 'string' && SLUG.test(event[key]))
    && (event.step === undefined || STEP_IDS.includes(event.step))
    && (event.reason === undefined || SETUP_FAILURE_REASONS.includes(event.reason));
}

const detailFields = (kind, detail) => Object.fromEntries(DETAIL_KEYS[kind].filter(key => typeof detail?.[key] === 'string').map(key => [key, detail[key]]));

function payloadOf(event) {
  return {schema: 1, installationId: event.installationId, event: event.event, version: event.version, occurredAt: event.occurredAt, ...detailFields(event.event, event)};
}

// What an event needs before it is queued, or null when it must not be recorded at all.
function detailOf(event, detail) {
  if (event === 'setup_failed') {
    if (typeof detail?.step !== 'string' || !STEP_IDS.includes(detail.step)) return null;
    return SETUP_FAILURE_REASONS.includes(detail.reason) ? {step: detail.step, reason: detail.reason} : {step: detail.step};
  }
  if (event !== 'reel_delivered') return {};
  if (typeof detail?.output !== 'string' || detail.output === '') return null;
  const resolved = path.resolve(detail.output);
  const file = createHash('sha256').update(process.platform === 'win32' ? resolved.toLowerCase() : resolved).digest('hex');
  return {style: typeof detail.style === 'string' && SLUG.test(detail.style) ? detail.style : 'other', file};
}

function markerOf(state, kind, version, day, detail) {
  if (kind === 'installed') return [state.installed, version];
  if (kind === 'studio_used') return [state.used, `${version}:${day}`];
  if (kind === 'setup_failed') return [state.failed, `${version}:${detail.step}:${day}`];
  return [state.delivered, detail.file];
}

function retainOutbox(state, retained) {
  const remaining = new Set(retained);
  for (const event of state.outbox) {
    if (!remaining.has(event) && event?.event === 'installed' && state.installed[event.version] === event.occurredAt) {
      delete state.installed[event.version]; // A dropped unsent install can be observed again; acknowledged installs stay marked.
    }
  }
  state.outbox = retained;
}

async function takeLock(file, waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const handle = await fs.open(file, 'wx');
      await handle.close();
      return () => fs.rm(file, {force: true});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.stat(file).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 10000) await fs.rm(file, {force: true});
      else if (Date.now() >= deadline) return null;
      else await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

async function changeState(root, now, change) {
  const file = fileOf(root);
  await fs.mkdir(path.dirname(file), {recursive: true});
  const release = await takeLock(`${file}.lock`, 1000);
  if (!release) return null;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const state = await readJson(file).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return {schema: 1, installationId: randomUUID(), installed: {}, used: {}, failed: {}, delivered: {}, outbox: []};
    });
    if (state.schema !== 1 || !UUID.test(state.installationId) || !Array.isArray(state.outbox)) return null;
    state.installed ??= {}; state.used ??= {}; state.failed ??= {}; state.delivered ??= {};
    retainOutbox(state, state.outbox.filter(event => event && typeof event === 'object' && event.schema === 1 && event.installationId === state.installationId
      && isKind(event.event) && detailFits(event) && VERSION.test(event.version ?? '')
      && event.version.length <= 64 && Number.isFinite(Date.parse(event.occurredAt)) && now - Date.parse(event.occurredAt) <= MAX_AGE).slice(-64));
    const fresh = markers => Object.fromEntries(Object.entries(markers).filter(([, stamp]) => now - Date.parse(stamp) <= MAX_AGE));
    state.used = fresh(state.used); state.failed = fresh(state.failed);
    await change(state);
    state.delivered = Object.fromEntries(Object.entries(state.delivered).filter(([, stamp]) => Number.isFinite(Date.parse(stamp)))
      .sort(([, a], [, b]) => Date.parse(b) - Date.parse(a)).slice(0, MAX_DELIVERED));
    await fs.writeFile(temporary, `${JSON.stringify(state)}\n`, 'utf8');
    await fs.rename(temporary, file);
    return state;
  } finally {
    await fs.rm(temporary, {force: true}).catch(() => {});
    await release();
  }
}

export async function recordStudioEvent(root, event, options = {}) {
  try {
    if (!enabled(options) || !isKind(event)) return;
    const detail = detailOf(event, options.detail);
    if (!detail) return;
    const now = nowOf(options), version = (await readJson(path.join(root, 'versions.lock.json'))).edition;
    if (!VERSION.test(version ?? '') || version.length > 64) return;
    const ready = event === 'studio_used' && (await readJson(path.join(root, 'state/setup.json')).catch(() => null))?.status === 'done';
    await changeState(root, now, state => {
      const day = now.toISOString().slice(0, 10);
      for (const kind of ready ? ['installed', event] : [event]) {
        const [markers, key] = markerOf(state, kind, version, day, detail);
        if (markers[key]) continue;
        const occurredAt = now.toISOString(); markers[key] = occurredAt;
        state.outbox.push({schema: 1, installationId: state.installationId, event: kind, version, occurredAt, ...detailFields(kind, detail)});
      }
      retainOutbox(state, state.outbox.slice(-64));
    });
    await flushStudioEvents(root, options);
  } catch {} // Counters cannot change the success/failure of setup, editing or export.
}

export async function flushStudioEvents(root, options = {}) {
  let release;
  try {
    if (!enabled(options)) return;
    await fs.mkdir(path.dirname(fileOf(root)), {recursive: true});
    release = await takeLock(`${fileOf(root)}.sending`, 0);
    if (!release) return;
    const state = await changeState(root, nowOf(options), () => {});
    if (!state?.outbox.length) return;
    const signal = AbortSignal.timeout(Math.max(1, Math.min(1000, options.timeoutMs ?? 1000)));
    const sent = new Set();
    const dropped = new Set();
    for (const pending of state.outbox.slice(0, 4)) {
      const body = JSON.stringify(payloadOf(pending));
      if (Buffer.byteLength(body) > 1024) continue;
      try {
        const response = await fetch(options.endpoint ?? ENDPOINT, {method: 'POST', headers: {'content-type': 'application/json'}, body, signal, redirect: 'error'});
        await response.body?.cancel();
        if (!response.ok) {
          // Proxy authentication (407) and misdirected routing (421) can recover without changing the event, so retain both.
          // Fetch retries a 421 without its body, so the status observed here comes from that retry.
          if (response.status >= 400 && response.status < 500 && ![407, 408, 421, 429].includes(response.status)) {
            dropped.add(keyOf(pending));
            continue;
          }
          break;
        }
        sent.add(keyOf(pending));
      } catch { break; }
    }
    if (sent.size || dropped.size) await changeState(root, nowOf(options), latest => {
      retainOutbox(latest, latest.outbox.filter(event => !dropped.has(keyOf(event))));
      latest.outbox = latest.outbox.filter(event => !sent.has(keyOf(event)));
    });
  } catch {} finally { await release?.().catch(() => {}); }
}
