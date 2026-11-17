import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT} from '../scripts/lib/project-paths.mjs';
import {PROJECT_TMP} from '../scripts/lib/project-tmp.mjs';
import {sha256File} from '../scripts/lib/studio-download.mjs';
import {inspectBreakdownRuntime,runtimeTestSkip} from '../scripts/lib/breakdown-runtime.mjs';
import {buildSyntheticReel} from '../scripts/lib/breakdown-fixture.mjs';
import {prepareReference} from '../scripts/lib/breakdown-prepare.mjs';
import {analysisIdentity,buildProjectDna,runBreakdown,collectSpeech,readBreakdown} from '../scripts/breakdown.mjs';
const execute=promisify(execFile);

test('inspect and help need neither report nor optional Python runtime',async()=>{
  const {stdout}=await execute(process.execPath,['scripts/breakdown.mjs','inspect'],{cwd:ROOT,windowsHide:true,env:{...process.env,GEMINI_API_KEY:'AIzaTESTKEY_abcdefghijklmnop1234'}});
  const result=JSON.parse(stdout);assert.equal(typeof result.ready,'boolean');assert.ok(result.paths.root.startsWith(ROOT));
  const {stdout:help}=await execute(process.execPath,['scripts/breakdown.mjs','--help'],{cwd:ROOT,windowsHide:true});assert.match(help,/apply-review/);
  await assert.rejects(()=>execute(process.execPath,['scripts/breakdown.mjs','report','--project','safe','--ref','../bad'],{cwd:ROOT,windowsHide:true}),/reference id/);
});
test('speech succeeds, fails or is disabled without invoking an installer',async()=>{
  const prepared={source:{path:'named-reference.mp4'},workDir:path.join(PROJECT_TMP,'speech-contract'),probe:{hasAudio:true,durationSec:3}};
  let calls=0;const transcribe=async args=>{calls++;assert.equal(args.media,'named-reference.mp4');assert.equal(args.lang,'ar');};
  const captions=[{text:'كلام',startMs:100,endMs:900}];
  const ok=await collectSpeech(prepared,{transcribe,read:async()=>captions});assert.deepEqual(ok,{captions,limitation:null,cacheHit:null});
  const failure=await collectSpeech(prepared,{transcribe:async()=>{throw new Error('runtime absent');}});assert.equal(failure.captions,null);assert.match(failure.limitation,/runtime absent/);
  assert.equal((await collectSpeech(prepared,{speech:'off',transcribe})).captions,null);
  assert.equal((await collectSpeech({...prepared,probe:{hasAudio:false}},{transcribe})).captions,null);assert.equal(calls,1);
  assert.ok((await collectSpeech(prepared,{transcribe,read:async()=>({})})).limitation);
});
test('stored prepared paths cannot redirect report reads to another reference',async t=>{
  const slug=`breakdown-test-identity-${Date.now()}`,ref='ref-123456789abc';const dir=path.join(ROOT,'Projects',slug,'style-analysis',ref);
  await fsp.mkdir(path.join(dir,'work'),{recursive:true});t.after(()=>fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true}));
  await fsp.writeFile(path.join(dir,'breakdown.json'),JSON.stringify({schema:1,referenceId:ref,source:{sha256:'1'.repeat(64)}}));
  await fsp.writeFile(path.join(dir,'work','prepare.json'),JSON.stringify({schema:1,referenceId:ref,source:{sha256:'1'.repeat(64)},outDir:'../outside',proxy:{path:'../source'}}));
  await assert.rejects(()=>readBreakdown(slug,ref),/identity|paths/);
});
const readiness=await inspectBreakdownRuntime();
const skip=runtimeTestSkip(readiness) || (!fs.existsSync(path.join(ROOT,'scripts/lib/breakdown-report.mjs')) ? 'Real Claude report implementation has not arrived.' : false);
test('complete real fixture pipeline writes report and layers, preserves source and reuses cache', {skip,timeout:600000},async t=>{
  const dir=await fsp.mkdtemp(path.join(PROJECT_TMP,'breakdown-run-')),slug='breakdown-test-'+path.basename(dir).slice(-6).toLowerCase();
  t.after(async()=>{await fsp.rm(dir,{recursive:true,force:true});await fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true});});
  const fixture=await buildSyntheticReel(dir),before=await sha256File(fixture.video);
  let presenceCalls=0;
  const presence=async ({shots,durationSec,force})=>{
    presenceCalls++;
    assert.equal(force,true);
    const {summarisePresenter}=await import('../scripts/lib/breakdown-presenter.mjs');
    const samples=Array.from({length:Math.ceil(durationSec*2)},(_,i)=>({timeSec:i/2,faces:i%2?[{width:.2,height:.3,score:.9}]:[]}));
    return {presenter:summarisePresenter(samples,{shots,durationSec}),limitation:null,cacheHit:false};
  };
  const first=await runBreakdown({reference:fixture.video,project:slug,speech:'off',cold:true,presence,cores:8});assert.equal(first.cacheHit,false);
  assert.equal(first.timing.cacheState,'cold');assert.equal(first.timing.coldRequested,true);
  const breakdown=JSON.parse(await fsp.readFile(path.join(first.outDir,'breakdown.json'),'utf8'));assert.equal(breakdown.schema,1);assert.ok(breakdown.shots.length>0);assert.equal(breakdown.presenter.share,.5);assert.ok(Number.isFinite(breakdown.look.metrics.meanLevel));
  for(const file of ['BREAKDOWN.md','timeline.md','picture.md','text.md','sound.md','look.md','studio-recipe.md','report/report.html'])assert.ok(fs.existsSync(path.join(first.outDir,file)),file);
  const savedHash=await sha256File(path.join(first.outDir,'breakdown.json'));
  const again=await runBreakdown({reference:fixture.video,project:slug,speech:'off',presence,cores:16});assert.equal(again.cacheHit,true);assert.equal(presenceCalls,1);assert.equal(await sha256File(fixture.video),before);
  assert.equal(await sha256File(path.join(first.outDir,'breakdown.json')),savedHash);
  assert.equal(first.timing.resources.cores,8);assert.equal(again.timing.resources.cores,16);
  for (const stage of ['readiness','prepare','shots','presenter','camera','overlays','look','text','sound','publish']) assert.ok(first.timing.stages.some(s => s.stage === stage), stage);
  assert.equal(first.timing.stages.find(s => s.stage === 'shots').cacheHit, false);
  assert.equal(again.timing.cacheState, 'warm');
  assert.equal(again.timing.stages.find(s => s.stage === 'analysis-cache').cacheHit, true);
  assert.deepEqual(JSON.parse(await fsp.readFile(path.join(first.outDir, 'work/run-timing.json'), 'utf8')), again.timing);
});

