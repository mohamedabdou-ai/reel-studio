import test from 'node:test';
import assert from 'node:assert/strict';
import {ownRenderTruth, sfxTypeOf} from '../scripts/lib/breakdown-truth.mjs';

const manifest = {source: {fps: 30}, signoffFromFrame: 570,
  scenes: [{fromFrame: 90, durationInFrames: 60, layout: 'takeover'}, {fromFrame: 300, durationInFrames: 90, layout: 'split'}],
  transitions: [{atFrame: 450, durationInFrames: 12, kind: 'whip-pan', dir: 'ltr'}], layoutTransitions: [],
  camera: [{atFrame: 200, scale: 1}, {atFrame: 201, scale: 1.2}], captions: {visible: true}};
const compiled = {durationInFrames: 600, segments: [{editFrom: 0}, {editFrom: 60}, {editFrom: 120}, {editFrom: 240}, {editFrom: 330}, {editFrom: 455}],
  captionGroups: [{fromFrame: 30, toFrame: 75, words: [{text: 'أهلا'}, {text: 'بيك'}]}]};
const hits = [{t: 3, sound: 'whooshSoft', gain: .2}, {t: 3.05, sound: 'impact', gain: .4}, {t: 8, sound: 'sample:pop-zen', gain: .3}];

test('sound primitives map to the breakdown types', () => {
  assert.deepEqual(['impact', 'subBoom', 'sample:landing-wood', 'pop', 'sample:click-snap', 'keyTap', 'chime', 'airRise', 'swipe', 'paper'].map(sfxTypeOf),
    ['impact', 'impact', 'impact', 'pop', 'click', 'click', 'ding', 'riser', 'whoosh', 'hit']);
});

test('own-render truth keeps visible cuts and marks what the edit cannot define', () => {
  const t = ownRenderTruth({manifest, compiled, hits, bed: false});
  assert.equal(t.textScope, 'captions-only');
  assert.deepEqual(t.cuts, [{t: 2, kind: 'jump'}, {t: 3, kind: 'cut'}, {t: 5, kind: 'cut'}, {t: 8, kind: 'jump'}]);
  assert.deepEqual(t.transitions, [{start: 15, end: 15.4, kind: 'other', studioKind: 'whip-pan', direction: 'ltr'}]);
  assert.deepEqual(t.ignore, [{start: 3.1, end: 4.9}, {start: 10.1, end: 12.9}, {start: 9.9, end: 10.1}, {start: 12.9, end: 13.1}, {start: 6.6, end: 6.8}, {start: 18.9, end: 20}]);
  assert.deepEqual(t.text, [{text: 'أهلا بيك', start: 1, end: 2.5, zone: null, fill: null, stroke: null, box: null, entrance: null}]);
  assert.deepEqual(t.sound, {bed: false, bpm: null, sfx: [{t: 3, type: 'impact'}, {t: 8, type: 'pop'}]});
  assert.deepEqual([t.fps, t.durationSec, t.source], [30, 20, 'own-render']);
});

test('hidden captions give no text truth', () => {
  assert.deepEqual(ownRenderTruth({manifest: {...manifest, captions: {visible: false}}, compiled, hits: [], bed: null}).text, []);
});


import path from 'node:path';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {digest} from '../scripts/lib/job-paths.mjs';
import {loadOwnRenderTruth, listOwnRenderCandidates, visibleCaptionTruth} from '../scripts/lib/breakdown-truth.mjs';
import {promises as fsp} from 'node:fs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';

