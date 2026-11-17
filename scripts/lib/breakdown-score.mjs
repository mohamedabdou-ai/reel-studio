// scripts/lib/breakdown-score.mjs (first version)
import {isColdTiming} from './breakdown-timing.mjs';
const textMeasurementApplies = truthCount => truthCount > 0;
export const coldBenchmarkSeconds = result => isColdTiming(result?.timing) && Number.isFinite(result?.coldRunSec) && result.coldRunSec >= 0 ? result.coldRunSec : null;
export function charErrorRate(truth, found) {
  const a = [...String(truth).replace(/\s+/gu, ' ').trim()], b = [...String(found).replace(/\s+/gu, ' ').trim()];
  if (!a.length) return b.length ? 1 : 0;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / a.length;
}

export const TARGETS = Object.freeze({cutsF1: 0.95, textRecall: 0.9, textTimingMedianSec: 0.15, textCer: 0.1, tempoWithin: 0.04, bedPresent: true,
  sfxF1Local: 0.6, sfxF1Heard: 0.8, tempoShare: 0.9, bedShare: 0.95, secondsPer60: 240, addonMb: 450});

const med = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

export function matchEvents(truthTimes, foundTimes, tolerance) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || [...truthTimes, ...foundTimes].some(t => !Number.isFinite(t))) throw new Error('Event times and tolerance must be finite and nonnegative tolerance is required.');
  const truth = truthTimes.map((t, i) => ({t, i})).sort((a, b) => a.t - b.t || a.i - b.i);
  const found = foundTimes.map((t, i) => ({t, i})).sort((a, b) => a.t - b.t || a.i - b.i);
  const width = found.length + 1, cells = (truth.length + 1) * width;
  if (cells > 10_000_000) throw new Error('Too many events for exact matching.');
  const count = new Uint32Array(cells), cost = new Float64Array(cells), step = new Uint8Array(cells);
  // For sorted times an optimal absolute-distance matching has no crossings.
  // Lexicographic objective: maximize cardinality, then minimize total error.
  for (let i = 1; i <= truth.length; i++) for (let j = 1; j <= found.length; j++) {
    const k = i * width + j, up = k - width, left = k - 1, diag = up - 1;
    const best = count[up] > count[left] || (count[up] === count[left] && cost[up] <= cost[left]) ? up : left;
    count[k] = count[best]; cost[k] = cost[best]; step[k] = best === up ? 1 : 2;
    const gap = Math.abs(truth[i - 1].t - found[j - 1].t);
    if (gap <= tolerance + 1e-9 && (count[diag] + 1 > count[k] || (count[diag] + 1 === count[k] && cost[diag] + gap <= cost[k]))) {
      count[k] = count[diag] + 1; cost[k] = cost[diag] + gap; step[k] = 3;
    }
  }
  const pairs = [], errors = [];
  for (let i = truth.length, j = found.length; i && j;) {
    const direction = step[i * width + j];
    if (direction === 3) { pairs.push([truth[i - 1].i, found[j - 1].i]); errors.push(+Math.abs(truth[i - 1].t - found[j - 1].t).toFixed(6)); i--; j--; }
    else if (direction === 1) i--; else j--;
  }
  pairs.reverse();
  const tp = pairs.length, fp = foundTimes.length - tp, fn = truthTimes.length - tp;
  const precision = foundTimes.length ? tp / foundTimes.length : truthTimes.length ? 0 : 1;
  const recall = truthTimes.length ? tp / truthTimes.length : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {pairs, tp, fp, fn, precision, recall, f1, medianError: med(errors)};
}

function row(measure, value, target, better = 'high') {
  const v = value == null || (typeof value === 'number' && !Number.isFinite(value)) ? null : typeof value === 'boolean' ? value : +Number(value).toFixed(4);
  let pass = null;
  if (target != null) pass = v == null ? false : typeof target === 'boolean' ? v === target : better === 'high' ? value >= target : value <= target;
  return {measure, value: v, target, pass};
}

function overlayPrecision(truth,found) {
  if(!found.length)return truth.length?0:1;
  const overlaps=(a,b)=>{
    const time=Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
    const union=Math.max(a.end,b.end)-Math.min(a.start,b.start);
    if(!(union>0) || time/union<.5 || !a.box || !b.box)return false;
    const [x,y,w,h]=a.box,[X,Y,W,H]=b.box,inter=Math.max(0,Math.min(x+w,X+W)-Math.max(x,X))*Math.max(0,Math.min(y+h,Y+H)-Math.max(y,Y));
    return inter/(w*h+W*H-inter)>=.5 && (!a.kind || a.kind===b.kind);
  };
  const matched=new Map();
  function augment(i,seen) {
    for(let j=0;j<found.length;j++)if(!seen.has(j)&&overlaps(truth[i],found[j])){seen.add(j);if(!matched.has(j)||augment(matched.get(j),seen)){matched.set(j,i);return true;}}
    return false;
  }
  for(let i=0;i<truth.length;i++)augment(i,new Set());
  return matched.size/found.length;
}

