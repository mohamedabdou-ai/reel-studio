import './project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, run } from './media.mjs';
import { assertProjectOutput } from './project-paths.mjs';
import { checkedPath } from './job-paths.mjs';
import { footageFrameState } from '../../engine/src/prepared-edit/footage.ts';
import { footageVisibility, foregroundSourceFrame } from '../../engine/src/prepared-edit/visibility.ts';

export const HEAD_ENVELOPE_VERSION = 1;
export const HEAD_CACHE_DIR = path.join(ROOT, 'state', 'cache', 'head');

export const HEAD_PADDING = Object.freeze({
  blazeface: Object.freeze({ side: 0.25, above: 0.5, below: 0.35 }),
  rvm: Object.freeze({ side: 0.08, above: 0.05, below: 0.04 }),
});

export const HEAD_CHECK_DEFAULTS = Object.freeze({ scale: 0.25, minAlpha: 0.1, minAreaPx2: 16, stride: 1, concurrency: 3 });
export const HEAD_EXIT = Object.freeze({ PASS: 0, usage: 1, contract: 2, FAIL: 3, 'NEEDS-REVIEW': 4 });

export const MANIFEST_GEOMETRY_COMPS = Object.freeze(['PreparedEdit']);




export const ANALYSIS_WIDTH = 270;
export const RVM_OUT_WIDTH = 540;
export const ALPHA_THRESHOLD = 96;
const SHA256 = /^[a-f0-9]{64}$/;
const GEO_KEYS = ['windowTop', 'windowHeight', 'videoWidth', 'videoLeft', 'videoTop'];
const CUE_EXCLUDED = new Set(['trimBeforeFrame', 'sourceFromFrame']);
const unit = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;



export function envelopeFile(sha256) {
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) throw new Error('Head envelopes are keyed by a lowercase sha256');
  return path.join(HEAD_CACHE_DIR, `${sha256}.json`);
}

export function validateHeadEnvelope(value) {
  const fail = (message) => { throw new Error(`Invalid head envelope: ${message}`); };
  if (!value || typeof value !== 'object') fail('not an object');
  if (value.version !== HEAD_ENVELOPE_VERSION) fail('version must be 1');
  const s = value.source;
  if (!s || typeof s.path !== 'string' || !s.path || typeof s.sha256 !== 'string' || !SHA256.test(s.sha256)) fail('source path/sha256');
  if (!Number.isInteger(s.width) || s.width < 2 || !Number.isInteger(s.height) || s.height < 2) fail('source width/height');
  if (typeof s.fps !== 'number' || !(s.fps > 0 && s.fps <= 240)) fail('source fps');
  if (!['rvm', 'blazeface', 'none'].includes(value.method)) fail(`method ${value.method}`);
  if (!Array.isArray(value.samples)) fail('samples must be an array');
  if (value.method !== 'none' && !value.samples.length) fail('a detected envelope needs samples');
  let last = -1;
  for (const sample of value.samples) {
    if (!sample || !Number.isInteger(sample.frame) || sample.frame <= last) fail('sample frames must be strictly increasing integers');
    last = sample.frame;
    if (!unit(sample.confidence)) fail(`confidence at frame ${sample.frame}`);
    const b = sample.box;
    if (b === null) continue;
    if (value.method === 'none') fail('method none cannot carry boxes');
    if (!b || typeof b !== 'object' || ![b.x, b.y, b.width, b.height].every(unit) || b.width <= 0 || b.height <= 0
      || b.x + b.width > 1 + 1e-9 || b.y + b.height > 1 + 1e-9) fail(`box at frame ${sample.frame}`);
  }
  return value;
}

export async function readHeadEnvelope(sha256) {
  const file = envelopeFile(sha256);
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const envelope = validateHeadEnvelope(JSON.parse(text));
  if (envelope.source.sha256 !== sha256) throw new Error(`Head envelope ${path.relative(ROOT, file)} belongs to another source`);
  return envelope;
}