test('caption truth excludes graphics, creator CTA and owned scenes and splits visible intervals', () => {
  const group = {durationInFrames: 150, captionGroups: [{fromFrame: 0, toFrame: 150, words: [{text: 'hello'}]}]};
  const base = {source: {fps: 30}, captions: {visible: true}, scenes: [{family: 'glide-card', layout: 'takeover', fromFrame: 30, durationInFrames: 30},
    {family: 'creator-cta', layout: 'takeover', fromFrame: 90, durationInFrames: 30}]};
  assert.deepEqual(visibleCaptionTruth(base, group).map(t => [t.start, t.end]), [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(visibleCaptionTruth({...base, contentMode: 'graphics'}, group), []);
  const layered = {...base, scenes: [{family: 'layered-speaker', layout: 'takeover', fromFrame: 0, durationInFrames: 150}]};
  assert.deepEqual(visibleCaptionTruth(layered, group).map(t => [t.start, t.end]), [[0, 5]]);
  assert.throws(() => visibleCaptionTruth({...base, style: 'magazine-interview', transitions: [{atFrame: 30}]}, group), /cannot be verified/);
});

function storedTruth() {
  const slug = 'truth-boundaries', base = path.join(ROOT, 'Projects', slug), at = f => path.join(base, f);
  const m = {source: {fps: 30}, scenes: [], camera: [], captions: {visible: false}, sounds: [{atFrame: 30, recipe: 'pop-one', gain: .5}]};
  const c = {durationInFrames: 300, segments: [{editFrom: 0}], captionGroups: []}, videoHash = 'a'.repeat(64), stemHash = 'b'.repeat(64);
  const stem = at('prepared/sounds.wav');
  const data = {
    'prepared/preparation.json': {manifestHash: digest(m), hits: 1, durationInFrames: 300, fps: 30,
      sfxFile: stem, outputs: [{path: stem, sha256: stemHash}]},
    'prepared/sounds.hits.json': [{t: 1, sound: 'pop', gain: .5}],
    'renders/edit-delivery.mp4.qc.json': {ok: true, mode: 'deliver', outputSha256: videoHash, inputProps: {edit: m},
      sfx: {stem, mix: {ok: true, sources: {sfx: {path: stem, sha256: stemHash}}, stems: {sfx: {status: 'mixed'}}}}},
  };
  const deps = {exists: async file => path.basename(file) !== 'audio.json', readJson: async file => structuredClone(data[path.relative(base, file).split(path.sep).join('/')]),
    loadProject: async () => ({manifest: structuredClone(m), compiled: structuredClone(c)}),
    readDir: async () => Object.keys(data).filter(f => f.startsWith('renders/')).map(f => path.basename(f).replace(/\.qc\.json$/u, '')),
    hashFile: async file => file.endsWith('.wav') ? stemHash : videoHash,
    probe: async () => ({format: {duration: '10'}, streams: [{codec_type: 'video', width: 1080, height: 1920}]}),
    recipe: async () => ({duration: .1, hits: [{t: 0, sound: 'pop', gain: 1}]})};
  return {slug, data, deps, m, c, qc: data['renders/edit-delivery.mp4.qc.json']};
}

function checkedRender(s, file, mode, {edit = s.m, ok = true} = {}) {
  const qc = {...structuredClone(s.qc), mode, ok, inputProps: {edit: structuredClone(edit)}};
  s.data[`renders/${file}.qc.json`] = qc;
  return qc;
}

test('a matching preview alone is eligible and identifies the probed render', async () => {
  const s = storedTruth();
  checkedRender(s, 'edit-preview.mp4', 'preview');
  delete s.data['renders/edit-delivery.mp4.qc.json'];
  const got = await loadOwnRenderTruth(s.slug, s.deps);
  assert.equal(got.eligible, true, got.reason);
  assert.deepEqual(got.render, {file: 'edit-preview.mp4', mode: 'preview', width: 1080, height: 1920, sha256: 'a'.repeat(64)});
  assert.ok(got.video.endsWith(path.join('renders', 'edit-preview.mp4')));
});

test('render selection prioritizes mode then file name, independently of directory order or timestamps', async () => {
  for (const mode of ['deliver', 'review']) {
    const s = storedTruth();
    delete s.data['renders/edit-delivery.mp4.qc.json'];
    checkedRender(s, 'a-preview.mp4', 'preview');
    checkedRender(s, 'preferred.mp4', mode);
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, true, got.reason); assert.equal(got.render.file, 'preferred.mp4');
  }
  const s = storedTruth();
  checkedRender(s, 'z-last.mp4', 'deliver');
  checkedRender(s, 'a-first.mp4', 'deliver');
  // Selection must not consult the filesystem clock, even if a caller supplies it.
  s.deps.stat = async () => { throw new Error('mtime must not influence selection'); };
  for (const order of [['z-last.mp4', 'edit-delivery.mp4', 'a-first.mp4'], ['a-first.mp4', 'edit-delivery.mp4', 'z-last.mp4']]) {
    s.deps.readDir = async () => order;
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, true, got.reason); assert.equal(got.render.file, 'a-first.mp4');
  }
});

