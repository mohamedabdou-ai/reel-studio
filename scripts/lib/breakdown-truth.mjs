import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {ROOT} from './project-paths.mjs';
import {digest} from './job-paths.mjs';
import {sha256File} from './studio-download.mjs';
import {captionOverlayVisible, captionHiddenByScene} from '../../engine/src/prepared-edit/visibility.ts';
import {displayDigitList} from '../../engine/src/core/digits.ts';
import {ffprobeJson} from './media.mjs';

export function sfxTypeOf(sound) {
  const s = String(sound).replace(/^sample:/u, '').toLowerCase();
  if (/^(impact|sub|landing)/u.test(s)) return 'impact';
  if (/^pop/u.test(s)) return 'pop';
  if (/^(click|tick|keytap|mouseclick|uiclick|type)/u.test(s)) return 'click';
  if (/^chime/u.test(s)) return 'ding';
  if (/^(riser|airrise)/u.test(s)) return 'riser';
  if (/^(whoosh|swipe|airpass)/u.test(s)) return 'whoosh';
  return 'hit';
}

const r3 = v => Math.round(v * 1000) / 1000;
export function visibleCaptionTruth(manifest, compiled) {
  if (!captionOverlayVisible({...manifest, captions: manifest.captions ?? {}})) return [];
  const groups = compiled.captionGroups ?? [];
  if (!groups.length) return [];
  const total = compiled.durationInFrames, fps = manifest.source.fps, scenes = manifest.scenes ?? [], text = [];
  for (const g of groups) {
    if (!Number.isInteger(g.fromFrame) || !Number.isInteger(g.toFrame) || g.fromFrame < 0 || g.toFrame > total || g.toFrame <= g.fromFrame || !Array.isArray(g.words))
      throw new Error('invalid caption interval');
    let start = null;
    const push = end => { if (start !== null) text.push({text: displayDigitList(g.words.map(w => w.text.trim()), manifest.digits).join(' '),
      start: r3(start / fps), end: r3(end / fps), zone: null, fill: null, stroke: null, box: null, entrance: null}); start = null; };
    for (let f = g.fromFrame; f < g.toFrame; f++) {
      const scene = scenes.find(s => f >= s.fromFrame && f < s.fromFrame + s.durationInFrames);
      const visible = scene?.family !== 'creator-cta' && !captionHiddenByScene(scene);
      if (visible && start === null) start = f;
      else if (!visible) push(f);
    }
    push(g.toFrame);
  }
  // These paths can change the displayed cue or hide it using theme/font metrics.
  // Exclude the candidate instead of silently guessing which words were painted.
  if (text.length && (manifest.transitions?.length || manifest.layoutTransitions?.length) && manifest.style)
    throw new Error('caption visibility during themed transitions cannot be verified');
  if (text.length && (manifest.fontFamily || manifest.captions?.emphasis?.some(e => e.kind === 'stretch')))
    throw new Error('caption fitting with font overrides or stretching cannot be verified');
  return text;
}
export function ownRenderTruth({manifest, compiled, hits, bed}) {
  const fps = manifest.source.fps, total = compiled.durationInFrames;
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isInteger(total) || total <= 0) throw new Error('Invalid compiled duration or fps.');
  const scenes = (manifest.scenes ?? []).map(s => ({from: s.fromFrame, to: s.fromFrame + s.durationInFrames, layout: s.layout}));
  const moves = [...(manifest.transitions ?? []).map(t => ({from: t.atFrame, to: t.atFrame + t.durationInFrames, kind: t.kind, dir: t.dir ?? null, layout: false})),
    ...(manifest.layoutTransitions ?? []).map(t => ({from: t.atFrame, to: t.atFrame + t.durationInFrames, kind: t.kind, dir: null, layout: true}))];
  const ignore = [];
  const window = (a, b) => { if (b > a) ignore.push({start: r3(Math.max(0, a) / fps), end: r3(Math.min(total, b) / fps)}); };
  for (const s of scenes) window(s.from + 3, s.to - 3);
  for (const s of scenes) if (s.layout !== 'takeover') { window(s.from - 3, s.from + 3); window(s.to - 3, s.to + 3); }
  for (const m of moves) if (m.layout) window(m.from - 3, m.to + 3);
  const keys = [...(manifest.camera ?? [])].sort((a, b) => a.atFrame - b.atFrame);
  for (let i = 1; i < keys.length; i++) if (keys[i].atFrame - keys[i - 1].atFrame <= 2 && keys[i].scale !== keys[i - 1].scale) window(keys[i].atFrame - 3, keys[i].atFrame + 3);
  if (Number.isFinite(manifest.signoffFromFrame)) window(manifest.signoffFromFrame - 3, total);
  const inMove = f => moves.some(m => f >= m.from - 2 && f <= m.to + 2);
  const insideScene = f => scenes.some(s => f > s.from + 2 && f < s.to - 2);
  const underTakeover = f => scenes.some(s => s.layout === 'takeover' && f >= s.from && f <= s.to);
  const cuts = [];
  const add = (f, kind) => { if (f > 0 && f < total && !inMove(f) && !cuts.some(c => Math.abs(c.f - f) <= 2)) cuts.push({f, kind}); };
  for (const s of scenes) if (s.layout === 'takeover') { add(s.from, 'cut'); add(s.to, 'cut'); }
  for (const seg of compiled.segments.slice(1)) if (!insideScene(seg.editFrom) && !underTakeover(seg.editFrom)) add(seg.editFrom, 'jump');
  cuts.sort((a, b) => a.f - b.f);
  const sfx = [];
  for (const h of hits.filter(h => (h.gain ?? 1) > 0).sort((a, b) => a.t - b.t)) {
    const last = sfx.at(-1), gain = h.gain ?? 1;
    if (last && h.t - last.t <= 0.08) { if (gain > last.gain) Object.assign(last, {type: sfxTypeOf(h.sound), gain}); continue; }
    sfx.push({t: r3(h.t), type: sfxTypeOf(h.sound), gain});
  }
  const text = visibleCaptionTruth(manifest, compiled);
  return {fps, durationSec: r3(total / fps), source: 'own-render', textScope: 'captions-only', cuts: cuts.map(c => ({t: r3(c.f / fps), kind: c.kind})),
    transitions: moves.filter(m => !m.layout).map(m => ({start: r3(m.from / fps), end: r3(m.to / fps), kind: 'other', studioKind: m.kind, direction: m.dir})),
    camera: [], text, ignore, sound: {bed, bpm: null, sfx: sfx.map(({t, type}) => ({t, type}))}};
}


