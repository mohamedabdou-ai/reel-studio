import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT} from '../lib/project-paths.mjs';
import {recordStudioEvent, flushStudioEvents} from '../lib/studio-stats.mjs';
import {installEnvironment} from '../lib/clean-install.mjs';

async function fixture(t, handler) {
  const previousStats = process.env.REEL_STUDIO_STATS;
  delete process.env.REEL_STUDIO_STATS;
  t.after(() => {
    if (previousStats === undefined) delete process.env.REEL_STUDIO_STATS; else process.env.REEL_STUDIO_STATS = previousStats;
  });
  await fs.mkdir(path.join(ROOT, 'state/tmp'), {recursive: true});
  const root = await fs.mkdtemp(path.join(ROOT, 'state/tmp/studio-stats-test-'));
  await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition: '2.3.0'}));
  const events = [];
  const server = http.createServer(async(req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    // Fetch may retry a 421 request without a body; let the collector reject that retry too.
    if (!body && handler) return handler(req, res);
    events.push({value: JSON.parse(body), bytes: Buffer.byteLength(body), method: req.method});
    if (handler) return handler(req, res);
    res.writeHead(202); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async() => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(root), path.join(ROOT, 'state/tmp'));
    await fs.rm(root, {recursive: true, force: true});
  });
  return {root, events, server, options: {endpoint: `http://127.0.0.1:${server.address().port}/events`, now: () => new Date('2026-10-13T08:00:00.000Z')}};
}

test('success events send only anonymous counters and deduplicate installs and daily use', async t => {
  const {root, events, options} = await fixture(t);
  await fs.writeFile(path.join(root, 'PROFILE.json'), JSON.stringify({name: 'Private Name', handle: '@private'}));
  for (const event of ['installed', 'installed', 'studio_used', 'studio_used']) await recordStudioEvent(root, event, options);
  assert.deepEqual(events.map(row => row.value.event), ['installed', 'studio_used']);
  const identity = events[0].value.installationId;
  assert.match(identity, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const {value, bytes, method} of events) {
    assert.equal(method, 'POST'); assert.ok(bytes <= 1024);
    assert.deepEqual(Object.keys(value).sort(), ['event', 'installationId', 'occurredAt', 'schema', 'version']);
    assert.equal(value.installationId, identity); assert.equal(value.schema, 1);
    assert.equal(value.version, '2.3.0'); assert.equal(value.occurredAt, '2026-10-13T08:00:00.000Z');
    assert.ok(!JSON.stringify(value).includes('Private Name'));
  }
  await recordStudioEvent(root, 'studio_used', {...options, now: () => new Date('2026-10-14T08:00:00.000Z')});
  await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition: '2.3.1'}));
  await recordStudioEvent(root, 'installed', options);
  assert.equal(events.length, 4); assert.equal(events[3].value.version, '2.3.1');
  assert.equal(events[3].value.installationId, identity, 'an upgrade keeps the original installation');
});

test('failed delivery queues the original timestamp and a later flush acknowledges it', async t => {
  let offline = true;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(offline ? 503 : 202); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  offline = false;
  await flushStudioEvents(root, {...options, now: () => new Date('2026-10-14T08:00:00.000Z')});
  assert.equal(events.length, 2); assert.deepEqual(events[1].value, events[0].value);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8')).outbox, []);
  await flushStudioEvents(root, options); assert.equal(events.length, 2);
});

test('a permanent 400 rejection drops only the rejected install and delivers the next event', async t => {
  let offline = true;
  const {root, events, options} = await fixture(t, (_req, res) => {
    const status = offline ? 503 : events.at(-1).value.version === '3.9.9' ? 400 : 202;
    res.writeHead(status); res.end('{}');
  });
  for (const edition of ['3.9.9', '4.0.0']) {
    await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition}));
    await recordStudioEvent(root, 'installed', options);
  }
  offline = false; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => row.value.version), ['3.9.9', '4.0.0']);
  const state = JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8'));
  assert.deepEqual(state.outbox, []);
  assert.equal(state.installed['3.9.9'], undefined, 'a rejected install is not marked acknowledged');
  assert.equal(state.installed['4.0.0'], options.now().toISOString(), 'a delivered install stays acknowledged');
  await recordStudioEvent(root, 'installed', options);
  assert.equal(events.length, 2, 'the delivered install stays deduplicated');
  await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition: '3.9.9'}));
  await fs.writeFile(path.join(root, 'state/setup.json'), JSON.stringify({status: 'done'}));
  await recordStudioEvent(root, 'studio_used', {...options, now: () => new Date('2026-10-14T08:00:00.000Z')});
  assert.deepEqual(events.slice(2).map(row => [row.value.event, row.value.version]), [
    ['installed', '3.9.9'], ['studio_used', '3.9.9'],
  ], 'later meaningful use can observe the rejected install again without blocking use');
  assert.equal(events[2].value.occurredAt, '2026-10-14T08:00:00.000Z');
});