test('a stale edit is skipped before ranking the renders that match the current edit', async () => {
  const s = storedTruth();
  checkedRender(s, 'a-stale.mp4', 'deliver', {edit: {...s.m, id: 'old-edit'}});
  const got = await loadOwnRenderTruth(s.slug, s.deps);
  assert.equal(got.eligible, true, got.reason); assert.equal(got.render.file, 'edit-delivery.mp4');
  assert.deepEqual(got.skipped, [{file: 'a-stale.mp4', mode: 'deliver', reason: 'render was made from another edit'}]);
  s.data['renders/edit-delivery.mp4.qc.json'].inputProps.edit = {};
  assert.equal((await loadOwnRenderTruth(s.slug, s.deps)).reason, 'no checked render matches the current edit');
});

test('draft, missing mode, failed QC, absent QC and absent renders are never candidates', async () => {
  for (const {mode, ok, reason} of [
    {mode: 'draft', ok: true, reason: 'QC mode draft is not supported'},
    {mode: undefined, ok: true, reason: 'QC mode is missing or invalid'},
    {mode: 'preview', ok: false, reason: 'QC not ok'},
    {mode: 'draft', ok: false, reason: 'QC not ok; QC mode draft is not supported'},
  ]) {
    const s = storedTruth(); delete s.data['renders/edit-delivery.mp4.qc.json'];
    checkedRender(s, 'unusable.mp4', mode, {ok});
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.match(got.reason, /^no checked render/);
    assert.deepEqual(got.skipped, [{file: 'unusable.mp4', mode: mode ?? null, reason}]);
    checkedRender(s, 'backup.mp4', 'review');
    const eligible = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(eligible.eligible, true, eligible.reason); assert.equal(eligible.render.file, 'backup.mp4');
    assert.deepEqual(eligible.skipped, got.skipped);
  }
  const s = storedTruth(); s.deps.readDir = async () => ['unchecked.mp4'];
  s.deps.exists = async file => !file.endsWith('.qc.json');
  assert.match((await loadOwnRenderTruth(s.slug, s.deps)).reason, /^no checked render/);
  s.deps.readDir = async () => { throw Object.assign(new Error('missing'), {code: 'ENOENT'}); };
  assert.match((await loadOwnRenderTruth(s.slug, s.deps)).reason, /^no checked render/);
});

test('renders without a verified mix are refused and a fully checked fallback records their reasons', async () => {
  for (const [file, mode] of [['chain-final.mp4', 'review'], ['draft.mp4', 'preview'], ['v3-video.mp4', 'review']]) {
    const s = storedTruth(); delete s.data['renders/edit-delivery.mp4.qc.json'];
    delete checkedRender(s, file, mode).sfx.mix;
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, false);
    assert.ok(got.reason.startsWith(`${file} (${mode}):`), got.reason);
    assert.match(got.reason, /rendered stem provenance is missing or changed/);
    assert.deepEqual(got.skipped, [{file, mode, reason: 'rendered stem provenance is missing or changed'}]);
    checkedRender(s, 'z-fallback.mp4', 'preview');
    const fallback = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(fallback.eligible, true, fallback.reason);
    assert.equal(fallback.render.file, 'z-fallback.mp4');
    assert.deepEqual(fallback.skipped, got.skipped);
  }
});

