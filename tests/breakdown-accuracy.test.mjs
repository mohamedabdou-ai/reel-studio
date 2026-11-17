import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAccuracyMarkdown, summarize} from '../scripts/breakdown-accuracy.mjs';

const score = f1 => ({rows: [], counts: {cuts: {tp: f1, fp: 1 - f1, fn: 0}, sfx: {tp: 1, fp: 0, fn: 0}, sfxHeard: null, text: {truth: 0, matched: 0, timing: [], cers: []}, tempo: {truth: null, found: null}, bed: {truth: false, found: false}}});

test('summary groups suites, checks the add-on size and renders a table with targets', () => {
  const s = summarize({results: [{suite: 'synthetic', name: 'a', durationSec: 15, runSec: 45, score: score(1)}, {suite: 'own', name: 'b', durationSec: 60, runSec: 200, score: score(1)}], addonBytes: 370.8e6, now: new Date('2026-11-16T00:00:00Z')});
  assert.equal(s.addonMb, 370.8);
  assert.equal(s.addonPass, true);
  assert.deepEqual(Object.keys(s.suites), ['synthetic', 'own', 'all']);
  assert.equal(s.suites.all.reels, 2);
  const md = renderAccuracyMarkdown(s);
  assert.match(md,/no true music beds/);assert.match(md,/Partial-swap precision inside scenes is not measured/);
  assert.match(md, /\| cutsF1 \|/);
  assert.match(md, /Add-on size: 370.8 MB \(target ≤ 450\)/);
  assert.match(md, /not measured/);
});


import {measuredResult, updateHeardScore, rescore, rescoreLocal} from '../scripts/breakdown-accuracy.mjs';
import path from 'node:path';
import {scoreBreakdown} from '../scripts/lib/breakdown-score.mjs';
import {applyEarReview} from '../scripts/lib/breakdown-review.mjs';
const truth = () => ({fps: 30, cuts: [], transitions: [], camera: [], overlays: [], text: [], sound: {bed: false, bpm: 120, sfx: [{t: 2, type: 'pop'}, {t: 4, type: 'ding'}]}});
const local = () => ({referenceId: 'ref-aaaaaaaaaaaa', source: {sha256: 'a'.repeat(64)}, durationSec: 10, cuts: [], transitions: [], shots: [], text: [], overlays: [],
  sound: {bed: {present: false}, tempo: {bpm: 120}, sfx: [{id: 'X01', t: 2, type: 'pop'}]}});

test('heard-only IDs never improve local F1, including after creator ear confirmation', () => {
  const b = local(), baseline = scoreBreakdown(b, truth());
  b.listener = {status: 'merged'};
  b.sound.sfx[0].heard = {verdict: 'heard', type: 'pop'};
  b.sound.sfx.push({id: 'H01', t: 4, type: 'ding', basis: 'heard', status: 'needs-confirmation', heard: {verdict: 'heard-only', type: 'ding'}});
  b.reviewQueue = ['H01'];
  const reviewed = applyEarReview(b, [{id: 'H01', verdict: 'confirm'}]);
  for (const current of [b, reviewed]) {
    const s = scoreBreakdown(current, truth());
    assert.deepEqual(s.counts.sfx, baseline.counts.sfx);
    assert.deepEqual(s.counts.sfxHeard, {tp: 2, fp: 0, fn: 0});
  }
});

test('accuracy rescore changes only the heard row and counter, preserving every baseline measurement', () => {
  const b = local(), initial = measuredResult({suite: 'synthetic', name: 'a', breakdown: b, truth: truth(), truthFile: 'truth.json', runSec: 12, cacheHit: false});
  b.listener = {status: 'merged'}; b.sound.bed.present = true; b.sound.tempo.bpm = 60;
  b.sound.sfx[0].heard = {verdict: 'heard', type: 'pop'};
  b.sound.sfx.push({id: 'H01', t: 4, type: 'ding', heard: {verdict: 'heard-only', type: 'ding'}});
  const got = measuredResult({suite: 'synthetic', name: 'a', breakdown: b, truth: truth(), truthFile: 'truth.json', runSec: 12, cacheHit: true, previous: initial});
  assert.deepEqual(got.score.rows.filter(r => r.measure !== 'sfxF1Heard'), initial.score.rows.filter(r => r.measure !== 'sfxF1Heard'));
  const {sfxHeard, ...counts} = got.score.counts, {sfxHeard: ignored, ...expected} = initial.score.counts;
  assert.deepEqual(counts, expected); assert.deepEqual(sfxHeard, {tp: 2, fp: 0, fn: 0});
  assert.deepEqual(got.localBaseline, initial.localBaseline);
  assert.throws(() => measuredResult({breakdown: b, truth: truth(), cacheHit: true}), /cannot become a local baseline/);
  assert.throws(() => measuredResult({breakdown: {...b, source: {sha256: 'b'.repeat(64)}}, truth: truth(), cacheHit: true, previous: initial}), /identity changed/);
  assert.throws(() => updateHeardScore(null, got.score), /baseline is missing/);
});