test('a returned 300 without Location keeps the event and stops the batch', async t => {
  let status = 503;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(status); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  await recordStudioEvent(root, 'studio_used', options);
  const file = path.join(root, 'state/studio-stats.json');
  const before = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(before.outbox.length, 2);
  status = 300; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => row.value), [before.outbox[0]], 'the later event is not attempted');
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), before, 'neither queued event nor its markers are removed');
});

for (const status of [403, 404]) {
  test('a ' + status + ' rejection is dropped while the batch continues', async t => {
    let offline = true;
    const {root, events, options} = await fixture(t, (_req, res) => {
      res.writeHead(offline ? 503 : events.at(-1).value.event === 'installed' ? status : 202); res.end('{}');
    });
    await recordStudioEvent(root, 'installed', options);
    await recordStudioEvent(root, 'studio_used', options);
    offline = false; events.length = 0;
    await flushStudioEvents(root, options);
    assert.deepEqual(events.map(row => row.value.event), ['installed', 'studio_used']);
    const state = JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8'));
    assert.deepEqual(state.outbox, []);
    assert.equal(state.installed['2.3.0'], undefined, 'the rejected install is not acknowledged');
  });
}

test('a studio_used 422 is dropped without touching installation marks', async t => {
  let status = 202;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(status); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  const file = path.join(root, 'state/studio-stats.json');
  const installed = JSON.parse(await fs.readFile(file, 'utf8')).installed;
  assert.ok(installed['2.3.0'], 'an acknowledged installation exists');
  status = 503;
  await recordStudioEvent(root, 'studio_used', options);
  status = 422; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => row.value.event), ['studio_used']);
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(state.outbox, []);
  assert.deepEqual(state.installed, installed);
});

test('a plain network error keeps the event and stops the batch', async t => {
  let disconnect = false;
  const {root, events, options} = await fixture(t, (req, res) => {
    if (disconnect) return req.socket.destroy();
    res.writeHead(503); res.end('{}');
  });
  await recordStudioEvent(root, 'installed', options);
  await recordStudioEvent(root, 'studio_used', options);
  const file = path.join(root, 'state/studio-stats.json');
  const before = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(before.outbox.length, 2);
  disconnect = true; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => row.value), [before.outbox[0]], 'a broken connection stops later deliveries');
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), before, 'the original events and markers survive');
});

for (const status of [407, 408, 421, 429, 503]) {
  test('a ' + status + ' response preserves the event and stops the batch until a later flush', async t => {
    let responseStatus = status;
    const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(responseStatus); res.end('{}');});
    for (const edition of ['3.9.9', '4.0.0']) {
      await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition}));
      await recordStudioEvent(root, 'installed', options);
    }
    const file = path.join(root, 'state/studio-stats.json');
    const before = JSON.parse(await fs.readFile(file, 'utf8'));
    events.length = 0;
    await flushStudioEvents(root, options);
    assert.deepEqual(events.map(row => row.value), [before.outbox[0]], 'the later event is not attempted yet');
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), before, 'both events and their markers survive');
    responseStatus = 202;
    await flushStudioEvents(root, {...options, now: () => new Date('2026-10-14T08:00:00.000Z')});
    assert.deepEqual(events.slice(1).map(row => row.value), before.outbox, 'retries preserve the original payloads');
    const after = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.deepEqual(after.outbox, []);
    assert.deepEqual(after.installed, before.installed);
  });
}