export function scoreBreakdown(b, truth) {
  if (!Number.isFinite(truth.fps) || truth.fps <= 0) throw new Error('Truth must specify a valid fps for the two-frame cut tolerance.');
  const rows = [];
  const ignore = Array.isArray(truth.ignore) ? truth.ignore : [];
  const keep = t => !ignore.some(w => t >= w.start - 1e-9 && t <= w.end + 1e-9);
  const truthCuts = truth.cuts.filter(c => keep(c.t)), foundCuts = b.cuts.filter(c => keep(c.t));
  const cuts = matchEvents(truthCuts.map(c => c.t), foundCuts.map(c => c.t), 2 / truth.fps);
  rows.push(row('cutsF1', cuts.f1, TARGETS.cutsF1));
  rows.push(row('cutKindAccuracy', cuts.tp ? cuts.pairs.filter(([i, j]) => truthCuts[i].kind === foundCuts[j].kind).length / cuts.tp : null, null));
  const centre = r => (r.start + r.end) / 2;
  const tr = matchEvents(truth.transitions.filter(r => keep(centre(r))).map(centre), b.transitions.filter(r => keep(centre(r))).map(centre), 0.25);
  rows.push(row('transitionsRecall', tr.recall, null));
  const cam = truth.camera.map(c => {
    const shot = b.shots.find(s => s.start <= c.start + 0.1 && s.end >= c.end - 0.1);
    return shot?.camera?.label === c.label;
  });
  rows.push(row('cameraLabels', cam.length ? cam.filter(Boolean).length / cam.length : null, null));
  const text = matchEvents(truth.text.map(t => t.start), b.text.map(t => t.start), 0.5);
  const matched = text.pairs.filter(([i, j]) => charErrorRate(truth.text[i].text, b.text[j].text) < 0.5);
  // Recall and CER are undefined without reference text, for every scope.
  // False-positive text precision would need a separate exhaustive annotation.
  const noCaptionTruth = !textMeasurementApplies(truth.text.length);
  rows.push(row('textRecall', noCaptionTruth ? null : truth.text.length ? matched.length / truth.text.length : b.text.length ? 0 : 1, noCaptionTruth ? null : TARGETS.textRecall));
  const timing = matched.flatMap(([i, j]) => [Math.abs(truth.text[i].start - b.text[j].start), Math.abs(truth.text[i].end - b.text[j].end)]);
  rows.push(row('textTimingMedianSec', med(timing), truth.text.length ? TARGETS.textTimingMedianSec : null, 'low'));
  const cers = matched.map(([i, j]) => charErrorRate(truth.text[i].text, b.text[j].text));
  rows.push(row('textCer', noCaptionTruth ? null : cers.length ? cers.reduce((a, v) => a + v, 0) / cers.length : truth.text.length ? null : b.text.length ? 1 : 0, noCaptionTruth ? null : TARGETS.textCer, 'low'));
  const withEntrance = matched.filter(([i]) => typeof truth.text[i].entrance === 'string');
  rows.push(row('textEntranceAccuracy', withEntrance.length ? withEntrance.filter(([i, j]) => truth.text[i].entrance === b.text[j].entrance).length / withEntrance.length : null, null));
  const bpm = b.sound?.tempo?.bpm;
  rows.push(row('tempoWithin', bpm == null || !truth.sound.bpm ? null : Math.abs(bpm - truth.sound.bpm) / truth.sound.bpm, truth.sound.bpm ? TARGETS.tempoWithin : null, 'low'));
  rows.push(row('bedPresent', b.sound?.bed?.present ?? null, truth.sound.bed));
  const localSfx = (b.sound?.sfx ?? []).filter(x => !/^H[0-9]+$/u.test(x.id ?? '') && x.heard?.verdict !== 'heard-only');
  const sfx = matchEvents(truth.sound.sfx.map(x => x.t), localSfx.map(x => x.t), 0.15);
  rows.push(row('sfxF1Local', sfx.f1, TARGETS.sfxF1Local));
  rows.push(row('sfxTypeAccuracy', sfx.tp ? sfx.pairs.filter(([i, j]) => truth.sound.sfx[i].type === localSfx[j].type).length / sfx.tp : null, null));
  const candidates = Array.isArray(b.sound?.sfxCandidates) ? matchEvents(truth.sound.sfx.map(x=>x.t), b.sound.sfxCandidates.map(x=>x.t), .15) : null;
  rows.push(row('sfxCandidateRecall',candidates && truth.sound.sfx.length ? candidates.recall : null,null));
  const heardSfx = b.listener?.status === 'merged' ? (b.sound?.sfx ?? []).filter(x => ['heard', 'heard-only'].includes(x.heard?.verdict)) : null;
  const sfxHeard = heardSfx ? matchEvents(truth.sound.sfx.map(x => x.t), heardSfx.map(x => x.t), 0.15) : null;
  rows.push(row('sfxF1Heard', sfxHeard ? sfxHeard.f1 : null, sfxHeard ? TARGETS.sfxF1Heard : null));
  rows.push(row('overlaysPrecision',Array.isArray(truth.overlays)?overlayPrecision(truth.overlays,b.overlays??[]):null,null));
  const pick = x => ({tp: x.tp, fp: x.fp, fn: x.fn});
  const counts = {cuts: pick(cuts), sfx: pick(sfx), sfxCandidates:candidates ? {...pick(candidates),truth:truth.sound.sfx.length} : null, sfxHeard: sfxHeard ? pick(sfxHeard) : null,
    text: {truth: truth.text.length, matched: matched.length, timing, cers},
    tempo: {truth: truth.sound.bpm ?? null, found: bpm ?? null},
    bed: {truth: typeof truth.sound.bed === 'boolean' ? truth.sound.bed : null, found: b.sound?.bed?.present ?? null}};
  return {rows, counts};
}