test('empty suites and unavailable add-on sizes remain explicitly unmeasured', () => {
  const s = summarize({results: [], addonBytes: null});
  assert.equal(s.addonPass, null); assert.equal(s.suites.all.reels, 0);
  assert.ok(s.suites.all.rows.every(r => r.value === null && r.n === 0));
  const md = renderAccuracyMarkdown(s);
  assert.match(md, /Heard SFX accuracy is not measured/); assert.match(md, /internal scene changes are not measured/);
});


test('ear rejection cannot silently create a new local baseline from cache', () => {
  const b = local(); b.sound.sfx = []; b.rejected = ['X01'];
  assert.throws(() => measuredResult({breakdown: b, truth: truth(), cacheHit: true}), /cannot become a local baseline/);
});


test('accuracy prose reflects whether heard results exist and states their timing limit', () => {
  const b = local(); b.listener = {status: 'merged'}; b.sound.sfx[0].heard = {verdict: 'heard', type: 'pop'};
  const s = summarize({results: [{suite: 'synthetic', name: 'a', durationSec: 10, score: scoreBreakdown(b, truth())}, {suite: 'synthetic', name: 'missing-score'}], addonBytes: null});
  const md = renderAccuracyMarkdown(s);
  assert.equal(s.suites.all.reels, 1); assert.match(md, /Heard SFX accuracy measured on 1 scored reels/);
  assert.doesNotMatch(md, /Heard SFX accuracy is not measured/);
  assert.match(md, /0\.15 s matching tolerance/); assert.match(md, /may miss this timing gate/);
});

