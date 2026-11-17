import './lib/project-tmp.mjs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {atomicJson} from './lib/breakdown-prepare.mjs';
import {performance} from 'node:perf_hooks';
import {ROOT, parseArgs} from './lib/media.mjs';
import {assertProjectOutput} from './lib/project-paths.mjs';
import {TARGETS, scoreBreakdown, scoreSuite, coldBenchmarkSeconds} from './lib/breakdown-score.mjs';
import {isColdTiming} from './lib/breakdown-timing.mjs';

export const EVAL_PROJECT = 'breakdown-accuracy';
const base = (...p) => assertProjectOutput(path.join(ROOT, 'Projects', EVAL_PROJECT, ...p));
const USAGE = `Usage:
  node scripts/breakdown-accuracy.mjs candidates
  node scripts/breakdown-accuracy.mjs run --suite synthetic|own [--projects <slug>,<slug>] [--force] [--cold]
  node scripts/breakdown-accuracy.mjs run --suite heldout --params <file> [--force] [--cold]
  node scripts/breakdown-accuracy.mjs score
  node scripts/breakdown-accuracy.mjs score-local
  node scripts/breakdown-accuracy.mjs summary
One breakdown runs at a time. Never run it together with a render or the full test suite.`;

async function writeJson(file, value) { await atomicJson(assertProjectOutput(file), value); }
async function readResults({includeHeldout = true} = {}) {
  const dir = base('results');
  const names = (await fsp.readdir(dir).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(n => n.endsWith('.json') && (includeHeldout || !n.startsWith('heldout-'))).sort();
  return Promise.all(names.map(async n => JSON.parse(await fsp.readFile(path.join(dir, n), 'utf8'))));
}
async function dirBytes(dir) {
  let n = 0;
  const entries = await fsp.readdir(dir, {withFileTypes: true}).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (!entries) return null;
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += (await dirBytes(p)) ?? 0; else if (e.isFile()) n += (await fsp.stat(p)).size;
  }
  return n;
}
const truthIdentity = truth => createHash('sha256').update(JSON.stringify(truth)).digest('hex');
function scopeMigrationMatches(result, truth) {
  if (result.suite !== 'own' || truth.source !== 'own-render' || ![undefined, 'captions-only'].includes(truth.textScope)) return false;
  const entries = Object.entries(truth).filter(([key]) => key !== 'textScope');
  // Old writers placed textScope at different positions. Only this metadata
  // field may differ: every event and all other truth fields stay hash-bound.
  const hashes = [truthIdentity(Object.fromEntries(entries))];
  for (let at = 0; at <= entries.length; at++) hashes.push(truthIdentity(Object.fromEntries([...entries.slice(0, at), ['textScope', 'captions-only'], ...entries.slice(at)])));
  return hashes.includes(result.localBaseline?.truthSha256);
}
function assertOwnRenderHash(suite, render, referenceSha256) {
  if (suite === 'own' && (!/^[a-f0-9]{64}$/u.test(render?.sha256 ?? '') || render.sha256 !== referenceSha256))
    throw new Error('Own render hash does not match the measured breakdown source; verify the render again before measuring.');
}
export function updateHeardScore(localBaseline, currentScore) {
  if (!localBaseline?.score?.counts) throw new Error('Local baseline is missing; run the suite with --force.');
  const score = structuredClone(localBaseline.score);
  const heard = currentScore.rows.find(r => r.measure === 'sfxF1Heard');
  if (!heard) throw new Error('Heard score is missing.');
  score.rows = score.rows.filter(r => r.measure !== 'sfxF1Heard');
  const at = score.rows.findIndex(r => r.measure === 'sfxTypeAccuracy');
  score.rows.splice(at < 0 ? score.rows.length : at + 1, 0, structuredClone(heard));
  score.counts.sfxHeard = structuredClone(currentScore.counts.sfxHeard);
  return score;
}
export function isAugmentedBreakdown(b) {
  return b.listener?.status === 'merged' || (b.rejected ?? []).some(id => /^[XH][0-9]+$/u.test(id)) || (b.sound?.sfx ?? []).some(x => x.basis === 'heard' || x.reviewedWith === 'ear')
    || [b.sound?.bed, b.sound?.tempo].some(x => x?.basis === 'heard' || x?.reviewedWith === 'ear');
}
export function measuredResult({suite, name, breakdown: b, truth, truthFile, runSec, cacheHit, previous, render, notes = [], skipped = [], timing = null}) {
  const truthSha256 = truthIdentity(truth), referenceSha256 = b.source.sha256;
  assertOwnRenderHash(suite, render, referenceSha256);
  const augmented = isAugmentedBreakdown(b);
  const score = scoreBreakdown(b, truth);
  let localBaseline;
  if (cacheHit && previous?.localBaseline) {
    localBaseline = previous.localBaseline;
    if (localBaseline.referenceSha256 !== referenceSha256 || localBaseline.truthSha256 !== truthSha256 || previous.referenceId !== b.referenceId
      || (suite === 'own' && previous.render?.sha256 !== render.sha256))
      throw new Error('Cached baseline identity changed; run the suite with --force.');
  } else {
    if (augmented) throw new Error('A heard result cannot become a local baseline; run the suite with --force.');
    localBaseline = {referenceSha256, truthSha256, score: structuredClone(score)};
  }
  const coldRunSec = isColdTiming(timing) && Number.isFinite(runSec) && runSec >= 0 ? runSec : null;
  return {schema: 1, suite, name, referenceId: b.referenceId, durationSec: b.durationSec, runSec, coldRunSec, truthFile, timing,
    ...(suite === 'own' ? {render, notes, skipped} : {}),
    localBaseline, score: updateHeardScore(localBaseline, score), listener: b.listener?.status ?? null};
}
async function measure({suite, name, video, truthFile, truth, force, cold, render, notes, skipped}) {
  const {runBreakdown} = await import('./breakdown.mjs');
  const resultFile = base('results', `${suite}-${name}.json`);
  let previous = null; try { previous = JSON.parse(await fsp.readFile(resultFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const started = performance.now();
  // Synthetic reels have no speech; own renders keep speech on, as a creator would run them.
  const run = await runBreakdown({reference: video, project: EVAL_PROJECT, speech: suite === 'synthetic' ? 'off' : 'on', force, cold});
  const runSec = Math.round((performance.now() - started) / 100) / 10;
  const b = JSON.parse(await fsp.readFile(path.join(run.outDir, 'breakdown.json'), 'utf8'));
  const result = measuredResult({suite, name, breakdown: b, truth, truthFile, runSec, cacheHit: run.cacheHit, previous, render, notes, skipped, timing: run.timing});
  await writeJson(resultFile, result);
  return result;
}
export async function runSuite({suite, projects = [], force = false, cold = false, params}) {
  if (suite !== 'heldout' && params !== undefined) throw new Error('--params is only valid for the heldout suite.');
  if (suite === 'heldout' && projects.length) throw new Error('Held-out reel names come only from the named parameters file.');
  const done = [];
  if (suite === 'synthetic') {
    const {buildSyntheticSuite} = await import('./lib/breakdown-fixture.mjs');
    for (const reel of await buildSyntheticSuite(base('synthetic'))) done.push(await measure({suite, name: reel.name, video: reel.video, truthFile: reel.truthFile, truth: reel.truth, force, cold}));
  } else if (suite === 'heldout') {
    if (typeof params !== 'string' || !params) throw new Error('--params names the coordinator-owned held-out JSON file.');
    const {buildSyntheticSuite} = await import('./lib/breakdown-fixture.mjs');
    for (const reel of await buildSyntheticSuite(base('heldout'), {paramsFile: params}))
      done.push(await measure({suite, name: reel.name, video: reel.video, truthFile: reel.truthFile, truth: reel.truth, force, cold}));
  } else if (suite === 'own') {
    if (!projects.length) throw new Error('--projects names the own renders to measure (see candidates).');
    const {loadOwnRenderTruth} = await import('./lib/breakdown-truth.mjs');
    for (const slug of projects) {
      const own = await loadOwnRenderTruth(slug);
      if (!own.eligible) throw new Error(`${slug} is not eligible: ${own.reason}`);
      const truthFile = base('truth', `own-${slug}.json`);
      await writeJson(truthFile, own.truth);
      done.push(await measure({suite, name: slug, video: own.video, truthFile, truth: own.truth, force, cold, render: own.render, notes: own.notes, skipped: own.skipped}));
    }
  } else throw new Error(USAGE);
  return done.map(r => ({suite: r.suite, name: r.name, runSec: r.runSec, coldRunSec: r.coldRunSec, cacheState: r.timing?.cacheState ?? 'unknown',
    ...(r.suite === 'own' ? {render: r.render, skipped: r.skipped} : {}), rows: r.score.rows.filter(x => x.pass === false).map(x => x.measure)}));
}
export async function rescore({loadResults = () => readResults({includeHeldout: false}), loadBreakdown,
  loadTruth = async file => JSON.parse(await fsp.readFile(file, 'utf8')), saveResult = writeJson, saveTruth = writeJson, local = false} = {}) {
  const load = loadBreakdown ?? (await import('./breakdown.mjs')).readBreakdown;
  const pending = [], errors = [], outcomes = [];
  // Validate and compute every result before writing any of them. Legacy own
  // identities and other validation errors must never leave a partial rescore.
  for (const r of await loadResults()) {
    try {
      const {breakdown} = await load(EVAL_PROJECT, r.referenceId);
      if (local && isAugmentedBreakdown(breakdown)) {
        outcomes.push({suite:r.suite,name:r.name,skipped:true,reason:'A heard or ear-reviewed breakdown cannot rebuild a local baseline.'});
        continue;
      }
      assertOwnRenderHash(r.suite, r.render, breakdown.source.sha256);
      const storedTruth = await loadTruth(r.truthFile);
      const sameTruth = r.localBaseline?.truthSha256 === truthIdentity(storedTruth), compatibleScope = scopeMigrationMatches(r, storedTruth);
      if (r.localBaseline?.referenceSha256 !== breakdown.source.sha256 || !sameTruth && !compatibleScope) throw new Error('Stored baseline or truth identity changed; run the suite with --force.');
      const reconcileScope = compatibleScope && (local || !sameTruth);
      if (reconcileScope && isAugmentedBreakdown(breakdown)) {
        outcomes.push({suite:r.suite,name:r.name,skipped:true,reason:'Scope migration cannot rebuild a heard or ear-reviewed local baseline.'});
        continue;
      }
      const truth = reconcileScope ? {...Object.fromEntries(Object.entries(storedTruth).filter(([k]) => k !== 'textScope')), textScope:'captions-only'} : storedTruth;
      const migrateScope = truthIdentity(truth) !== truthIdentity(storedTruth);
      const current = scoreBreakdown(breakdown, truth);
      const localBaseline = local || reconcileScope ? {referenceSha256: breakdown.source.sha256, truthSha256: truthIdentity(truth), score: structuredClone(current)} : r.localBaseline;
      const next = {...r, coldRunSec:coldBenchmarkSeconds(r), localBaseline, score: updateHeardScore(localBaseline, current), listener: breakdown.listener?.status ?? null};
      if (migrateScope) assertProjectOutput(r.truthFile);
      pending.push({file: base('results', `${r.suite}-${r.name}.json`), next, ...(migrateScope ? {truthFile: r.truthFile, truth} : {})});
      outcomes.push({suite:r.suite,name:r.name,listener:next.listener});
    } catch (e) { errors.push(`${r?.suite ?? 'unknown'}/${r?.name ?? 'unknown'}: ${e.message}`); }
  }
  if (errors.length) throw new Error('Cannot rescore results; no results were written:\n' + errors.join('\n'));
  // Results first. Scope-only identity reconciliation makes interruption before
  // or during the following truth writes safe to retry without --force.
  for (const {file, next} of pending) await saveResult(file, next);
  for (const p of pending) if (p.truthFile) await saveTruth(p.truthFile, p.truth);
  return outcomes;
}
export const rescoreLocal = options => rescore({...options, local: true});
export function summarize({results, addonBytes, now = new Date()}) {
  const addonMb = Number.isFinite(addonBytes) && addonBytes >= 0 ? Math.round(addonBytes / 1e5) / 10 : null;
  const pick = s => results.filter(r => r.suite === s);
  const own = pick('own'), ownScore = scoreSuite(own);
  const renderKinds = Object.fromEntries(['deliver', 'review', 'preview', 'unrecorded'].map(mode => [mode,
    pick('own').filter(r => r.score?.counts && (r.render?.mode ?? 'unrecorded') === mode).length]));
  return {schema: 1, generatedAt: now.toISOString(), addonMb, addonPass: addonMb === null ? null : addonMb <= TARGETS.addonMb,
    suites: {synthetic: scoreSuite(pick('synthetic')), own: {...ownScore, totalReels: own.length, unscoredReels: own.length - ownScore.reels, renderKinds,
      bedPositiveReels: own.filter(r=>r.score?.counts?.bed?.truth===true).length}, all: scoreSuite(results.filter(r => r.suite !== 'heldout')),
      ...(pick('heldout').length ? {heldout: scoreSuite(pick('heldout'))} : {})},
    reels: results.map(r => ({suite: r.suite, name: r.name, durationSec: r.durationSec, runSec: r.runSec, listener: r.listener ?? null,
      coldRunSec: coldBenchmarkSeconds(r), secondsPer60: coldBenchmarkSeconds(r) !== null && r.durationSec > 0 ? +(r.coldRunSec * 60 / r.durationSec).toFixed(4) : null, timing: r.timing ?? null,
      ...(r.suite === 'own' ? {render: r.render ?? null, notes: r.notes ?? [], skipped: r.skipped ?? [], scored: Boolean(r.score?.counts)} : {})}))};
}
export function renderAccuracyMarkdown(s) {
  const fmt = v => (v == null ? 'not measured' : typeof v === 'number' ? String(v) : String(v));
  const lines = ['# Reference breakdown accuracy', '', `Generated ${s.generatedAt}. Add-on size: ${fmt(s.addonMb)} MB (target ≤ ${TARGETS.addonMb}) ${s.addonPass === null ? 'not measured' : s.addonPass ? 'pass' : 'MISS'}.`, ''];
  for (const [name, suite] of Object.entries(s.suites)) {
    const kinds = name === 'own' ? Object.entries(suite.renderKinds).filter(([, count]) => count).map(([mode, count]) => `${count} ${mode}`) : [];
    const count = name === 'own' ? `${suite.totalReels} reels: ${suite.reels} scored, ${suite.unscoredReels} unscored${kinds.length ? '; scored kinds: ' + kinds.join(', ') : ''}` : `${suite.reels} reels`;
    lines.push(`## ${name} (${count})`, '', '| measure | value | target | pass | n |', '|---|---|---|---|---|');
    for (const r of suite.rows) lines.push(`| ${r.measure} | ${r.measure === 'secondsPer60sMax' && r.value === null ? 'not measured cold' : fmt(r.value)} | ${fmt(r.target)} | ${r.pass === null ? '—' : r.pass ? 'pass' : 'MISS'} | ${r.n} |`);
    lines.push('');
  }
  lines.push('Own-render truth covers presenter cuts, takeover-scene edges, transitions, visible captions and the sound-effect list; picture changes inside a scene and text inside graphics are not scored. Tempo is scored on the synthetic suite only.', '');
  if(s.suites.own.reels>0 && s.suites.own.bedPositiveReels===0)lines.push('The scored own suite has no true music beds; its bed accuracy checks absence, not music recall. Partial-swap precision inside scenes is not measured by the current own truth.', '');
  lines.push('Held-out results are kept separate and excluded from the all-suite aggregate.', '',
    '| suite | reel | cold benchmark seconds per 60 s | latest run wall seconds | latest cache state |', '|---|---|---|---|---|');
  for (const r of s.reels) lines.push(`| ${r.suite} | ${r.name} | ${r.secondsPer60 === null ? 'not measured cold' : fmt(r.secondsPer60)} | ${fmt(r.timing?.wallSec)} | ${r.timing?.cacheState ?? 'not recorded'} |`);
  lines.push('', 'Only verified cold runs contribute to the speed target. Use --cold to bypass preparation, ASR, presenter and analyser caches; mixed, warm and unrecorded runs are not measured cold.', '');
  const own = s.reels.filter(r => r.suite === 'own');
  if (own.length) {
    const cell = value => String(value).replace(/\|/gu, '\\|').replace(/[\r\n]+/gu, ' ');
    lines.push(s.suites.own.reels > 0
      ? 'Own reels were measured on checked renders of the kinds listed per reel (deliver, review, preview). Lower-resolution renders can change text reading.'
      : 'No own reels have scored results; render kinds (deliver, review, preview) and unscored records are listed below.', '',
      '| own reel | render kind | render file | size | score status | notes |', '|---|---|---|---|---|---|');
    for (const r of own) {
      const notes = [...(r.notes ?? []), ...(r.skipped ?? []).map(x => `Skipped ${x.file} (${x.mode ?? 'unknown mode'}): ${x.reason}`)];
      lines.push(`| ${cell(r.name)} | ${cell(r.render?.mode ?? 'not recorded; rerun own suite')} | ${cell(r.render?.file ?? 'not recorded')} | ${r.render ? `${r.render.width}x${r.render.height}` : 'not recorded'} | ${r.scored ? 'scored' : 'unscored'} | ${cell(notes.join(' '))} |`);
    }
    lines.push('');
  }
  const heard = s.suites.all.rows.find(r => r.measure === 'sfxF1Heard');
  lines.push(heard?.n > 0 && heard.value != null
    ? 'Heard SFX accuracy measured on ' + heard.n + ' scored reels; see the row value and target above.'
    : 'Heard SFX accuracy is not measured; no scored listener result is available.', '');
  lines.push('Both local and heard SFX use a 0.15 s matching tolerance. Heard-only timestamps are approximate and may miss this timing gate even when the sound was heard.', '');
  lines.push('Local SFX scores measure reported effects in sound.sfx. Possible weak sounds in sound.sfxCandidates are excluded from effect scores and density; sfxCandidateRecall separately reports their truth-event recall, with no target.', '');
  lines.push('Every row reports n (reels); missing measurements remain not measured. Font guesses, voice descriptions, music character, graphics text and internal scene changes are not measured. No live listener, manual hearing, or visual acceptance is implied by these scores.', '');
  return lines.join('\n');
}
async function main(argv) {
  const [command, ...rest] = argv, args = parseArgs(rest);
  const allowed = {candidates: [], run: ['suite','projects','force','cold','params'], score: [], 'score-local': [], summary: []}[command];
  if (!allowed || args._.length || Object.keys(args).some(k => k !== '_' && !allowed.includes(k)) || (args.force !== undefined && args.force !== true) || (args.cold !== undefined && args.cold !== true)) throw new Error(USAGE);
  if (command === 'candidates') {
    const {listOwnRenderCandidates} = await import('./lib/breakdown-truth.mjs');
    return console.log(JSON.stringify(await listOwnRenderCandidates(), null, 2));
  }
  if (command === 'run') return console.log(JSON.stringify(await runSuite({suite: args.suite, projects: String(args.projects ?? '').split(',').map(s => s.trim()).filter(Boolean), force: args.force === true, cold: args.cold === true, params: args.params}), null, 2));
  if (command === 'score') return console.log(JSON.stringify(await rescore(), null, 2));
  if (command === 'score-local') return console.log(JSON.stringify(await rescoreLocal(), null, 2));
  if (command === 'summary') {
    const summary = summarize({results: await readResults(), addonBytes: await dirBytes(path.join(ROOT, 'Tools', 'breakdown'))});
    await writeJson(base('accuracy.json'), summary);
    await fsp.writeFile(base('ACCURACY.md'), renderAccuracyMarkdown(summary), 'utf8');
    return console.log(JSON.stringify({file: base('ACCURACY.md'), reels: summary.reels,
      suites: Object.fromEntries(Object.entries(summary.suites).map(([k, v]) => [k, v.rows.filter(r => r.pass === false).map(r => r.measure)]))}, null, 2));
  }
  throw new Error(USAGE);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