const total = (list, f) => list.reduce((n, x) => n + f(x), 0);
const f1Of = c => {
  const p = c.tp + c.fp ? c.tp / (c.tp + c.fp) : (c.tp + c.fn ? 0 : 1), r = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 1;
  return p + r ? (2 * p * r) / (p + r) : 0;
};
export function scoreSuite(results) {
  const scored = results.filter(r => r?.score?.counts), rows = [];
  const add = (measure, value, n, target, better = 'high') => rows.push({...row(measure, value, target, better), n});
  const micro = (measure, key, target) => {
    const list = scored.map(r => r.score.counts[key]).filter(Boolean);
    add(measure, list.length ? f1Of({tp: total(list, c => c.tp), fp: total(list, c => c.fp), fn: total(list, c => c.fn)}) : null, list.length, list.length ? target : null);
  };
  micro('cutsF1', 'cuts', TARGETS.cutsF1);
  const text = scored.map(r => r.score.counts.text).filter(t => textMeasurementApplies(t.truth)), cers = text.flatMap(t => t.cers);
  add('textRecall', text.length ? total(text, t => t.matched) / total(text, t => t.truth) : null, text.length, text.length ? TARGETS.textRecall : null);
  add('textTimingMedianSec', med(text.flatMap(t => t.timing)), text.length, text.length ? TARGETS.textTimingMedianSec : null, 'low');
  add('textCer', cers.length ? total(cers, c => c) / cers.length : null, text.length, text.length ? TARGETS.textCer : null, 'low');
  const tempos = scored.map(r => r.score.counts.tempo).filter(t => Number.isFinite(t.truth));
  const within = (f, t) => Number.isFinite(f) && Math.abs(f - t) / t <= TARGETS.tempoWithin;
  add('tempoWithin4pct', tempos.length ? tempos.filter(t => within(t.found, t.truth)).length / tempos.length : null, tempos.length, tempos.length ? TARGETS.tempoShare : null);
  add('tempoHalfOrDouble', tempos.length ? tempos.filter(t => !within(t.found, t.truth) && (within(t.found, t.truth * 2) || within(t.found, t.truth / 2))).length / tempos.length : null, tempos.length, null);
  const beds = scored.map(r => r.score.counts.bed).filter(x => typeof x.truth === 'boolean');
  add('bedAccuracy', beds.length ? beds.filter(x => x.found === x.truth).length / beds.length : null, beds.length, beds.length ? TARGETS.bedShare : null);
  micro('sfxF1Local', 'sfx', TARGETS.sfxF1Local);
  const candidates=scored.map(r=>r.score.counts.sfxCandidates).filter(c=>c && c.truth>0);
  add('sfxCandidateRecall',candidates.length ? total(candidates,c=>c.tp)/total(candidates,c=>c.truth) : null,candidates.length,null);
  micro('sfxF1Heard', 'sfxHeard', TARGETS.sfxF1Heard);
  const speed = scored.filter(r => coldBenchmarkSeconds(r) !== null && r.durationSec > 0).map(r => (r.coldRunSec * 60) / r.durationSec);
  add('secondsPer60sMax', speed.length ? Math.max(...speed) : null, speed.length, speed.length ? TARGETS.secondsPer60 : null, 'low');
  return {reels: scored.length, rows};
}