test('stale review tasks are refused before loading a report or modifying the stored breakdown',async t=>{
  const {main}=await import('../scripts/breakdown.mjs');
  const slug='breakdown-test-stale-'+Date.now(),ref='ref-111111111111',outDir=path.join(ROOT,'Projects',slug,'style-analysis',ref),workDir=path.join(outDir,'work');
  await fsp.mkdir(workDir,{recursive:true});t.after(()=>fsp.rm(path.join(ROOT,'Projects',slug),{recursive:true,force:true}));
  const file=path.join(outDir,'breakdown.json'),proxy=path.join(workDir,'proxy.mp4');await fsp.writeFile(proxy,'proxy');
  const b={schema:1,referenceId:ref,source:{sha256:'1'.repeat(64)},reviewQueue:[]};await fsp.writeFile(file,JSON.stringify(b));const before=await fsp.readFile(file);
  const prepared={schema:1,referenceId:ref,source:{sha256:'1'.repeat(64)},outDir,workDir,proxy:{path:proxy},wav:null,cache:{proxySha256:await sha256File(proxy)}};await fsp.writeFile(path.join(workDir,'prepare.json'),JSON.stringify(prepared));
  const answers=path.join(workDir,'answers.json');await fsp.writeFile(answers,'[]');await fsp.writeFile(path.join(outDir,'review_tasks.json'),JSON.stringify({breakdownSha256:'stale',tasks:[]}));
  await assert.rejects(()=>main(['apply-review','--project',slug,'--ref',ref,'--answers',answers]),/stale/);
  await assert.rejects(()=>main(['apply-review','--project',slug,'--ref',ref,'--answers',answers,'--heard-by','creator']),/stale/);assert.deepEqual(await fsp.readFile(file),before);
});