test('every own result retains render provenance through summary and ACCURACY.md', () => {
  const results = ['deliver', 'review', 'preview'].map(mode => {
    const render = {file: `editorial-${mode}.mp4`, mode, width: mode === 'preview' ? 540 : 1080, height: mode === 'preview' ? 960 : 1920, sha256: 'a'.repeat(64)};
    const notes = mode === 'preview' ? ['Preview below the edit canvas; text reading can differ.'] : [];
    const skipped = [{file: 'bad-delivery.mp4', mode: 'deliver', reason: 'rendered stem provenance is missing or changed'},
      {file: 'corrupt.mp4', mode: null, reason: 'corrupt QC'}];
    const result = measuredResult({suite: 'own', name: `own-${mode}`, breakdown: local(), truth: truth(), truthFile: 'truth.json',
      runSec: 12, cacheHit: false, render, notes, skipped});
    assert.deepEqual(result.render, render); assert.deepEqual(result.notes, notes);
    assert.deepEqual(result.skipped, skipped);
    // The persisted result has the same fields when loaded for summary or rescore.
    return JSON.parse(JSON.stringify(result));
  });
  const s = summarize({results, addonBytes: null}), md = renderAccuracyMarkdown(s);
  for (const r of results) {
    assert.deepEqual(s.reels.find(x => x.name === r.name).render, r.render);
    assert.deepEqual(s.reels.find(x => x.name === r.name).skipped, r.skipped);
    assert.ok(md.includes(`| ${r.name} | ${r.render.mode} | ${r.render.file} | ${r.render.width}x${r.render.height} |`), md);
  }
  assert.match(md, /Own reels were measured on checked renders.*deliver, review, preview/);
  assert.match(md, /text reading can differ/);
  assert.match(md, /## own \(3 reels: 3 scored, 0 unscored; scored kinds: 1 deliver, 1 review, 1 preview\)/);
  assert.match(md, /Skipped bad-delivery\.mp4 \(deliver\): rendered stem provenance is missing or changed/);
  assert.match(md, /Skipped corrupt\.mp4 \(unknown mode\): corrupt QC/);
  assert.deepEqual(Object.keys(s.suites), ['synthetic', 'own', 'all']);
});

test('legacy own results without render identity are labelled as unrecorded', () => {
  const s = summarize({results: [{suite: 'own', name: 'legacy', score: score(1)}], addonBytes: null});
  assert.equal(s.reels[0].render, null);
  const md = renderAccuracyMarkdown(s);
  assert.match(md, /\| legacy \| not recorded; rerun own suite \| not recorded \|/);
  assert.match(md, /## own \(1 reels: 1 scored, 0 unscored; scored kinds: 1 unrecorded\)/);
});

test('own results bind the measured source to the verified render hash, including cache hits', () => {
  const render = {file: 'edit-review.mp4', mode: 'review', width: 1080, height: 1920, sha256: 'a'.repeat(64)};
  const options = {suite: 'own', name: 'own', breakdown: local(), truth: truth(), render, cacheHit: false};
  const initial = measuredResult(options);
  assert.equal(initial.render.sha256, initial.localBaseline.referenceSha256);
  const cached = measuredResult({...options, cacheHit: true, previous: initial});
  assert.deepEqual(cached.localBaseline, initial.localBaseline);
  for (const cacheHit of [false, true]) {
    const opts = {...options, cacheHit, previous: initial};
    assert.throws(() => measuredResult({...opts, breakdown: {...local(), source: {sha256: 'b'.repeat(64)}}}), /Own render hash does not match/);
    assert.throws(() => measuredResult({...opts, render: {...render, sha256: 'b'.repeat(64)}}), /Own render hash does not match/);
    assert.throws(() => measuredResult({...opts, render: {...render, sha256: undefined}}), /Own render hash does not match/);
    assert.throws(() => measuredResult({...opts, render: undefined}), /Own render hash does not match/);
  }
  for (const previous of [{...initial, render: {...render, sha256: 'b'.repeat(64)}}, {...initial, render: undefined}])
    assert.throws(() => measuredResult({...options, cacheHit: true, previous}), /Cached baseline identity changed/);
});

test('the own header and per-reel table distinguish total, scored and unscored results', () => {
  const s = summarize({results: [{suite: 'own', name: 'scored', render: {mode: 'deliver'}, score: score(1)},
    {suite: 'own', name: 'unscored', render: {mode: 'preview'}}], addonBytes: null});
  assert.deepEqual(s.suites.own.renderKinds, {deliver: 1, review: 0, preview: 0, unrecorded: 0});
  assert.equal(s.suites.own.reels, 1); assert.equal(s.suites.own.totalReels, 2); assert.equal(s.suites.own.unscoredReels, 1);
  const md = renderAccuracyMarkdown(s);
  assert.match(md, /## own \(2 reels: 1 scored, 1 unscored; scored kinds: 1 deliver\)/);
  assert.equal(s.reels.find(r => r.name === 'scored').scored, true);
  assert.equal(s.reels.find(r => r.name === 'unscored').scored, false);
  assert.match(md, /\| score status \|/);
  const onlyUnscored = renderAccuracyMarkdown(summarize({results: [{suite: 'own', name: 'pending'}], addonBytes: null}));
  assert.match(onlyUnscored, /## own \(1 reels: 0 scored, 1 unscored\)/);
  assert.match(onlyUnscored, /No own reels have scored results/);
});

function storedScores() {
  const render = {file: 'edit-review.mp4', mode: 'review', width: 1080, height: 1920, sha256: 'a'.repeat(64)};
  return ['before', 'middle', 'after'].map((name, i) => measuredResult({suite: i === 0 ? 'synthetic' : 'own', name,
    breakdown: local(), truth: truth(), truthFile: `${name}.json`, render: structuredClone(render),
    cacheHit: false, runSec: 12, notes: ['retained note'], skipped: [{file: 'bad.mp4', mode: 'deliver', reason: 'QC not ok'}]}));
}

test('rescore validates every result before writing and leaves all files alone on legacy or invalid truth', async () => {
  for (const failure of ['legacy', 'truth']) {
    const results = storedScores(), visited = [], writes = [];
    if (failure === 'legacy') delete results[1].render.sha256;
    const before = structuredClone(results);
    await assert.rejects(rescore({loadResults: async () => results,
      loadBreakdown: async (project, ref) => { assert.equal(project, 'breakdown-accuracy'); visited.push(ref); return {breakdown: local()}; },
      loadTruth: async file => file === 'middle.json' && failure === 'truth' ? {...truth(), fps: 60} : truth(),
      saveResult: async (file, result) => writes.push({file, result})}), error => {
      assert.match(error.message, /no results were written/); assert.match(error.message, /own\/middle:/);
      assert.match(error.message, failure === 'legacy' ? /Own render hash does not match/ : /Stored baseline or truth identity changed/);
      return true;
    });
    assert.deepEqual(visited, results.map(r => r.referenceId));
    assert.deepEqual(writes, []); assert.deepEqual(results, before);
  }
});

test('rescore writes every validated result after preflight and preserves local baselines and provenance', async () => {
  const results = storedScores(), before = structuredClone(results), visited = [], writes = [];
  const current = local(); current.listener = {status: 'merged'};
  current.sound.sfx[0].heard = {verdict: 'heard', type: 'pop'};
  const out = await rescore({loadResults: async () => results,
    loadBreakdown: async (_, ref) => { visited.push(ref); return {breakdown: structuredClone(current)}; },
    loadTruth: async () => truth(), saveResult: async (file, next) => {
      assert.equal(visited.length, results.length);
      writes.push({file: path.basename(file), next: structuredClone(next)});
    }});
  assert.deepEqual(writes.map(w => w.file), ['synthetic-before.json', 'own-middle.json', 'own-after.json']);
  for (let i = 0; i < results.length; i++) {
    const {next} = writes[i];
    assert.deepEqual(next.localBaseline, results[i].localBaseline);
    assert.deepEqual(next.render, results[i].render); assert.deepEqual(next.skipped, results[i].skipped);
    assert.deepEqual(next.notes, results[i].notes); assert.equal(next.listener, 'merged');
    assert.deepEqual(next.score.rows.filter(r => r.measure !== 'sfxF1Heard'), results[i].score.rows.filter(r => r.measure !== 'sfxF1Heard'));
    assert.deepEqual(out[i], {suite: results[i].suite, name: results[i].name, listener: 'merged'});
  }
  assert.deepEqual(results, before);
});

test('local rescore rebuilds scoring and migrates only own annotation scope, refusing heard inputs before writes', async () => {
  const originalTruth={...truth(),source:'own-render',text:[]}, b=local();b.text=[{text:'graphic label',start:1,end:2}];
  const r=measuredResult({suite:'own',name:'local-scope',breakdown:b,truth:originalTruth,truthFile:path.resolve('state/tmp/local-truth.json'),
    render:{file:'review.mp4',mode:'review',sha256:b.source.sha256},cacheHit:false});
  // Reproduce rows persisted before the scoring fix, without changing truth.
  for(const row of r.localBaseline.score.rows)if(['textRecall','textCer'].includes(row.measure))Object.assign(row,{value:row.measure==='textRecall'?0:1,target:row.measure === 'textRecall' ? .9 : .1,pass:false});
  r.score=structuredClone(r.localBaseline.score);
  assert.equal(r.score.rows.find(x=>x.measure==='textRecall').pass,false);
  const writes=[],truthWrites=[];
  const options={loadResults:async()=>[r],loadBreakdown:async()=>({breakdown:b}),loadTruth:async()=>originalTruth,
    saveResult:async(_,next)=>writes.push(next),saveTruth:async(_,next)=>truthWrites.push(next)};
  await rescoreLocal(options);
  assert.equal(truthWrites[0].textScope,'captions-only');
  assert.deepEqual(truthWrites[0].sound,originalTruth.sound);assert.deepEqual(truthWrites[0].cuts,originalTruth.cuts);
  assert.equal(writes[0].localBaseline.score.rows.find(x=>x.measure==='textRecall').pass,null);
  assert.notEqual(writes[0].localBaseline.truthSha256,r.localBaseline.truthSha256);
  assert.equal(originalTruth.textScope,undefined);
  for(const mutate of [x=>x.listener={status:'merged'},x=>x.sound.sfx[0].basis='heard',x=>x.rejected=['X01']]){
    const heard=structuredClone(b);mutate(heard);writes.length=0;truthWrites.length=0;
    const skipped=await rescoreLocal({...options,loadBreakdown:async()=>({breakdown:heard})});
    assert.equal(skipped[0].skipped,true);assert.match(skipped[0].reason,/cannot rebuild a local baseline/);
    assert.equal(writes.length,0);assert.equal(truthWrites.length,0);
  }
});

test('mixed and whole-cache runs cannot populate cold benchmark seconds or the benchmark table',()=>{
  for(const cacheState of ['mixed','warm','unknown']){
    const timing={cacheState,wallSec:1,stages:[{stage:'asr',cacheHit:true,state:'warm'}]};
    const r=measuredResult({suite:'synthetic',name:cacheState,breakdown:local(),truth:truth(),runSec:1,timing,cacheHit:false});
    assert.equal(r.coldRunSec,null);
    const s=summarize({results:[r],addonBytes:null});assert.equal(s.reels[0].secondsPer60,null);
    assert.match(renderAccuracyMarkdown(s),new RegExp(`${cacheState} \\| not measured cold \\| 1 \\| ${cacheState}`));
  }
});

test('local rescore retries every partial result/truth save without force and refuses event changes',async()=>{
  const {createHash}=await import('node:crypto');
  const hash=t=>createHash('sha256').update(JSON.stringify(t)).digest('hex');
  for(const stopAt of [1,2,3,4]){
    const truths=new Map(),results=new Map();
    for(const name of ['first','second']){
      const truthFile=path.resolve(`state/tmp/scope-retry-${name}.json`),tr={...truth(),source:'own-render',text:[]};truths.set(truthFile,tr);
      results.set(name,measuredResult({suite:'own',name,truthFile,truth:tr,breakdown:local(),cacheHit:false,
        render:{file:'render.mp4',mode:'review',sha256:local().source.sha256}}));
    }
    let writes=0,interrupt=true;
    // Also recover a scope-first interruption left by the previous writer.
    if(stopAt===1){const f=results.get('first').truthFile;truths.set(f,{...truths.get(f),textScope:'captions-only'});}
    const saved=()=>{if(++writes===stopAt&&interrupt)throw new Error('simulated stop');};
    const options={loadResults:async()=>structuredClone([...results.values()]),loadBreakdown:async()=>({breakdown:local()}),
      loadTruth:async f=>structuredClone(truths.get(f)),saveResult:async(_,next)=>{results.set(next.name,structuredClone(next));saved();},
      saveTruth:async(f,next)=>{truths.set(f,structuredClone(next));saved();}};
    await assert.rejects(rescoreLocal(options),/simulated stop/);
    interrupt=false;
    await rescore(options); // Ordinary rescore also tolerates scope-only partial migration.
    await rescoreLocal(options);
    for(const r of results.values()){
      assert.equal(truths.get(r.truthFile).textScope,'captions-only');assert.equal(r.localBaseline.truthSha256,hash(truths.get(r.truthFile)));
    }
    truths.get(results.get('first').truthFile).cuts.push({t:9,kind:'cut'});
    writes=0;await assert.rejects(rescoreLocal(options),/truth identity changed/);assert.equal(writes,0);
  }
});

test('a heard result is reported as skipped while an unrelated local result is updated',async()=>{
  const records=storedScores().slice(0,2),b=local(),heard=local();heard.listener={status:'merged'};
  records[1].referenceId='ref-bbbbbbbbbbbb';records[1].render.sha256='b'.repeat(64);records[1].localBaseline.referenceSha256='b'.repeat(64);
  const other={...b,referenceId:records[1].referenceId,source:{sha256:'b'.repeat(64)}},writes=[];
  const out=await rescoreLocal({loadResults:async()=>records,loadBreakdown:async(_,ref)=>({breakdown:ref===records[1].referenceId?other:heard}),
    loadTruth:async()=>truth(),saveResult:async(_,next)=>writes.push(next)});
  assert.equal(out[0].skipped,true);assert.match(out[0].reason,/heard or ear-reviewed/);
  assert.deepEqual(writes.map(r=>r.name),[records[1].name]);
});

test('held-out scores remain separate and per-reel speed and stage timing reach the summary',()=>{
  const timing={schema:1,wallSec:12,cacheState:'cold',stages:[{stage:'text',wallSec:5,cacheHit:false,state:'cold'}]};
  const result=measuredResult({suite:'synthetic',name:'timed',breakdown:local(),truth:truth(),runSec:12,cacheHit:false,timing});
  const s=summarize({results:[result,{suite:'heldout',name:'separate',durationSec:10,runSec:100,score:score(0)}],addonBytes:null});
  assert.equal(s.suites.all.reels,1);assert.equal(s.suites.heldout.reels,1);assert.deepEqual(s.reels[0].timing,timing);
  assert.equal(s.reels[0].secondsPer60,72);
  const md=renderAccuracyMarkdown(s);assert.match(md,/heldout \(1 reels\)/);assert.match(md,/timed \| 72 \| 12 \| cold/);
});