export function padHeadBox(box, method) {
  const pad = HEAD_PADDING[method];
  if (!pad) throw new Error(`No head padding for method ${method}`);
  const left = Math.max(0, box.x - pad.side * box.width);
  const top = Math.max(0, box.y - pad.above * box.height);
  const right = Math.min(1, box.x + box.width + pad.side * box.width);
  const bottom = Math.min(1, box.y + box.height + pad.below * box.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}







export function headBoxFromAlpha(alpha, width, height, { threshold = ALPHA_THRESHOLD } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || alpha?.length !== width * height) {
    throw new Error(`Alpha buffer is ${alpha?.length} bytes, expected ${width}x${height}`);
  }
  const minRun = Math.max(2, Math.round(width * 0.01));
  const span = (y) => {
    let best = null, start = -1;
    const row = y * width;
    for (let x = 0; x <= width; x++) {
      const on = x < width && alpha[row + x] >= threshold;
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        if (!best || x - start > best[1] - best[0] + 1) best = [start, x - 1];
        start = -1;
      }
    }
    return best && best[1] - best[0] + 1 >= minRun ? best : null;
  };
  let crown = -1;
  for (let y = 0; y < height && crown < 0; y++) if (span(y)) crown = y;
  if (crown < 0) return null;
  let left = width, right = -1, maxW = 0, headW = 0, neck = -1, shoulder = -1, capped = false;
  for (let y = crown; y < height; y++) {
    const s = span(y);
    if (!s) { if (neck >= 0) { shoulder = y; capped = true; } break; }
    const w = s[1] - s[0] + 1;
    if (neck < 0) {
      if (maxW > 0 && w < 0.92 * maxW && y - crown >= 0.5 * maxW) { neck = y; headW = maxW; }
      else { maxW = Math.max(maxW, w); left = Math.min(left, s[0]); right = Math.max(right, s[1]); continue; }
    }
    if (w >= 1.35 * headW) { shoulder = y; break; }
    left = Math.min(left, s[0]);
    right = Math.max(right, s[1]);
    if (y - crown >= 2.6 * headW) { shoulder = y + 1; capped = true; break; }
  }
  if (neck >= 0 && shoulder < 0) { shoulder = height; capped = true; }
  if (neck < 0 || shoulder <= crown) return null;
  return {
    box: { x: left / width, y: crown / height, width: (right - left + 1) / width, height: (shoulder - crown) / height },
    confidence: capped ? 0.6 : 0.9,
    rows: { crown, neck, shoulder },
  };
}

const unionBox = (a, b) => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};


export function headBoxAt(envelope, sourceFrame) {
  const none = (reason) => ({ box: null, confidence: 0, reason });
  if (!envelope || envelope.method === 'none' || !envelope.samples?.length) return none('no-envelope');
  const s = envelope.samples;
  const single = (sample) => (sample.box ? { box: sample.box, confidence: sample.confidence, reason: null } : none('null-sample'));
  const last = s.length - 1;
  if (sourceFrame < s[0].frame) {
    return s.length > 1 && s[0].frame - sourceFrame <= s[1].frame - s[0].frame ? single(s[0]) : none('outside-envelope');
  }
  if (sourceFrame >= s[last].frame) {
    if (sourceFrame === s[last].frame) return single(s[last]);
    return s.length > 1 && sourceFrame - s[last].frame <= s[last].frame - s[last - 1].frame ? single(s[last]) : none('outside-envelope');
  }
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].frame <= sourceFrame) lo = mid; else hi = mid; }
  if (s[lo].frame === sourceFrame) return single(s[lo]);
  const a = s[lo], b = s[hi];
  if (!a.box || !b.box) return none('null-sample');
  return { box: unionBox(a.box, b.box), confidence: Math.min(a.confidence, b.confidence), reason: null };
}




export function mapHeadRect(box, geo, { sourceAspect, canvasWidth = 1080, canvasHeight = 1920 } = {}) {
  if (!box) return null;
  if (!(sourceAspect > 0)) throw new Error('mapHeadRect needs the plate aspect (height / width)');
  const videoHeight = Math.round(geo.videoWidth * sourceAspect);
  const x0 = geo.videoLeft + box.x * geo.videoWidth;
  const y0 = geo.windowTop + geo.videoTop + box.y * videoHeight;
  const x1 = x0 + box.width * geo.videoWidth;
  const y1 = y0 + box.height * videoHeight;
  const left = Math.max(0, Math.floor(x0));
  const right = Math.min(canvasWidth, Math.ceil(x1));
  const top = Math.max(0, geo.windowTop, Math.floor(y0));
  const bottom = Math.min(canvasHeight, geo.windowTop + geo.windowHeight, Math.ceil(y1));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}