test('every render kind below the edit canvas receives a lower-resolution text note', async () => {
  for (const [mode, width, height, note] of [
    ['preview', 540, 960, true], ['preview', 1078, 1920, true], ['preview', 1080, 1918, true],
    ['preview', 1080, 1920, false], ['preview', 2160, 3840, false], ['review', 540, 960, true], ['deliver', 540, 960, true],
    ['review', 1080, 1920, false], ['deliver', 1080, 1920, false],
  ]) {
    const s = storedTruth(); s.qc.mode = mode;
    s.deps.probe = async () => ({format: {duration: '10'}, streams: [{codec_type: 'video', width, height}]});
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, true, got.reason);
    assert.equal(got.notes.some(n => n.includes('text reading')), note);
    assert.deepEqual([got.render.width, got.render.height], [width, height]);
  }
});

test('the chosen preview QC is reverified and missing video dimensions fail closed', async () => {
  const s = storedTruth(); checkedRender(s, 'edit-preview.mp4', 'preview'); delete s.data['renders/edit-delivery.mp4.qc.json'];
  checkedRender(s, 'z-fallback.mp4', 'preview');
  const read = s.deps.readJson; let reads = 0;
  s.deps.readJson = async file => {
    const value = await read(file);
    if (file.endsWith('edit-preview.mp4.qc.json') && ++reads > 1) value.mode = 'review';
    return value;
  };
  assert.match((await loadOwnRenderTruth(s.slug, s.deps)).reason, /edit-preview\.mp4.*changed during verification/);
  const missing = storedTruth(); missing.deps.probe = async () => ({format: {duration: '10'}});
  assert.match((await loadOwnRenderTruth(missing.slug, missing.deps)).reason, /dimensions could not be verified/);
});

test('only named render-specific hash, mix, duration and dimension failures try the next checked render', async () => {
  for (const [mutate, reason] of [
    [s => { s.qc.outputSha256 = 'c'.repeat(64); }, /does not match its check record/],
    [s => { s.qc.sfx.mix.stems.sfx.status = 'silent_bypassed'; }, /mix does not match/],
    [s => { s.deps.probe = async file => ({format: {duration: file.endsWith('edit-delivery.mp4') ? '9' : '10'}, streams: [{codec_type: 'video', width: 1080, height: 1920}]}); }, /length differs/],
    [s => { s.deps.probe = async file => ({format: {duration: '10'}, streams: file.endsWith('edit-delivery.mp4') ? [] : [{codec_type: 'video', width: 1080, height: 1920}]}); }, /dimensions could not/],
  ]) {
    const s = storedTruth(); checkedRender(s, 'backup.mp4', 'preview'); mutate(s);
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, true, got.reason); assert.equal(got.render.file, 'backup.mp4');
    assert.equal(got.skipped.length, 1); assert.equal(got.skipped[0].file, 'edit-delivery.mp4');
    assert.match(got.skipped[0].reason, reason);
  }
});

test('unexpected hash and probe errors stop verification without trying a fallback', async () => {
  for (const failure of ['EBUSY', 'EPERM', 'probe-crash']) {
    const s = storedTruth(); checkedRender(s, 'backup.mp4', 'preview');
    const hash = s.deps.hashFile, attempted = [];
    s.deps.hashFile = async file => {
      if (file.endsWith('.mp4')) {
        attempted.push(path.basename(file));
        if (failure !== 'probe-crash') throw Object.assign(new Error(`${failure}: file locked`), {code: failure});
      }
      return hash(file);
    };
    if (failure === 'probe-crash') s.deps.probe = async () => { throw new Error('ffprobe crashed'); };
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, false);
    assert.match(got.reason, /edit-delivery\.mp4 \(deliver\): truth could not be verified:/);
    assert.ok(got.reason.includes(failure === 'probe-crash' ? 'ffprobe crashed' : failure));
    assert.deepEqual(attempted, ['edit-delivery.mp4']); assert.deepEqual(got.skipped, []);
  }
});