test('external-source transcription limitations identify the local Arabic ASR restriction',async()=>{
 const p={source:{path:'external.mp4'},workDir:path.join(PROJECT_TMP,'speech-contract'),probe:{hasAudio:true,durationSec:1}};
 const result=await collectSpeech(p,{transcribe:async()=>{throw new Error('Source must be an existing project-local file.');}});
 assert.match(result.limitation,/External references/);assert.match(result.limitation,/Arabic ASR/);
});

test('run records an injected presenter measurement and its limitation', {skip, timeout: 600000}, async t => {
  const dir = await fsp.mkdtemp(path.join(PROJECT_TMP, 'breakdown-presenter-')), slug = 'breakdown-test-p' + path.basename(dir).slice(-6).toLowerCase();
  t.after(async () => { await fsp.rm(dir, {recursive: true, force: true}); await fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}); });
  const fixture = await buildSyntheticReel(dir);
  // Synthetic cached probe rounding: the decoded proxy is slightly longer.
  const prepared = await prepareReference({reference: fixture.video, project: slug});
  prepared.probe.durationSec = prepared.proxy.durationSec - .01;
  await fsp.writeFile(path.join(prepared.workDir, 'prepare.json'), JSON.stringify(prepared));
  let asked;
  const presence = async args => { asked = args; return {presenter: null, limitation: 'Presenter share was not measured: test.'}; };
  const result = await runBreakdown({reference: fixture.video, project: slug, speech: 'off', presence});
  const b = JSON.parse(await fsp.readFile(path.join(result.outDir, 'breakdown.json'), 'utf8'));
  assert.ok(asked.proxy.endsWith(path.join('work', 'proxy.mp4')));
  assert.ok(asked.shots.length > 0);
  assert.equal(asked.durationSec, prepared.proxy.durationSec);
  assert.notEqual(asked.durationSec, prepared.probe.durationSec);
  assert.equal(b.durationSec, asked.durationSec);
  assert.equal(b.presenter, null);
  assert.ok(b.limitations.includes('Presenter share was not measured: test.'));
});

test('DNA command reports references removed by replacement and none for a protected proposal', async t => {
  const slug = `breakdown-test-scope-${crypto.randomUUID().slice(0, 8)}`;
  t.after(() => fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}));
  const a = await storeDnaReference(slug, 'a'), b = await storeDnaReference(slug, 'b');
  const {main} = await import('../scripts/breakdown.mjs');
  const invoke = async refs => {
    const logs = [], original = console.log;
    console.log = line => logs.push(line);
    try { await main(['dna', '--project', slug, '--ref', refs.join(',')]); }
    finally { console.log = original; }
    return JSON.parse(logs.at(-1));
  };
  assert.deepEqual((await invoke([a.ref])).removedReferences, []);
  const replaced = await invoke([b.ref]);
  assert.deepEqual(replaced.removedReferences, [a.ref]);
  assert.ok(replaced.revisions.some(file => file.endsWith('STYLE_DNA.json')));
  assert.deepEqual((await invoke([a.ref, b.ref])).removedReferences, []);
  const file = path.join(ROOT, 'Projects', slug, 'STYLE_DNA.json');
  const manual = {...JSON.parse(await fsp.readFile(file, 'utf8')), status: 'awaiting-review'};
  await fsp.writeFile(file, JSON.stringify(manual));
  const proposed = await invoke([b.ref]);
  assert.deepEqual(proposed.removedReferences, []);
  assert.ok(proposed.proposals.includes('STYLE_DNA.proposal.json'));
  assert.deepEqual(JSON.parse(await fsp.readFile(file, 'utf8')).references.map(r => r.id), [a.ref, b.ref]);
});