for (const [requested, expected] of [[undefined, 1000], [80, 80], [5000, 1000]]) {
  test('a nonresponsive collector uses the abort deadline ' + expected + 'ms for timeoutMs=' + requested, async t => {
    let arrived, closed, scheduledMs, sentSignal;
    const received = new Promise(resolve => { arrived = resolve; });
    const disconnected = new Promise(resolve => { closed = resolve; });
    const {root, events, server, options} = await fixture(t, req => {
      req.socket.once('close', closed);
      arrived();
    });
    // Drive the native deadline explicitly; scheduling delays must not change the timeout contract.
    const controller = new AbortController();
    t.mock.method(AbortSignal, 'timeout', milliseconds => {
      scheduledMs = milliseconds;
      return controller.signal;
    });
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (url, init) => {
      sentSignal = init.signal;
      return realFetch(url, init);
    });
    const sending = recordStudioEvent(root, 'installed', {...options, timeoutMs: requested});
    try {
      await Promise.race([received, sending.then(() => {throw new Error('request completed before reaching the collector');})]);
      assert.equal(scheduledMs, expected, 'the abort deadline respects the requested timeout and the 1s cap');
      assert.equal(sentSignal, controller.signal, 'the deadline signal must be passed to fetch');
      controller.abort(new DOMException('Controlled deadline reached', 'TimeoutError'));
      await sending;
      await disconnected;
      assert.equal(events.length, 1);
      const state = JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8'));
      assert.deepEqual(state.outbox, [events[0].value], 'a timed-out event stays queued with its original payload');
    } finally {
      controller.abort();
      server.closeAllConnections();
      await sending;
    }
  });
}

test('old offline events expire before sending', async t => {
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(503); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  await flushStudioEvents(root, {...options, now: () => new Date('2026-11-14T08:00:00.000Z')});
  assert.equal(events.length, 1, 'expired events are never replayed');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8')).outbox, []);
});

test('concurrent callers keep one stable identity and never lose distinct event state', async t => {
  const {root, events, options} = await fixture(t);
  await Promise.all(Array.from({length: 12}, (_, index) => recordStudioEvent(root, index % 2 ? 'installed' : 'studio_used', options)));
  await flushStudioEvents(root, options);
  assert.equal(new Set(events.map(row => row.value.installationId)).size, 1);
  const unique = new Set(events.map(row => `${row.value.event}:${row.value.occurredAt}`));
  assert.deepEqual([...unique].sort(), ['installed:2026-10-13T08:00:00.000Z', 'studio_used:2026-10-13T08:00:00.000Z']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8')).outbox, []);
});

test('meaningful use observes an existing complete install without collecting profile data', async t => {
  const {root, events, options} = await fixture(t);
  await fs.mkdir(path.join(root, 'state'), {recursive: true});
  await fs.writeFile(path.join(root, 'state/setup.json'), JSON.stringify({status: 'done'}));
  await recordStudioEvent(root, 'studio_used', options);
  assert.deepEqual(events.map(row => row.value.event), ['installed', 'studio_used']);
});

test('invalid events, corrupt state and unwritable locations stay silent', async t => {
  const {root, events, options} = await fixture(t);
  await recordStudioEvent(root, 'profile_saved', options);
  await fs.mkdir(path.join(root, 'state'), {recursive: true});
  await fs.writeFile(path.join(root, 'state/studio-stats.json'), '{broken');
  await recordStudioEvent(root, 'installed', options);
  await flushStudioEvents(root, options);
  const blocked = path.join(root, 'blocked');
  await fs.mkdir(blocked);
  await fs.copyFile(path.join(root, 'versions.lock.json'), path.join(blocked, 'versions.lock.json'));
  await fs.writeFile(path.join(blocked, 'state'), 'a file blocks the state directory');
  await recordStudioEvent(blocked, 'installed', options);
  await flushStudioEvents(blocked, options);
  assert.equal(events.length, 0);
});

test('offline retries keep the persistent outbox bounded', async t => {
  const {root, options} = await fixture(t, (_req, res) => {res.writeHead(503); res.end('{}');});
  for (let version = 0; version < 70; version += 1) {
    await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition: `3.${version}.0`}));
    await recordStudioEvent(root, 'installed', options);
  }
  const state = JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8'));
  assert.equal(state.outbox.length, 64);
  assert.equal(state.outbox.at(-1).version, '3.69.0', 'recent events survive an extended outage');
});