export function headWindowCut(box, geo, { sourceAspect, canvasHeight = 1920 } = {}) {
  if (!box) return null;
  const videoHeight = Math.round(geo.videoWidth * sourceAspect);
  const y0 = geo.windowTop + geo.videoTop + box.y * videoHeight;
  const y1 = y0 + box.height * videoHeight;
  const windowBottom = geo.windowTop + geo.windowHeight;
  if (y1 <= geo.windowTop || y0 >= windowBottom) return null;
  if (geo.windowTop > 0 && y0 < geo.windowTop) return 'top';
  if (windowBottom < canvasHeight && y1 > windowBottom) return 'bottom';
  return null;
}




export function manifestFrameState(edit, frame, { aspect, splitCanvasHeight = null } = {}) {
  const active = edit.scenes.find((s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationInFrames) ?? null;
  if (!edit.footage && !(splitCanvasHeight > 0)) throw new Error('splitCanvasHeight is required when the manifest has no footage geometry');
  const f = footageFrameState(edit, frame, { aspect, canvasHeight: splitCanvasHeight ?? edit.footage.split.windowTop });
  return {
    sceneId: active?.id ?? null, family: active?.family ?? null, layout: f.layout, geo: f.geo,
    visible: footageVisibility(edit, frame, true), sourceFrame: foregroundSourceFrame(edit, frame),
    foregroundMatte: active?.family === 'kinetic-hook' && !!active.data?.foreground,
  };
}


export function normalizeGeometryFile(value) {
  const list = Array.isArray(value) ? value : value?.frames;
  if (!Array.isArray(list) || !list.length) throw new Error('Geometry file needs a non-empty frames array');
  const map = new Map();
  for (const row of list) {
    if (!Number.isInteger(row?.frame) || row.frame < 0 || map.has(row.frame)) throw new Error('Geometry frames must be unique non-negative integers');
    const geo = row.geo ?? null;
    if (geo !== null && (!GEO_KEYS.every((key) => Number.isFinite(geo[key])) || geo.windowHeight <= 0 || geo.videoWidth <= 0)) {
      throw new Error(`Geometry at frame ${row.frame} is incomplete`);
    }
    if (row.sourceFrame !== undefined && (!Number.isInteger(row.sourceFrame) || row.sourceFrame < 0)) {
      throw new Error(`Source frame at frame ${row.frame} must be a non-negative integer`);
    }
    map.set(row.frame, { geo: geo && Object.fromEntries(GEO_KEYS.map((key) => [key, geo[key]])), sourceFrame: row.sourceFrame ?? null });
  }
  return map;
}



function cueFrames(data, out = []) {
  if (Array.isArray(data)) { for (const item of data) cueFrames(item, out); return out; }
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (/Frame$/.test(key) && !CUE_EXCLUDED.has(key) && Number.isInteger(value) && value >= 0) out.push(value);
      else if (value && typeof value === 'object') cueFrames(value, out);
    }
  }
  return out;
}


export function headCheckLandings(edit, compiled) {
  const duration = compiled.durationInFrames;
  const map = new Map();
  const add = (frame, tag) => {
    const f = Math.round(frame);
    if (f < 0 || f >= duration) return;
    const tags = map.get(f) ?? [];
    if (!tags.includes(tag)) tags.push(tag);
    map.set(f, tags);
  };
  for (const word of compiled.words) add(word.fromFrame, 'word');
  for (const scene of edit.scenes) {
    add(scene.fromFrame - 1, 'scene-before');
    add(scene.fromFrame, 'scene-start');
    for (const d of [1, 3, 6, 12]) if (d < scene.durationInFrames) add(scene.fromFrame + d, 'scene-arrival');
    add(scene.fromFrame + scene.durationInFrames - 1, 'scene-end');
    for (const cue of cueFrames(scene.data)) for (const d of [0, 3, 6, 12]) if (cue + d < scene.durationInFrames) add(scene.fromFrame + cue + d, 'cue');
  }
  const cams = edit.camera ?? [];
  for (const key of cams) add(key.atFrame, 'camera');
  for (let i = 1; i < cams.length; i++) add((cams[i - 1].atFrame + cams[i].atFrame) / 2, 'camera');
  for (const t of edit.transitions ?? []) {
    add(t.atFrame, 'transition');
    add(t.atFrame + t.durationInFrames / 2, 'transition');
    add(t.atFrame + t.durationInFrames, 'transition');
  }
  if (edit.signoffFromFrame !== undefined) add(edit.signoffFromFrame, 'signoff');
  add(0, 'edge');
  add(duration - 1, 'edge');
  for (const tags of map.values()) tags.sort();
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}