test('dna writes a draft from a stored breakdown and refuses an unknown reference', async t => {
  const {main} = await import('../scripts/breakdown.mjs');
  const slug = 'breakdown-test-dna-' + Date.now(), ref = 'ref-222222222222', sha = '2'.repeat(64);
  const outDir = path.join(ROOT, 'Projects', slug, 'style-analysis', ref), workDir = path.join(outDir, 'work');
  await fsp.mkdir(workDir, {recursive: true});
  t.after(() => fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}));
  const proxy = path.join(workDir, 'proxy.mp4');
  await fsp.writeFile(proxy, 'proxy');
  const meta = {basis: 'measured', confidence: 'high', status: 'confirmed'};
  const b = {schema: 1, referenceId: ref, source: {name: 'synthetic.mp4', sha256: sha}, durationSec: 6, aspect: '720x1280',
    pace: {cutCount: 3, cutsPerMinute: 30, shotLen: {min: 1.5, median: 1.5, max: 1.5}},
    shots: [0, 1.5, 3, 4.5].map((s, i) => ({id: `S0${i + 1}`, start: s, end: s + 1.5, len: 1.5, camera: {label: 'static', ...meta}})),
    cuts: [1.5, 3, 4.5].map((t, i) => ({id: `C0${i + 1}`, t, kind: 'cut', scale: null, ...meta})),
    transitions: [], events: [], text: [], overlays: [], look: {label: 'muted', metrics: {meanLevel: 70}, ...meta}, presenter: null,
    sound: {hasAudio: false, sfx: [], hitsPerMinute: null, bed: null, tempo: null, beats: [], cutsOnBeat: null, speech: null},
    limitations: ['The reference has no audio.'], reviewQueue: []};
  await fsp.writeFile(path.join(outDir, 'breakdown.json'), JSON.stringify(b));
  await fsp.writeFile(path.join(workDir, 'prepare.json'), JSON.stringify({schema: 1, referenceId: ref, source: {sha256: sha}, outDir, workDir, proxy: {path: proxy}, wav: null, cache: {proxySha256: await sha256File(proxy)}}));
  const logs = [];
  const original = console.log;
  console.log = line => logs.push(line);
  try { await main(['dna', '--project', slug, '--ref', ref]); } finally { console.log = original; }
  const result = JSON.parse(logs.at(-1));
  assert.deepEqual(result.written.sort(), ['STYLE_DNA.json', 'STYLE_DNA.md', `style-analysis/${ref}.md`]);
  const dna = JSON.parse(await fsp.readFile(path.join(ROOT, 'Projects', slug, 'STYLE_DNA.json'), 'utf8'));
  assert.equal(dna.status, 'draft');
  assert.ok(dna.observedInvariants.some(x => x.key === 'cuts.kind'));
  await assert.rejects(() => main(['dna', '--project', slug, '--ref', 'ref-333333333333']), /ENOENT|no such file/);
});

test('analysis identity hashes actual models and every reframe measurement source before a cache hit', async () => {
  const prepared = {source: {sha256: 'a'.repeat(64)}, cache: {schema: 1}, workDir: path.join(ROOT, 'Projects/identity/work')};
  const baselineFiles = new Map(), changes = new Map();
  const hashFile = async file => {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    baselineFiles.set(rel, true);
    return changes.has(rel) ? changes.get(rel) : '1'.repeat(64);
  };
  let inputs;
  const base = await analysisIdentity(prepared, 'off', {}, {hashFile,observe:value=>{inputs=value;}});
  assert.equal(Object.hasOwn(inputs,'execution'),false);
  assert.equal(baselineFiles.has('scripts/lib/breakdown-session.mjs'),false);
  const sensitive = ['scripts/lib/reframe-core.mjs', 'scripts/lib/reframe-runtime.mjs', 'scripts/lib/reframe-pipeline.mjs', 'scripts/lib/face-merge.mjs', 'scripts/lib/face-model-pins.json', 'scripts/lib/breakdown-presenter.mjs', 'scripts/lib/breakdown-merge.mjs'];
  const {FACE_MODELS} = await import('../scripts/lib/reframe-runtime.mjs');
  for (const model of FACE_MODELS) sensitive.push(model.path);
  for (const rel of sensitive) {
    assert.ok(baselineFiles.has(rel), rel);
    changes.set(rel, '2'.repeat(64));
    assert.notEqual(await analysisIdentity(prepared, 'off', {}, {hashFile}), base, rel);
    changes.clear();
  }
  changes.set(FACE_MODELS[0].path, null);
  assert.notEqual(await analysisIdentity(prepared, 'off', {}, {hashFile}), base);
});