test('an expired unacknowledged install is observed again on meaningful ready use', async t => {
  let offline = true;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(offline ? 503 : 202); res.end('{}');});
  await fs.mkdir(path.join(root, 'state'), {recursive: true});
  await fs.writeFile(path.join(root, 'state/setup.json'), JSON.stringify({status: 'done'}));
  await recordStudioEvent(root, 'installed', {...options, now: () => new Date('2026-10-01T08:00:00.000Z')});
  offline = false;
  const resumed = {...options, now: () => new Date('2026-11-02T08:00:00.000Z')};
  await recordStudioEvent(root, 'studio_used', resumed);
  assert.deepEqual(events.slice(1).map(row => row.value.event), ['installed', 'studio_used']);
  assert.equal(events[1].value.occurredAt, '2026-11-02T08:00:00.000Z', 'the refreshed event meets the collector age limit');
  assert.equal(events[1].value.installationId, events[0].value.installationId);
  await recordStudioEvent(root, 'installed', resumed);
  assert.equal(events.length, 3, 'an acknowledged install stays deduplicated');
});

test('an install evicted by the outbox cap may be observed again without resetting acknowledged installs', async t => {
  let offline = false;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(offline ? 503 : 202); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  offline = true;
  for (let version = 0; version < 65; version += 1) {
    await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition: `3.${version}.0`}));
    await recordStudioEvent(root, 'installed', options);
  }
  const file = path.join(root, 'state/studio-stats.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(state.installed['3.0.0'], undefined, 'an unsent evicted installation is not marked acknowledged');
  assert.equal(state.installed['2.3.0'], '2026-10-13T08:00:00.000Z', 'the successfully sent installation stays marked');
  await fs.writeFile(path.join(root, 'versions.lock.json'), JSON.stringify({edition: '3.0.0'}));
  await fs.writeFile(path.join(root, 'state/setup.json'), JSON.stringify({status: 'done'}));
  await recordStudioEvent(root, 'studio_used', {...options, now: () => new Date('2026-10-14T08:00:00.000Z')});
  const recovered = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(recovered.installed['3.0.0'], '2026-10-14T08:00:00.000Z');
  assert.ok(recovered.outbox.some(event => event.event === 'installed' && event.version === '3.0.0'));
  offline = false;
  for (let attempt = 0; attempt < 16; attempt += 1) await flushStudioEvents(root, options);
  assert.ok(events.some(row => row.value.event === 'installed' && row.value.version === '3.0.0' && row.value.occurredAt === '2026-10-14T08:00:00.000Z'));
});

for (const value of ['off', 'OFF', ' 0 ', 'false', 'no', ' FaLsE ', ' NO ']) {
  test('REEL_STUDIO_STATS=' + JSON.stringify(value) + ' records and sends nothing, even with an explicit endpoint', async t => {
    const {root, events, options} = await fixture(t);
    const previous = process.env.REEL_STUDIO_STATS;
    process.env.REEL_STUDIO_STATS = value;
    try {
      await recordStudioEvent(root, 'installed', options);
      await recordStudioEvent(root, 'studio_used', options);
      await flushStudioEvents(root, options);
      assert.equal(events.length, 0);
      await assert.rejects(fs.stat(path.join(root, 'state/studio-stats.json')), {code: 'ENOENT'}, 'nothing is even queued');
    } finally {
      if (previous === undefined) delete process.env.REEL_STUDIO_STATS; else process.env.REEL_STUDIO_STATS = previous;
    }
  });
}

for (const value of ['off', 'OFF', ' 0 ', 'false', 'no']) {
  test('REEL_STUDIO_STATS=' + JSON.stringify(value) + ' prevents flushing events saved before opting out', async t => {
    let offline = true;
    const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(offline ? 503 : 202); res.end('{}');});
    const previous = process.env.REEL_STUDIO_STATS;
    try {
      process.env.REEL_STUDIO_STATS = 'on';
      await recordStudioEvent(root, 'installed', options);
      assert.equal(events.length, 1, 'the initial offline attempt reaches the local collector');
      const file = path.join(root, 'state/studio-stats.json');
      const before = await fs.readFile(file, 'utf8');
      assert.deepEqual(JSON.parse(before).outbox, [events[0].value]);
      offline = false; events.length = 0;
      process.env.REEL_STUDIO_STATS = value;
      await flushStudioEvents(root, options);
      assert.equal(events.length, 0, 'opting out prevents delivery of previously queued events');
      assert.equal(await fs.readFile(file, 'utf8'), before, 'opting out does not mutate saved state');
      process.env.REEL_STUDIO_STATS = 'on';
      await flushStudioEvents(root, options);
      assert.deepEqual(events.map(row => row.value), JSON.parse(before).outbox, 'the pending event can send after opting back in');
    } finally {
      if (previous === undefined) delete process.env.REEL_STUDIO_STATS; else process.env.REEL_STUDIO_STATS = previous;
    }
  });
}