test('shared hit, recipe and prepared-stem failures stop the project before trying any render', async () => {
  for (const [mutate, reason] of [
    [s => { s.data['prepared/preparation.json'].hits = 2; }, /hits do not match/],
    [s => { s.data['prepared/sounds.hits.json'][0].t = 2; }, /hit content differs/],
    [s => { s.deps.recipe = async () => { throw new Error('recipe unreadable'); }; }, /recipe unreadable/],
    [s => { delete s.data['prepared/preparation.json'].outputs; }, /prepared stem provenance/],
  ]) {
    const s = storedTruth(); checkedRender(s, 'backup.mp4', 'preview'); mutate(s);
    const hash = s.deps.hashFile, videos = [];
    s.deps.hashFile = async file => { if (file.endsWith('.mp4')) videos.push(file); return hash(file); };
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, false); assert.match(got.reason, reason);
    assert.deepEqual(videos, []); assert.deepEqual(got.skipped, []);
  }
});

test('shared or render changes during verification forbid fallback, even after a render-specific failure', async () => {
  for (const change of ['preparation', 'qc', 'video']) {
    const s = storedTruth(); checkedRender(s, 'backup.mp4', 'preview');
    const hash = s.deps.hashFile, read = s.deps.readJson, videos = []; let reads = 0, hashes = 0;
    s.deps.hashFile = async file => {
      if (file.endsWith('.mp4')) {
        videos.push(path.basename(file));
        if (change === 'video' && ++hashes > 1) return 'c'.repeat(64);
      }
      return hash(file);
    };
    if (change === 'preparation' || change === 'qc') {
      delete s.qc.sfx.mix;
      s.deps.readJson = async file => {
        const value = await read(file);
        if (file.endsWith(change === 'preparation' ? 'preparation.json' : 'edit-delivery.mp4.qc.json') && ++reads > 1) value.changed = true;
        return value;
      };
    }
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, false); assert.match(got.reason, /render truth changed during verification/);
    assert.ok(videos.every(file => file === 'edit-delivery.mp4')); assert.deepEqual(got.skipped, []);
  }
});

test('corrupt QC records are recorded with unknown mode, both with a usable render and alone', async () => {
  for (const usable of [true, false]) {
    const s = storedTruth(), read = s.deps.readJson;
    s.deps.readDir = async () => usable ? ['broken.mp4', 'edit-delivery.mp4'] : ['broken.mp4'];
    s.deps.readJson = async file => {
      if (file.endsWith('broken.mp4.qc.json')) throw new SyntaxError('Unexpected end of JSON input');
      return read(file);
    };
    const got = await loadOwnRenderTruth(s.slug, s.deps);
    assert.equal(got.eligible, usable, got.reason);
    assert.deepEqual(got.skipped, [{file: 'broken.mp4', mode: null, reason: 'QC record could not be read: Unexpected end of JSON input'}]);
  }
  const s = storedTruth(); s.data['renders/edit-delivery.mp4.qc.json'] = null;
  const got = await loadOwnRenderTruth(s.slug, s.deps);
  assert.equal(got.eligible, false); assert.equal(got.skipped[0].reason, 'QC record is not an object');
});