function assertFrames(a, b, w, h) {
  if (a?.length !== w * h * 3 || b?.length !== w * h * 3) throw new Error(`probe frame size mismatch: expected ${w}x${h} rgb24`);
}

export function probeFrameStats(a, b, w, h, minAlpha) {
  assertFrames(a, b, w, h);
  const n = w * h;
  let identical = 0, painted = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
    if (d < 10) identical++;
    if (1 - d / 255 >= minAlpha) painted++;
  }
  return { identicalFraction: identical / n, paintedFraction: painted / n };
}


export function probeDiffInRect(a, b, w, h, rect, { scale, minAlpha }) {
  assertFrames(a, b, w, h);
  const x0 = Math.max(0, Math.floor(rect.x * scale)), x1 = Math.min(w, Math.ceil((rect.x + rect.width) * scale));
  const y0 = Math.max(0, Math.floor(rect.y * scale)), y1 = Math.min(h, Math.ceil((rect.y + rect.height) * scale));
  let count = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * w + x) * 3;
      const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
      if (1 - d / 255 < minAlpha) continue;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return {
    paintedPx2: Math.round(count / (scale * scale)),
    bbox: count ? { x: Math.round(minX / scale), y: Math.round(minY / scale), width: Math.round((maxX - minX + 1) / scale), height: Math.round((maxY - minY + 1) / scale) } : null,
  };
}



export function classifyHeadFrame({ geometryReason = null, visible, box, boxReason = null, headRect, windowCut = null, paintedPx2 = 0, minAreaPx2, foregroundMatte = false }) {
  if (geometryReason) return { status: 'NEEDS-REVIEW', reason: geometryReason };
  if (!visible) return { status: 'SKIPPED', reason: 'footage-hidden' };
  if (!box) return { status: 'NEEDS-REVIEW', reason: boxReason ?? 'no-envelope' };
  if (!headRect) return { status: 'HEAD-OFFSCREEN', reason: 'head-outside-window' };
  if (windowCut) return { status: 'FAIL', reason: 'head-cut-by-window' };
  if (paintedPx2 >= minAreaPx2) {
    return foregroundMatte ? { status: 'NEEDS-REVIEW', reason: 'behind-subject-matte' } : { status: 'FAIL', reason: 'graphic-in-head' };
  }
  return { status: 'PASS', reason: null };
}

export function overallHeadStatus(rows) {
  if (rows.some((row) => row.status === 'FAIL')) return 'FAIL';
  if (rows.some((row) => row.status === 'NEEDS-REVIEW')) return 'NEEDS-REVIEW';
  if (!rows.some((row) => row.status === 'PASS')) return 'NEEDS-REVIEW';
  return 'PASS';
}

export function pickSheetFrames(rows, { maxWorst = 8, maxVerify = 4 } = {}) {
  const byPaint = (a, b) => b.paintedPx2 - a.paintedPx2 || a.frame - b.frame;
  const worst = [
    ...rows.filter((row) => row.status === 'FAIL').sort(byPaint),
    ...rows.filter((row) => row.status === 'NEEDS-REVIEW' && row.headRect).sort(byPaint),
  ].slice(0, maxWorst).map((row) => ({ frame: row.frame, role: 'worst' }));
  const pass = rows.filter((row) => row.status === 'PASS');
  const words = pass.filter((row) => row.landing?.includes('word'));
  const pool = words.length ? words : pass;
  const count = Math.min(maxVerify, pool.length);
  const verify = [];
  for (let i = 0; i < count; i++) verify.push({ frame: pool[count === 1 ? 0 : Math.round((i * (pool.length - 1)) / (count - 1))].frame, role: 'verify' });
  const seen = new Set();
  return [...worst, ...verify].filter((pick) => (seen.has(pick.frame) ? false : (seen.add(pick.frame), true))).sort((a, b) => a.frame - b.frame);
}



export function matteDecodeArgs(stream) {
  const tags = Object.fromEntries(Object.entries(stream?.tags ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));

  if (stream?.codec_name === 'vp9' && tags.alpha_mode === '1') return { inputArgs: ['-c:v', 'libvpx-vp9'], filterPrefix: 'alphaextract,' };
  if (typeof stream?.pix_fmt === 'string' && /^(yuva|rgba|bgra|argb|abgr|gbrap|ya)/.test(stream.pix_fmt)) return { inputArgs: [], filterPrefix: 'alphaextract,' };
  return { inputArgs: [], filterPrefix: '' };
}