test('REEL_STUDIO_STATS=on still records and sends events', async t => {
  const {root, events, options} = await fixture(t);
  const previous = process.env.REEL_STUDIO_STATS;
  process.env.REEL_STUDIO_STATS = 'on';
  try {
    await recordStudioEvent(root, 'installed', options);
    await recordStudioEvent(root, 'studio_used', options);
    assert.deepEqual(events.map(row => row.value.event), ['installed', 'studio_used']);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8')).outbox, []);
  } finally {
    if (previous === undefined) delete process.env.REEL_STUDIO_STATS; else process.env.REEL_STUDIO_STATS = previous;
  }
});

test('the QA install environment switches the signal off', () => {
  const env = installEnvironment(path.join(ROOT, 'state/tmp/qa-install'));
  assert.equal(env.REEL_STUDIO_STATS, 'off');
  const previous = process.env.REEL_STUDIO_STATS;
  process.env.REEL_STUDIO_STATS = 'on';
  try { assert.equal(installEnvironment(ROOT).REEL_STUDIO_STATS, 'off', 'an inherited value cannot turn it back on'); }
  finally { if (previous === undefined) delete process.env.REEL_STUDIO_STATS; else process.env.REEL_STUDIO_STATS = previous; }
});

test('a stopped setup sends only its step id, once per step and day', async t => {
  const {root, events, options} = await fixture(t);
  const record = (step, day = '2026-10-13') => recordStudioEvent(root, 'setup_failed', {...options, now: () => new Date(`${day}T08:00:00.000Z`), detail: {step}});
  await record('transcription'); await record('transcription'); await record('ffmpeg'); await record('transcription', '2026-10-14');
  for (const bad of ['unknown', 'C:\\Users\\me', '', undefined]) await record(bad);
  await recordStudioEvent(root, 'setup_failed', options);
  assert.deepEqual(events.map(row => [row.value.step, row.value.occurredAt.slice(0, 10)]), [['transcription', '2026-10-13'], ['ffmpeg', '2026-10-13'], ['transcription', '2026-10-14']]);
  for (const {value} of events) assert.deepEqual(Object.keys(value).sort(), ['event', 'installationId', 'occurredAt', 'schema', 'step', 'version']);
});

test('a finished video sends only its style and counts each output file once', async t => {
  const {root, events, options} = await fixture(t);
  const deliver = (output, style = 'cartoon') => recordStudioEvent(root, 'reel_delivered', {...options, detail: {style, output}});
  const first = path.join(root, 'Outputs', 'private-client-name.mp4');
  await deliver(first); await deliver(first);
  if (process.platform === 'win32') await deliver(first.toUpperCase());
  await deliver(path.join(root, 'Outputs', 'second.mp4'), 'Not A Style!');
  await deliver(''); await recordStudioEvent(root, 'reel_delivered', options);
  assert.deepEqual(events.map(row => row.value.style), ['cartoon', 'other']);
  const state = JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8'));
  const keys = Object.keys(state.delivered);
  assert.equal(keys.length, 2);
  for (const key of keys) assert.match(key, /^[0-9a-f]{64}$/);
  for (const {value} of events) {
    assert.deepEqual(Object.keys(value).sort(), ['event', 'installationId', 'occurredAt', 'schema', 'style', 'version']);
    const text = JSON.stringify(value);
    assert.ok(!text.includes('private-client-name') && !keys.some(key => text.includes(key)), 'no file name or file key leaves the machine');
  }
});

test('new events keep their detail through a retry and a rejected one does not block the next', async t => {
  let offline = true;
  const {root, events, options} = await fixture(t, (_req, res) => {
    res.writeHead(offline ? 503 : events.at(-1).value.event === 'setup_failed' ? 400 : 202); res.end('{}');
  });
  await recordStudioEvent(root, 'setup_failed', {...options, detail: {step: 'fonts'}});
  await recordStudioEvent(root, 'reel_delivered', {...options, now: () => new Date('2026-10-13T09:00:00.000Z'), detail: {style: 'cartoon', output: path.join(root, 'a.mp4')}});
  offline = false; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => [row.value.event, row.value.step ?? row.value.style]), [['setup_failed', 'fonts'], ['reel_delivered', 'cartoon']]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'state/studio-stats.json'), 'utf8')).outbox, []);
});

