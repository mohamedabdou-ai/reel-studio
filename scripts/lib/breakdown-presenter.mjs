// scripts/lib/breakdown-presenter.mjs
import path from 'node:path';
import {ROOT} from './project-paths.mjs';
import {itemMeta} from './breakdown-merge.mjs';

export const PRESENTER_SAMPLE_FPS = 2;
export const PRESENTER_MIN_SHARE = 0.05;
export const PRESENTER_MIN_SCORE = 0.5;
const round = (v, d = 3) => (v == null ? null : +Number(v).toFixed(d));
const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

export function sizeLabel(height) {
  if (!Number.isFinite(height)) return 'none';
  return height >= 0.3 ? 'close' : height >= 0.15 ? 'medium' : 'wide';
}

export function summarisePresenter(samples, {shots = [], durationSec, sampleFps = PRESENTER_SAMPLE_FPS} = {}) {
  if (!Array.isArray(samples) || !samples.length) throw new Error('Presenter measurement needs face samples.');
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Presenter measurement needs the reference duration.');
  if (!Number.isFinite(sampleFps) || sampleFps <= 0) throw new Error('Presenter measurement needs a positive sample rate.');
  const times = new Set();
  const rows = samples.map(s => {
    if (!s || !Number.isFinite(s.timeSec) || s.timeSec < 0 || s.timeSec >= durationSec || times.has(s.timeSec)) throw new Error('Invalid or duplicate face sample timestamp.');
    times.add(s.timeSec);
    if (s.faces != null && !Array.isArray(s.faces)) throw new Error('Invalid face samples.');
    const faces = (s.faces ?? []).filter(f => f && Number.isFinite(f.score) && f.score >= PRESENTER_MIN_SCORE && f.score <= 1 && Number.isFinite(f.width) && f.width > 0 && f.width <= 1 && Number.isFinite(f.height) && f.height > 0 && f.height <= 1);
    const main = faces.reduce((best, f) => (!best || f.width * f.height > best.width * best.height ? f : best), null);
    return {t: s.timeSec, count: faces.length, main};
  }).sort((a, b) => a.t - b.t);
  const seen = rows.filter(r => r.count > 0);
  const share = seen.length / rows.length;
  const visible = share >= PRESENTER_MIN_SHARE;
  const step = 1 / sampleFps, spans = [];
  for (const r of seen) {
    const last = spans.at(-1);
    if (last && r.t - last.lastT <= step * 1.5) last.lastT = r.t;
    else spans.push({start: r.t, lastT: r.t});
  }
  const meanScore = seen.length ? seen.reduce((sum, r) => sum + r.main.score, 0) / seen.length : null;
  const faceHeight = visible ? round(median(seen.map(r => r.main.height))) : null;
  const meta = rows.length < 6
    ? itemMeta(0.45, 'measured', {conflict: 'too few face samples', confirmHow: 'Look at the frames and say whether a person is on screen.'})
    : visible && meanScore < 0.7
      ? itemMeta(0.45, 'measured', {conflict: 'face detection is unsure on this footage', confirmHow: 'Look at the frames and say whether a real person (not a drawing) is on screen.'})
      : itemMeta(0.8, 'measured');
  return {
    sampleFps, samples: rows.length, share: round(share), multiFaceShare: round(rows.filter(r => r.count > 1).length / rows.length),
    faceHeight, size: visible ? sizeLabel(faceHeight) : 'none',
    spans: visible ? spans.map(s => ({start: round(s.start), end: round(Math.min(durationSec, s.lastT + step))})) : [],
    perShot: shots.map(s => {
      const inside = rows.filter(r => r.t >= s.start && r.t < s.end);
      return {shotId: s.id, share: inside.length ? round(inside.filter(r => r.count > 0).length / inside.length) : null};
    }),
    ...meta,
  };
}

const studioPath = file => {
  const relative = path.relative(ROOT, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Presenter proxy must stay inside the studio.');
  return relative.split(path.sep).join('/');
};

export async function measurePresenter({proxy, shots = [], durationSec, analyze = null, force = false,threads,signal}) {
  // threads limits FFmpeg decoding only. The established native face runtime
  // completes in flight; cancellation waits for it before releasing the lease.
  try {
    const run = analyze ?? (await import('./reframe-pipeline.mjs')).analyzeReframe;
    const analysis = await run({source: studioPath(proxy), sampleFps: PRESENTER_SAMPLE_FPS, analysisMaxEdge: 640, minConfidence: PRESENTER_MIN_SCORE, force,...(threads?{threads}:{}),...(signal?{signal}:{})});
    signal?.throwIfAborted();
    return {presenter: summarisePresenter(analysis.samples, {shots, durationSec}), limitation: null, cacheHit: typeof analysis.cached === 'boolean' ? analysis.cached : null};
  } catch (error) {
    if(signal?.aborted)throw signal.reason??error;
    const message = String(error?.message ?? error);
    return {presenter: null, limitation: /face model|reframe\.mjs install/iu.test(message)
      ? 'Presenter share was not measured: the face models are not installed. Installing them (node scripts/reframe.mjs install) downloads files and needs the creator\'s yes first.'
      : `Presenter share was not measured: ${message}`};
  }
}