export function matteMatches(stream, identity) {
  const aspect = identity.width / identity.height;
  return Number(stream?.nb_read_packets) === identity.totalFrames && stream.width > 0 && stream.height > 0
    && Math.abs(stream.width / stream.height - aspect) <= 0.01 * aspect;
}

async function writeAtomic(file, data) {
  const target = assertProjectOutput(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, target);
}

async function blazefaceSamples({ identity, step, log }) {
  const { analyzeReframe } = await import('./reframe-pipeline.mjs');
  const sampleFps = Math.min(15, Math.max(0.5, identity.fps / step));
  const analysis = await analyzeReframe({ source: identity.path, sampleFps, analysisMaxEdge: 640, minConfidence: 0.5, log });
  const byFrame = new Map();
  for (const sample of analysis.samples) {
    const frame = Math.min(identity.totalFrames - 1, Math.max(0, Math.round(sample.sourceTimeSec * identity.fps)));
    if (byFrame.has(frame)) continue;
    const best = [...sample.faces].sort((a, b) => b.score - a.score)[0];
    byFrame.set(frame, { frame, box: best ? padHeadBox(best, 'blazeface') : null, confidence: best ? Math.round(best.score * 1e4) / 1e4 : 0 });
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

export async function buildHeadEnvelope({ source, method = 'auto', matte = null, every = null, force = false, log = () => {} } = {}) {
  if (!['auto', 'blazeface'].includes(method)) throw new Error(`Unknown head envelope method: ${method}`);
  const { inspectEditSource } = await import('./edit-project.mjs');
  const identity = (await inspectEditSource(source)).source;
  const step = every ?? Math.max(1, Math.round(identity.fps / 5));
  if (!Number.isInteger(step) || step < 1) throw new Error('Envelope sample spacing must be a positive integer number of source frames');
  const file = envelopeFile(identity.sha256);
  const buildFile = file.replace(/\.json$/, '.build.json');
  const codeSha256 = createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex');
  if (!force) {
    const cached = await readHeadEnvelope(identity.sha256).catch((error) => { log(`head envelope cache rejected: ${error.message}`); return null; });
    const build = await fs.readFile(buildFile, 'utf8').then(JSON.parse).catch(() => null);
    if (cached && build?.codeSha256 === codeSha256 && build.every === step
      && (method === 'auto' || cached.method === method) && (matte === null || build.matte === matte)) {
      return { envelope: cached, file, cached: true, errors: [] };
    }
  }
  await fs.mkdir(HEAD_CACHE_DIR, { recursive: true });
  const lockFile = assertProjectOutput(`${file}.lock`);
  const lock = await fs.open(lockFile, 'wx').catch(() => {
    throw new Error(`A head envelope build is already running for this source (${path.relative(ROOT, lockFile)}); wait for it, or delete the lock if that process died.`);
  });
  try {
    const src = { path: identity.path, sha256: identity.sha256, width: identity.width, height: identity.height, fps: identity.fps };
    const errors = [];
    for (const candidate of ['blazeface']) {
      try {
        const samples = await blazefaceSamples({ identity, step, log });
        if (!samples.some((sample) => sample.box)) throw new Error('no usable head box in any sample');
        const envelope = validateHeadEnvelope({ version: HEAD_ENVELOPE_VERSION, source: src, method: candidate, samples });
        await writeAtomic(file, envelope);
        await writeAtomic(buildFile, { version: 1, sha256: identity.sha256, method: candidate, every: step, analysisWidth: ANALYSIS_WIDTH,
          rvmOutWidth: RVM_OUT_WIDTH, alphaThreshold: ALPHA_THRESHOLD, padding: HEAD_PADDING[candidate], matte, codeSha256, errors });
        return { envelope, file, cached: false, errors };
      } catch (error) {
        errors.push(`${candidate}: ${error.message}`);
        log(`head envelope ${candidate} failed: ${error.message}`);
      }
    }

    return { envelope: validateHeadEnvelope({ version: HEAD_ENVELOPE_VERSION, source: src, method: 'none', samples: [] }), file: null, cached: false, errors };
  } finally {
    await lock.close();
    await fs.unlink(lockFile).catch(() => {});
  }
}