const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const RENDER_MODES = ['deliver', 'review', 'preview'];
export async function loadOwnRenderTruth(slug, {hashFile = sha256File, probe = ffprobeJson,
  loadProject, readJson = async file => JSON.parse(await fsp.readFile(file, 'utf8')),
  readDir = dir => fsp.readdir(dir),
  exists = async file => { try { await fsp.access(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } },
  recipe, root = ROOT} = {}) {
  if (!SLUG.test(slug)) return {slug, eligible: false, reason: 'invalid project name'};
  let selected;
  const skipped = [];
  const base = path.join(root, 'Projects', slug), at = f => path.join(base, f);
  const fail = reason => ({slug, eligible: false, reason: selected ? `${selected.file} (${selected.qc.mode}): ${reason}` : reason, skipped});
  try {
    if (!await exists(at('edit.json'))) return fail('missing edit.json');
    const checked = [];
    const files = await readDir(at('renders')).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const file of files.filter(f => /\.mp4$/iu.test(f)).sort()) {
      const qcFile = at(`renders/${file}.qc.json`);
      if (!await exists(qcFile)) continue;
      let qc;
      try { qc = await readJson(qcFile); } catch (e) {
        if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e;
        skipped.push({file, mode: null, reason: 'QC record could not be read: ' + e.message});
        continue;
      }
      if (qc === null || typeof qc !== 'object' || Array.isArray(qc)) {
        skipped.push({file, mode: null, reason: 'QC record is not an object'});
        continue;
      }
      const mode = typeof qc.mode === 'string' ? qc.mode : null;
      if (qc.ok !== true || !RENDER_MODES.includes(mode)) {
        const reasons = [];
        if (qc.ok !== true) reasons.push('QC not ok');
        if (!RENDER_MODES.includes(mode)) reasons.push(mode === null ? 'QC mode is missing or invalid' : `QC mode ${mode} is not supported`);
        skipped.push({file, mode, reason: reasons.join('; ')});
        continue;
      }
      checked.push({file, qcFile, qc});
    }
    if (!checked.length) return fail('no checked render (deliver, review or preview)');
    for (const f of ['prepared/preparation.json', 'prepared/sounds.hits.json', 'prepared/sounds.wav'])
      if (!await exists(at(f))) return fail('missing ' + f);
    const load = loadProject ?? (await import('./edit-project.mjs')).loadEditProject;
    const {manifest, compiled} = await load('Projects/' + slug + '/edit.json', {verifySource: false});
    const preparation = await readJson(at('prepared/preparation.json')), hits = await readJson(at('prepared/sounds.hits.json'));
    const fps = manifest.source.fps, duration = compiled.durationInFrames / fps;
    if (preparation.manifestHash !== digest(manifest)) return fail('edit changed after the last preparation');
    if (preparation.fps !== fps || preparation.durationInFrames !== compiled.durationInFrames) return fail('preparation duration or fps differs from the edit');
    const matching = checked.filter(r => {
      if (r.qc.inputProps?.edit && digest(r.qc.inputProps.edit) === preparation.manifestHash) return true;
      skipped.push({file: r.file, mode: r.qc.mode, reason: 'render was made from another edit'});
      return false;
    });
    // File names are stable across copies/restores; filesystem timestamps are not.
    matching.sort((a, b) => RENDER_MODES.indexOf(a.qc.mode) - RENDER_MODES.indexOf(b.qc.mode)
      || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    if (!matching.length) return fail('no checked render matches the current edit');
    // Shared preparation failures invalidate every render, so verify them once
    // before trying any render and never classify them as fallback reasons.
    if (!Array.isArray(hits) || hits.length !== preparation.hits) return fail('sound hits do not match the preparation');
    const getRecipe = recipe ?? (await import('./job-sound.mjs')).soundRecipe, expected = [];
    for (const event of manifest.sounds ?? []) {
      const r = await getRecipe(event.recipe), t = event.atFrame / fps;
      if (t + r.duration > (manifest.signoffFromFrame ?? compiled.durationInFrames) / fps + 1e-7) return fail('recipe crosses the signoff or edit end');
      expected.push(...r.hits.map(hit => ({...hit, t: hit.t + t, gain: (hit.gain ?? 1) * event.gain})));
    }
    if (digest(hits) !== digest(expected)) return fail('sound hit content differs from manifest recipes');
    for (const h of hits) if (!Number.isFinite(h.t) || h.t < 0 || h.t >= duration || !Number.isFinite(h.gain) || h.gain < 0 || typeof h.sound !== 'string') return fail('invalid sound hit');
    const stem = at('prepared/sounds.wav'), stemHash = await hashFile(stem), resolve = value => typeof value === 'string' ? path.resolve(root, value).toLowerCase() : null;
    const snapshot = preparation.outputs?.find(o => resolve(o.path) === resolve(stem));
    if (!stemHash || !snapshot?.sha256 || snapshot.sha256 !== stemHash || resolve(preparation.sfxFile) !== resolve(stem)) return fail('prepared stem provenance is missing or changed');
    const hasMusicPlan = await exists(at('audio.json'));
    const truth = ownRenderTruth({manifest, compiled, hits, bed: hasMusicPlan ? null : false});
    const checkRender = async (qc, video) => {
      const result = {videoHash: await hashFile(video)};
      if (!qc.outputSha256 || qc.outputSha256 !== result.videoHash) return {...result, reason: 'render does not match its check record'};
      const mix = qc.sfx?.mix;
      if (resolve(qc.sfx?.stem) !== resolve(stem) || mix?.ok !== true || resolve(mix.sources?.sfx?.path) !== resolve(stem) || mix.sources?.sfx?.sha256 !== stemHash)
        return {...result, reason: 'rendered stem provenance is missing or changed'};
      const audible = hits.some(h => h.gain > 0), status = mix.stems?.sfx?.status;
      if (audible ? status !== 'mixed' : status !== 'silent_bypassed') return {...result, reason: 'rendered stem mix does not match the sound hits'};
      const probed = await probe(video), seconds = Number(probed?.format?.duration);
      if (!(Math.abs(seconds - duration) <= 2 / fps)) return {...result, reason: 'render length differs from the edit'};
      const stream = probed?.streams?.find(s => s.codec_type === 'video'), width = Number(stream?.width), height = Number(stream?.height);
      if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return {...result, reason: 'render video dimensions could not be verified'};
      return {...result, width, height};
    };
    for (const candidate of matching) {
      selected = candidate;
      const {qc, qcFile, file} = candidate, video = at(`renders/${file}`);
      // Only the explicit validation failures returned by checkRender may fall
      // back. Unexpected I/O/probe errors terminate through the outer catch.
      const result = await checkRender(qc, video);
      // Reverify shared inputs and this QC even after a render-specific failure.
      // Instability is fatal, never a reason to try another render.
      try {
        if (digest(await readJson(at('prepared/preparation.json'))) !== digest(preparation) || digest(await readJson(qcFile)) !== digest(qc)
          || digest(await readJson(at('prepared/sounds.hits.json'))) !== digest(hits) || await hashFile(stem) !== stemHash
          || (result.videoHash !== undefined && await hashFile(video) !== result.videoHash)
          || digest((await load('Projects/' + slug + '/edit.json', {verifySource: false})).manifest) !== preparation.manifestHash)
          return fail('render truth changed during verification');
      } catch { return fail('render truth changed during verification'); }
      if (result.reason) {
        skipped.push({file, mode: qc.mode, reason: result.reason});
        continue;
      }
      const {width, height} = result;
      const notes = hasMusicPlan ? ['audio.json present: the music bed of this render is not verified'] : [];
      // calculatePreparedMetadata fixes the edit canvas at 1080x1920, independently
      // of the source recording's size (engine/src/prepared-edit/PreparedEdit.tsx).
      if (width < 1080 || height < 1920)
        notes.push(`${qc.mode} render is ${width}x${height}, below the edit canvas 1080x1920; text reading can differ at lower resolution.`);
      return {slug, eligible: true, video, render: {file, mode: qc.mode, width, height, sha256: qc.outputSha256}, truth, notes, skipped};
    }
    return fail(skipped.at(-1).reason);
  } catch (e) { return fail('truth could not be verified: ' + e.message); }
}

export async function listOwnRenderCandidates({root = ROOT, load = loadOwnRenderTruth} = {}) {
  const out = [];
  const entries = await fsp.readdir(path.join(root, 'Projects'), {withFileTypes: true});
  for (const entry of entries) {
    if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
    const r = await load(entry.name, {root});
    if (r.reason === 'missing edit.json') continue;
    out.push(r.eligible ? {slug: r.slug, eligible: true, render: r.render, durationSec: r.truth.durationSec, cuts: r.truth.cuts.length, captions: r.truth.text.length, sfx: r.truth.sound.sfx.length, notes: r.notes, skipped: r.skipped ?? []}
      : {slug: r.slug, eligible: false, reason: r.reason, skipped: r.skipped ?? []});
  }
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.slug.localeCompare(b.slug));
}