test('the opt-out also blocks the new events', async t => {
  const {root, events, options} = await fixture(t);
  process.env.REEL_STUDIO_STATS = ' Off ';
  await recordStudioEvent(root, 'setup_failed', {...options, detail: {step: 'fonts'}});
  await recordStudioEvent(root, 'reel_delivered', {...options, detail: {style: 'cartoon', output: path.join(root, 'a.mp4')}});
  assert.equal(events.length, 0);
  await assert.rejects(fs.stat(path.join(root, 'state/studio-stats.json')), {code: 'ENOENT'});
});

test('queued events with a missing, extra or unsafe detail are discarded before sending', async t => {
  let offline = true;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(offline ? 503 : 202); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  const file = path.join(root, 'state/studio-stats.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  const base = {schema: 1, installationId: state.installationId, version: '2.3.0', occurredAt: '2026-10-13T07:00:00.000Z'};
  state.outbox.push(null, 7, 'x', {...base, event: 'installed', style: 'cartoon'}, {...base, event: 'reel_delivered'}, {...base, event: 'reel_delivered', style: 'Bad Style'},
    {...base, event: 'setup_failed', step: 'nope'}, {...base, event: 'reel_delivered', style: 'cartoon', file: 'abc'}, {...base, event: 'setup_failed', step: 'models'});
  await fs.writeFile(file, JSON.stringify(state));
  offline = false; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => row.value.step ?? row.value.event), ['installed', 'models']);
});

test('the local finished-file list keeps only the newest 1000 keys', async t => {
  const {root, options} = await fixture(t);
  await recordStudioEvent(root, 'installed', options);
  const file = path.join(root, 'state/studio-stats.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  state.delivered = Object.fromEntries(Array.from({length: 1000}, (_, i) => [i.toString(16).padStart(64, '0'), new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()]));
  await fs.writeFile(file, JSON.stringify(state));
  await recordStudioEvent(root, 'reel_delivered', {...options, detail: {style: 'cartoon', output: path.join(root, 'new.mp4')}});
  const after = JSON.parse(await fs.readFile(file, 'utf8')).delivered;
  assert.equal(Object.keys(after).length, 1000);
  assert.ok(!Object.hasOwn(after, '0'.padStart(64, '0')), 'the oldest key leaves first');
});

test('unknown event names send nothing and create no statistics state', async t => {
  const {root, events, options} = await fixture(t);
  await recordStudioEvent(root, 'bogus', options);
  await recordStudioEvent(root, 'constructor', options);
  assert.equal(events.length, 0);
  await assert.rejects(fs.stat(path.join(root, 'state/studio-stats.json')), {code: 'ENOENT'});
});

test('a stopped setup sends its step and its reason word, once per step and day', async t => {
  const {root, events, options} = await fixture(t);
  const record = (step, reason) => recordStudioEvent(root, 'setup_failed', {...options, detail: {step, reason}});
  await record('ffmpeg', 'extract'); await record('ffmpeg', 'network'); await record('packages', 'C:\\Users\\me'); await record('browser', undefined);
  assert.deepEqual(events.map(row => [row.value.step, row.value.reason]), [['ffmpeg', 'extract'], ['packages', undefined], ['browser', undefined]]);
  assert.deepEqual(Object.keys(events[0].value).sort(), ['event', 'installationId', 'occurredAt', 'reason', 'schema', 'step', 'version']);
  assert.deepEqual(Object.keys(events[1].value).sort(), ['event', 'installationId', 'occurredAt', 'schema', 'step', 'version']);
});

test('queued stop events keep a listed reason and drop an unlisted one', async t => {
  let offline = true;
  const {root, events, options} = await fixture(t, (_req, res) => {res.writeHead(offline ? 503 : 202); res.end('{}');});
  await recordStudioEvent(root, 'installed', options);
  const file = path.join(root, 'state/studio-stats.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  const base = {schema: 1, installationId: state.installationId, version: '2.3.0', occurredAt: '2026-10-13T07:00:00.000Z', event: 'setup_failed'};
  state.outbox.push({...base, step: 'fonts', reason: 'nope'}, {...base, step: 'models', reason: 'network'}, {...base, step: 'browser'}, {...base, reason: 'network'});
  await fs.writeFile(file, JSON.stringify(state));
  offline = false; events.length = 0;
  await flushStudioEvents(root, options);
  assert.deepEqual(events.map(row => [row.value.step ?? row.value.event, row.value.reason]), [['installed', undefined], ['models', 'network'], ['browser', undefined]]);
});