test('candidate listings retain render identity and short ineligible reasons', async t => {
  const root = await fsp.mkdtemp(path.join(PROJECT_TMP, 'truth-candidates-'));
  t.after(() => fsp.rm(root, {recursive: true, force: true}));
  for (const slug of ['preview-only', 'unchecked', 'not-an-edit']) await fsp.mkdir(path.join(root, 'Projects', slug), {recursive: true});
  const s = storedTruth(); checkedRender(s, 'backup.mp4', 'preview'); delete s.qc.sfx.mix;
  const eligible = await loadOwnRenderTruth(s.slug, s.deps);
  const got = await listOwnRenderCandidates({root, load: async (slug, options) => {
    assert.equal(options.root, root);
    return slug === 'preview-only' ? {...eligible, slug} : {slug, eligible: false,
      reason: slug === 'not-an-edit' ? 'missing edit.json' : 'no checked render (deliver, review or preview)',
      skipped: [{file: 'broken.mp4', mode: null, reason: 'corrupt QC'}]};
  }});
  assert.deepEqual(got.map(r => r.slug), ['preview-only', 'unchecked']);
  assert.deepEqual(got[0].render, eligible.render);
  assert.deepEqual(got[0].skipped, eligible.skipped);
  assert.equal(got[1].reason, 'no checked render (deliver, review or preview)');
  assert.deepEqual(got[1].skipped, [{file: 'broken.mp4', mode: null, reason: 'corrupt QC'}]);
});

test('own-render loader verifies hit content and stem linkage using injected tool boundaries', async () => {
  const s = storedTruth(), got = await loadOwnRenderTruth(s.slug, s.deps);
  assert.equal(got.eligible, true, got.reason);
  assert.deepEqual(got.truth.sound.sfx, [{t: 1, type: 'pop'}]);
  for (const mutation of [
    x => { x.data['prepared/sounds.hits.json'][0] = {t: 2, sound: 'impact', gain: .5}; },
    x => { delete x.data['prepared/preparation.json'].outputs; },
    x => { x.data['renders/edit-delivery.mp4.qc.json'].sfx.mix.sources.sfx.sha256 = 'c'.repeat(64); },
    x => { x.data['renders/edit-delivery.mp4.qc.json'].sfx.mix.sources.sfx.path = 'other.wav'; },
    x => { x.data['renders/edit-delivery.mp4.qc.json'].sfx.mix.stems.sfx.status = 'silent_bypassed'; },
    x => { x.data['renders/edit-delivery.mp4.qc.json'].outputSha256 = 'c'.repeat(64); },
    x => { x.data['renders/edit-delivery.mp4.qc.json'].inputProps.edit = {}; },
    x => { x.data['prepared/preparation.json'].fps = 60; },
    x => { x.deps.probe = async () => ({format: {duration: '9'}}); },
    x => { x.deps.recipe = async () => { throw new Error('recipe unreadable'); }; },
  ]) {
    const sample = storedTruth(); mutation(sample);
    const refused = await loadOwnRenderTruth(sample.slug, sample.deps);
    assert.equal(refused.eligible, false, JSON.stringify(refused)); assert.ok(refused.reason);
  }
});

test('loader excludes uncertain caption visibility and changing provenance rather than ignoring errors', async () => {
  const s = storedTruth(); s.m.captions.visible = true; s.m.fontFamily = 'Cairo';
  s.c.captionGroups = [{fromFrame: 0, toFrame: 30, words: [{text: 'hello'}]}];
  s.data['prepared/preparation.json'].manifestHash = digest(s.m);
  assert.match((await loadOwnRenderTruth(s.slug, s.deps)).reason, /caption fitting/);
  const changing = storedTruth(); let reads = 0;
  const read = changing.deps.readJson;
  changing.deps.readJson = async file => { const value = await read(file); if (file.endsWith('preparation.json') && ++reads > 1) value.hits++; return value; };
  assert.match((await loadOwnRenderTruth(changing.slug, changing.deps)).reason, /changed during/);
});


test('fully hidden captions do not require font metrics or transition visibility to prove absence', () => {
  const m = {source: {fps: 30}, style: 'grid-glide', fontFamily: 'Cairo', captions: {visible: true}, transitions: [{atFrame: 0}],
    scenes: [{family: 'glide-card', fromFrame: 0, durationInFrames: 60, layout: 'takeover'}]};
  assert.deepEqual(visibleCaptionTruth(m, {durationInFrames: 60, captionGroups: [{fromFrame: 0, toFrame: 60, words: [{text: 'hidden'}]}]}), []);
});