async function storeDnaReference(slug, digit) {
  const {listReel} = await import('./fixtures/breakdown-list-reel.mjs');
  const b = listReel(), sha = digit.repeat(64), ref = `ref-${digit.repeat(12)}`;
  b.referenceId = ref; b.source.sha256 = sha;
  const outDir = path.join(ROOT, 'Projects', slug, 'style-analysis', ref), workDir = path.join(outDir, 'work');
  await fsp.mkdir(workDir, {recursive: true});
  const proxy = path.join(workDir, 'proxy.mp4');
  await fsp.writeFile(proxy, 'synthetic proxy');
  await fsp.writeFile(path.join(outDir, 'breakdown.json'), JSON.stringify(b));
  await fsp.writeFile(path.join(workDir, 'prepare.json'), JSON.stringify({schema: 1, referenceId: ref, source: {sha256: sha}, outDir, workDir, proxy: {path: proxy}, wav: null, cache: {proxySha256: await sha256File(proxy)}}));
  return {ref, outDir, workDir, breakdown: b};
}

test('DNA takes sorted reference leases before its project lease and releases every lock', async t => {
  const slug = `breakdown-test-locks-${crypto.randomUUID().slice(0, 8)}`;
  t.after(() => fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}));
  const a = await storeDnaReference(slug, 'a'), b = await storeDnaReference(slug, 'b');
  const open = fsp.open, seen = [];
  fsp.open = async (file, ...args) => { if (String(file).endsWith('.lock')) seen.push(file); return open(file, ...args); };
  let result;
  try { result = await buildProjectDna({project: slug, refs: [b.ref, a.ref, b.ref]}); }
  finally { fsp.open = open; }
  assert.deepEqual(seen.map(file => path.relative(path.join(ROOT, 'Projects', slug), file).split(path.sep).join('/')), [
    `style-analysis/${a.ref}/work/breakdown.lock`, `style-analysis/${b.ref}/work/breakdown.lock`, 'style-analysis/dna.lock']);
  assert.equal(result.status, 'draft');
  assert.equal(result.needsConfirmation, 4);
  assert.ok(result.written.includes(`style-analysis/${a.ref}.md`));
  assert.ok(result.written.includes(`style-analysis/${b.ref}.md`));
  for (const file of seen) await assert.rejects(() => fsp.stat(file), {code: 'ENOENT'});
});

test('DNA refuses a breakdown saved after its snapshot and writes no draft', async t => {
  const slug = `breakdown-test-stale-dna-${crypto.randomUUID().slice(0, 8)}`;
  t.after(() => fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}));
  const ref = await storeDnaReference(slug, 'c'), file = path.join(ref.outDir, 'breakdown.json');
  const open = fsp.open;
  fsp.open = async (target, ...args) => {
    if (String(target).endsWith('breakdown.lock')) await fsp.writeFile(file, JSON.stringify({...ref.breakdown, analysedAt: 'manual save'}));
    return open(target, ...args);
  };
  try { await assert.rejects(() => buildProjectDna({project: slug, refs: [ref.ref]}), /stale save/); }
  finally { fsp.open = open; }
  await assert.rejects(() => fsp.stat(path.join(ROOT, 'Projects', slug, 'STYLE_DNA.json')), {code: 'ENOENT'});
  await assert.rejects(() => fsp.stat(path.join(ref.workDir, 'breakdown.lock')), {code: 'ENOENT'});
});

test('an existing reference lease blocks DNA and preserves its owner', async t => {
  const slug = `breakdown-test-busy-dna-${crypto.randomUUID().slice(0, 8)}`;
  t.after(() => fsp.rm(path.join(ROOT, 'Projects', slug), {recursive: true, force: true}));
  const ref = await storeDnaReference(slug, 'd'), lock = path.join(ref.workDir, 'breakdown.lock');
  await fsp.writeFile(lock, JSON.stringify({pid: process.pid, token: 'another-operation'}));
  const before = await fsp.readFile(lock, 'utf8');
  await assert.rejects(() => buildProjectDna({project: slug, refs: [ref.ref]}), /Reference analysis is locked/);
  assert.equal(await fsp.readFile(lock, 'utf8'), before);
  await assert.rejects(() => fsp.stat(path.join(ROOT, 'Projects', slug, 'style-analysis/dna.lock')), {code: 'ENOENT'});
});
