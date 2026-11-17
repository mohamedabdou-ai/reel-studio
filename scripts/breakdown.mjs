import {estimateListenerCost, loadListenerConfig} from './lib/breakdown-listener-request.mjs';
import {KEY_FILE, ListenerError, listenToReference, resolveGeminiKey, saveGeminiKey, redactListenerText, redactListenerData} from './lib/breakdown-listener.mjs';
import {mergeHeard, recordListenerFailure} from './lib/breakdown-heard.mjs';

import './lib/project-tmp.mjs';
import {measurePresenter} from './lib/breakdown-presenter.mjs';
import {buildDna, renderDnaMarkdown, renderEvidenceMarkdown, writeDnaFiles} from './lib/breakdown-dna.mjs';
import {buildRecipe} from './lib/breakdown-recipe.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {ROOT, run, parseArgs} from './lib/media.mjs';
import {acquireFileLease} from './lib/python-venv.mjs';
import {assertProjectOutput} from './lib/project-paths.mjs';
import {sha256File} from './lib/studio-download.mjs';
import {transcribeMedia} from './lib/transcription-run.mjs';
import {WHISPER_RUNTIME_FILE} from './lib/transcription-install.mjs';
import {inspectBreakdownRuntime, installBreakdownRuntime, loadPins, modelPaths} from './lib/breakdown-runtime.mjs';
import {prepareReference, outDirFor, guardedFile, atomicJson, referenceIdFor} from './lib/breakdown-prepare.mjs';
import {runAnalyser} from './lib/breakdown-python.mjs';
import {analyserSession,resourceBudget,overlap,assertExecutionUnchanged,planSpeech} from './lib/breakdown-session.mjs';
import {analysisDuration, mergeBreakdown, speechStats} from './lib/breakdown-merge.mjs';
import {buildReviewTasks, applyReview, applyEarReview, reviewIdentity} from './lib/breakdown-review.mjs';
import {writeLayers} from './lib/breakdown-layers.mjs';
import {createRunTiming} from './lib/breakdown-timing.mjs';
import {exactPcmSilence} from './lib/breakdown-pcm.mjs';

const USAGE = `Usage:
  node scripts/breakdown.mjs inspect
  node scripts/breakdown.mjs install [--python <existing Python 3.10-3.13>] [--artifact-dir <local staging>] [--allow-download after a NEW user yes]
  node scripts/breakdown.mjs run <reference> --project <slug> [--speech on|off] [--force] [--cold]
  node scripts/breakdown.mjs review --project <slug> --ref <referenceId> [--limit 25]
  node scripts/breakdown.mjs apply-review --project <slug> --ref <referenceId> --answers <file> [--heard-by creator]
  node scripts/breakdown.mjs listen --project <slug> --ref <referenceId> [--consent yes]
  node scripts/breakdown.mjs listener-key   (saved unencrypted; programs running as your account can read it)
  node scripts/breakdown.mjs report --project <slug> --ref <referenceId>
  node scripts/breakdown.mjs dna --project <slug> --ref <referenceId>[,<referenceId>...]
Speech transcription uses the existing Arabic (ar) runtime and project-local sources only. External references still receive picture/audio analysis, with a transcription limitation.`;

async function reportWriter() {
  const file = path.join(ROOT, 'scripts', 'lib', 'breakdown-report.mjs');
  if (!fs.existsSync(file)) throw new Error('Arabic report implementation is unavailable. Integrate Claude lane before running the report pipeline.');
  return (await import(pathToFileURL(file).href)).writeReport;
}
export async function collectSpeech(prepared, {speech = 'on', force = false, voiceEvidence = null, threads, signal, onRun, transcribe = transcribeMedia, read = file => fsp.readFile(file, 'utf8').then(JSON.parse)} = {}) {
  if (!['on','off'].includes(speech)) throw new Error('--speech accepts on or off.');
  if (!prepared.probe.hasAudio || speech === 'off') return {captions: null, limitation: null};
  if (prepared.wav?.path && await exactPcmSilence(prepared.wav.path, prepared.cache?.wavSha256))
    return {captions: [], limitation: null, cacheHit: false, skipped: true, reason: 'The complete prepared PCM is digitally silent; ASR was not run.'};
  try {
    const out = guardedFile(prepared.workDir, 'transcript');
    // Default-off until the coordinator validates DSP recall on unseen
    // voice-over-music material. DSP absence alone is not a safe VAD gate.
    const vad = false;
    let vadOnlySpeech = false;
    let result = await transcribe({media: prepared.source.path, lang: 'ar', out, force, vad,...(threads ? {threads} : {})}, {signal,onRun,onProgress: line => console.error(line)});
    let captions = await read(guardedFile(out, 'captions.json'));
    const evidence=typeof voiceEvidence==='function'?await voiceEvidence():voiceEvidence;
    const independent = evidence?.schema === 1 && typeof evidence.hasVoicing === 'boolean' && Array.isArray(evidence.independentSpans);
    const hasVoice = independent && (evidence.hasVoicing === true || evidence.possibleVoicing === true
      || evidence.independentSpans.length > 0 || evidence.yamnet?.status === 'failed');

    // If a backend/cache reports VAD despite affirmative voice evidence, do not
    // let a zero-word response erase speech: bypass that cache and retry plain.
    if (Array.isArray(captions) && result?.report?.runtime?.vad === true) {
      vadOnlySpeech = !hasVoice && captions.length > 0;
      result = await transcribe({media: prepared.source.path, lang:'ar', out, force:true, vad:false,...(threads?{threads}:{})}, {signal,onRun,onProgress:line=>console.error(line)});
      captions = await read(guardedFile(out, 'captions.json'));
    }
    if (!Array.isArray(captions)) throw new Error('Transcription returned no caption array.');
    speechStats(captions, prepared.probe.durationSec);
    return {captions, cacheHit: typeof result?.cached === 'boolean' ? result.cached : null,
      limitation: vadOnlySpeech ? 'speech found by VAD only; plain ASR was rerun without using the VAD-only hypothesis.'
        : result?.report?.requiresReview ? 'Speech is an unverified ASR draft; review the original audio before using its wording or timing.' : null};
  } catch (e) { if(signal?.aborted)throw signal.reason??e;const detail=e.message.includes('project-local file') ? 'External references cannot be transcribed by the existing project-local Arabic ASR; picture and audio measurement can continue.' : e.message; return {captions: null, limitation: `Speech transcription failed: ${detail}`}; }
}
async function loudnessOf(reference) {
  try { const {stdout} = await run(process.execPath, [path.join(ROOT, 'scripts', 'audio.mjs'), reference], {cwd: ROOT}); return JSON.parse(stdout).loudness ?? null; }
  catch { return null; }
}
async function withReferenceLock(prepared, operation) {
  const lock = guardedFile(prepared.workDir, 'breakdown.lock');
  await fsp.mkdir(prepared.workDir, {recursive: true});
  const release = await acquireFileLease(lock,{label:'Reference analysis'});
  try { return await operation(); }
  finally { await release(); }
}
async function writeOutputs(breakdown, prepared, writeReport, expectedSha256) {
  const file = guardedFile(prepared.outDir, 'breakdown.json');
  const stage = guardedFile(prepared.workDir, `publish-${randomUUID()}`);
  await fsp.mkdir(stage);
  try {
    const recipe = buildRecipe(breakdown);
    await writeLayers(breakdown, stage, {recipe});
    const report = await writeReport({breakdown, prepared, dir: stage, recipe});
    if (path.resolve(report) !== path.join(stage, 'report', 'report.html') || !fs.existsSync(report)) throw new Error('Report writer violated its output contract.');
    if (await sha256File(file) !== expectedSha256) throw new Error('Breakdown changed while writing; refusing a stale save.');
    const files = [];
    async function promote(current, relative = '') {
      for (const entry of await fsp.readdir(current, {withFileTypes:true})) {
        if (!relative && !['BREAKDOWN.md','timeline.md','picture.md','text.md','sound.md','look.md','studio-recipe.md','report'].includes(entry.name)) throw new Error('Unexpected generated output.');
        const rel = path.join(relative, entry.name), target = guardedFile(prepared.outDir, rel), source = guardedFile(stage, rel);
        if (entry.isDirectory()) { await fsp.mkdir(target, {recursive:true}); await promote(source, rel); }
        else if (entry.isFile()) { await fsp.rename(source, assertProjectOutput(target)); files.push(target); }
        else throw new Error('Generated output contains an unsupported filesystem link.');
      }
    }
    await promote(stage);
    if (await sha256File(file) !== expectedSha256) throw new Error('Breakdown changed before publication; refusing a stale save.');
    await atomicJson(file, breakdown);
    const stillDir = guardedFile(prepared.outDir, 'report/stills');
    const wanted = new Set(breakdown.shots.map(s=>s.id+'.jpg'));
    for (const entry of await fsp.readdir(stillDir,{withFileTypes:true})) {
      if (entry.isFile() && /^S[0-9]{2,}\.jpg$/u.test(entry.name) && !wanted.has(entry.name)) await fsp.rm(guardedFile(stillDir,entry.name));
    }
    return [file, ...files];
  } finally { await fsp.rm(assertProjectOutput(stage), {recursive:true,force:true}); }
}
async function faceModelState(hashFile) {
  const {FACE_MODELS} = await import('./lib/reframe-runtime.mjs');
  return Promise.all(FACE_MODELS.map(async m => ({id: m.id, sha256: await hashFile(path.join(ROOT, m.path))})));
}

export async function analysisIdentity(prepared, speech, pins, {hashFile = sha256File,observe} = {}) {
  const sources = ['scripts/breakdown.mjs','scripts/lib/breakdown-merge.mjs','scripts/lib/breakdown-python.mjs','scripts/lib/transcription-run.mjs','scripts/lib/breakdown-presenter.mjs','scripts/lib/reframe-pipeline.mjs','scripts/lib/reframe-runtime.mjs','scripts/lib/reframe-core.mjs','scripts/lib/face-merge.mjs','scripts/lib/face-model-pins.json'];
  for (const name of (await fsp.readdir(path.join(ROOT,'scripts/python/breakdown'))).filter(n=>n.endsWith('.py')).sort()) sources.push(`scripts/python/breakdown/${name}`);
  sources.push('scripts/lib/breakdown-pcm.mjs');
  const hashes = await Promise.all(sources.map(async f => [f, await hashFile(path.join(ROOT,f))]));
  const transcript = speech === 'on' ? await hashFile(guardedFile(prepared.workDir,'transcript/captions.json')) : null;
  const asr = speech === 'on' ? await hashFile(WHISPER_RUNTIME_FILE) : null;
  const inputs={source:prepared.source.sha256,prepare:prepared.cache,speech,pins,hashes,transcript,asr,faces:await faceModelState(hashFile)};
  observe?.(inputs);
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}
export async function runBreakdown({reference, project, speech = 'on', force = false, cold = false, presence = measurePresenter,signal,cores}) {
  signal?.throwIfAborted();
  const timer = createRunTiming();
  if (typeof cold !== 'boolean') throw new Error('cold must be boolean.');
  force ||= cold;
  if (!['on','off'].includes(speech)) throw new Error('--speech accepts on or off.');
  const readiness = await timer.stage('readiness', () => inspectBreakdownRuntime());
  if (!readiness.ready) throw new Error(`The breakdown add-on is not ready: ${readiness.issues.join('; ')}`);
  const writeReport = await reportWriter();
  let prepareCacheHit = null;
  const prepared = await timer.stage('prepare', () => prepareReference({reference, project, force, onCacheHit: hit => { prepareCacheHit = hit; }}), () => ({cacheHit: prepareCacheHit}));
  if (prepared.probe.durationSec > 180) console.error('Reference exceeds three minutes; local analysis may take longer.');
  return withReferenceLock(prepared, async () => {
    const workDir = prepared.workDir, pins = loadPins(), models = modelPaths(pins);
    const output = guardedFile(prepared.outDir,'breakdown.json'), manifestFile = guardedFile(workDir,'analysis-manifest.json');
    const expectedSha256 = await sha256File(output);
    let previous;
    try { previous = JSON.parse(await fsp.readFile(manifestFile,'utf8')); } catch(e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    let originalInputs;
    const identity = await timer.stage('identity', () => analysisIdentity(prepared,speech,pins,{observe:value=>{originalInputs=value;}}));
    let breakdown, cacheHit = false, executionIdentity = identity,executionBudget=resourceBudget(cores,false);
    if (!force && expectedSha256) {
      if (previous?.identity !== identity || previous?.sha256 !== expectedSha256) throw new Error('Existing breakdown or analysis settings changed. Preserve reviewed/manual work; use --force only to intentionally replace it.');
      breakdown = await timer.stage('analysis-cache', () => fsp.readFile(output, 'utf8').then(JSON.parse), () => ({cacheHit: true})); cacheHit = true;
    } else {
      const controller=new AbortController();
      const forwardAbort=()=>controller.abort(signal.reason);
      signal?.addEventListener('abort',forwardAbort,{once:true});
      if(signal?.aborted)forwardAbort();
      let session;
      try {
      const potentialAsr=speech==='on' && prepared.probe.hasAudio;
      const initialBudget=resourceBudget(cores,potentialAsr);
      session=await analyserSession(workDir,{signal:controller.signal,budget:initialBudget});
      const options = {workDir,force,onTiming: timer.record,exec:session.exec};
      const yamnet = models.yamnet ? {model:models.yamnet,classMap:models.yamnetClassMap} : null;
      let finishVoice;
      const voiceReady=new Promise(resolve=>{finishVoice=resolve;});
      const getVoice=async()=>{const r=await voiceReady;if(r.failed)throw r.error;return r.value;};
      const planned=planSpeech(async onRun=>{
        if(potentialAsr && initialBudget.pool===1)await getVoice();
        return timer.stage('asr',()=>collectSpeech(prepared,{speech,force:cold,voiceEvidence:getVoice,threads:initialBudget.asr,signal:controller.signal,onRun}),
          s=>({cacheHit:s.cacheHit??null,skipped:s.skipped===true||!prepared.probe.hasAudio||speech==='off',...(s.reason?{reason:s.reason}:{})}));
      });
      const [picture,spoken]=await overlap([
        async()=>{
          try {
          const voice=prepared.wav?(await runAnalyser('speech',{wav:prepared.wav.path,yamnet},options)).speechActivity:null;
          finishVoice({value:voice});
          const running=await planned.running;
          executionBudget=resourceBudget(cores,running);
          if(running && executionBudget.pool===1){await planned.wait();executionBudget=resourceBudget(cores,false);}
          await session.configure(executionBudget);
          const shots=await runAnalyser('shots',{proxy:prepared.proxy.path},options);
          const presenter=await timer.stage('presenter',()=>presence({proxy:prepared.proxy.path,shots:shots.shots,durationSec:analysisDuration(prepared),force:cold,threads:session.budget.vision,signal:controller.signal}),p=>({cacheHit:p.cacheHit??null}));
          const camera=await runAnalyser('camera',{proxy:prepared.proxy.path,shots:shots.shots},options);
          const overlays=await runAnalyser('overlays',{proxy:prepared.proxy.path,shots:shots.shots,panels:shots.panels??[]},options);
          const look=await runAnalyser('look',{proxy:prepared.proxy.path},options);
          const text=await runAnalyser('text',{proxy:prepared.proxy.path,models:{det:models.det,rec:models.rec,keys:models.keys},visualOrder:pins.ocr.visualOrder,regions:shots.panels??[]},options);
          return {voice,shots,presenter,camera,overlays,look,text};
          }catch(error){finishVoice({error,failed:true});throw error;}
        },
        ()=>planned.wait()
      ],initialBudget.pool,error=>controller.abort(error));
      controller.signal.throwIfAborted();
      const captions=spoken.captions,{voice,shots,presenter,camera,overlays,look,text}=picture;
      executionIdentity = await timer.stage('identity-after-asr', () => analysisIdentity(prepared,speech,pins,{observe:value=>assertExecutionUnchanged(originalInputs,value)}));
      const sound = prepared.wav ? await runAnalyser('sound',{wav:prepared.wav.path,speechActivity:voice,speech:captions ? speechStats(captions,prepared.probe.durationSec).spans : [],cuts:shots.cuts.map(c=>c.t),
        anchors:[...shots.cuts.map(x=>x.t),...shots.transitions.map(x=>x.start),...text.text.map(x=>x.start),...text.text.flatMap(x=>(x.events ?? []).map(e=>e.t)),...overlays.overlays.map(x=>x.start)],yamnet:models.yamnet ? {model:models.yamnet,classMap:models.yamnetClassMap} : null},options) : null;
      const loudness = prepared.probe.hasAudio ? await timer.stage('loudness', () => loudnessOf(prepared.source.path)) : null;
      breakdown = mergeBreakdown({prepare:prepared,captions,shots,camera,overlays,look,text,sound,presenter:presenter.presenter,loudness});
      if (spoken.skipped && spoken.reason) breakdown.sound.speech = {...breakdown.sound.speech, present: false, reason: spoken.reason};
      if (spoken.limitation) breakdown.limitations.push(spoken.limitation);
      if (presenter.limitation) breakdown.limitations.push(presenter.limitation);
      } catch(error){controller.abort(error);throw error;}
      finally {await session?.close();signal?.removeEventListener('abort',forwardAbort);}

    }
    signal?.throwIfAborted();
    await timer.stage('verify-inputs', async () => {
      if(await sha256File(prepared.proxy.path)!==prepared.cache.proxySha256 || (prepared.wav && await sha256File(prepared.wav.path)!==prepared.cache.wavSha256))throw new Error('Prepared media changed during analysis.');
      if (await analysisIdentity(prepared,speech,pins) !== executionIdentity || await sha256File(prepared.source.path) !== prepared.source.sha256) throw new Error('Source or analyser implementation changed during analysis.');
    });
    const files = await timer.stage('publish', () => writeOutputs(breakdown,prepared,writeReport,expectedSha256));
    await timer.stage('manifest', async () => atomicJson(manifestFile,{schema:1,identity:executionIdentity,sha256:await sha256File(output)}));
    const timing = {...timer.snapshot(), coldRequested: cold,resources:executionBudget};
    await atomicJson(guardedFile(workDir, 'run-timing.json'), timing);
    return {referenceId:prepared.referenceId,outDir:prepared.outDir,files,cacheHit,timing,needsConfirmation:breakdown.reviewQueue.length,limitations:breakdown.limitations};
  });
}
export async function readBreakdown(project, ref) {
  const outDir = outDirFor(project,ref), workDir = guardedFile(outDir,'work');
  const bytes = await fsp.readFile(guardedFile(outDir,'breakdown.json'),'utf8');
  const breakdown = JSON.parse(bytes), breakdownSha256 = createHash('sha256').update(bytes).digest('hex');
  const prepared = JSON.parse(await fsp.readFile(guardedFile(workDir,'prepare.json'),'utf8'));
  if (breakdown.schema !== 1 || prepared.schema !== 1 || breakdown.referenceId !== ref || prepared.referenceId !== ref || referenceIdFor(prepared.source.sha256) !== ref || breakdown.source.sha256 !== prepared.source.sha256
    || prepared.outDir !== outDir || prepared.workDir !== workDir || prepared.proxy?.path !== guardedFile(workDir,'proxy.mp4') || (prepared.wav && prepared.wav.path !== guardedFile(workDir,'audio-16k.wav'))) throw new Error('Stored reference paths or identity are invalid.');
  if (!prepared.cache?.proxySha256 || await sha256File(prepared.proxy.path) !== prepared.cache.proxySha256 || (prepared.wav && await sha256File(prepared.wav.path) !== prepared.cache.wavSha256)) throw new Error('Prepared media is missing or changed; prepare again.');
  return {outDir,breakdown,prepared,breakdownSha256};
}
const LISTEN_MIME = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'};
export function assertListenable({source, root = ROOT, sha256, ownHashes, durationSec, hasAudio, listener, config}) {
  const rel = path.relative(path.resolve(root).toLowerCase(), path.resolve(source).toLowerCase()).split(path.sep);
  if (rel[0] === 'raw') throw new Error("The listener never sends files from Raw/: they are the creator's recordings.");
  if (ownHashes.has(String(sha256).toLowerCase())) throw new Error('This file is a project recording; the listener sends only a named reference.');
  const mimeType = LISTEN_MIME[path.extname(source).toLowerCase()];
  if (!mimeType) throw new Error('The listener accepts mp4, mov or webm references.');
  if (!hasAudio) throw new Error('The reference has no audio; there is nothing for the listener to hear.');
  if (!(durationSec > 0) || durationSec > config.maxDurationSec) throw new Error(`The listener accepts references up to ${config.maxDurationSec} seconds.`);
  if (listener?.status === 'merged') throw new Error('A listener result is already merged. Rebuild the local breakdown with run --force before listening again.');
  return mimeType;
}
export async function projectRecordingHashes({root = ROOT} = {}) {
  const hashes = new Set();
  const readRegistry = async (projectDir, parts) => {
    try {
      let current = projectDir;
      for (const part of parts) {
        current = path.join(current, part);
        const stat = await fsp.lstat(current);
        if (stat.isSymbolicLink() || (part === parts.at(-1) ? !stat.isFile() : !stat.isDirectory())) throw new Error('Invalid recording registry path.');
      }
      const record = JSON.parse(await fsp.readFile(current, 'utf8'));
      if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid recording registry record.');
      return record;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      // A partial save is still an unverified recording: never skip it or use
      // an earlier hash. The caller can retry after the save completes.
      throw new Error(`Cannot verify project recording registry (${path.join(projectDir, ...parts)}). Wait for project saves to finish or repair the record, then retry: ${e.message}`);
    }
  };
  const addHash = value => {
    if (!/^[a-f0-9]{64}$/iu.test(value ?? '')) throw new Error('Project recording identity is missing.');
    hashes.add(value.toLowerCase());
  };
  // A missing/unreadable Projects directory is not proof that no recordings exist.
  for (const entry of await fsp.readdir(path.join(root, 'Projects'), {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw new Error('Cannot verify project recording registry through a filesystem link.');
    if (!entry.isDirectory()) continue;
    const projectDir = path.join(root, 'Projects', entry.name);
    const edit = await readRegistry(projectDir, ['edit.json']);
    if (edit !== null) addHash(edit.source?.sha256);
    // Podcast projects use normal single-source edits, but the episode's original
    // identity also lives in the batch and each child clip's ownership receipt.
    const batch = await readRegistry(projectDir, ['podcast', 'batch.json']);
    if (batch !== null) addHash(batch.source?.sha256);
    const owner = await readRegistry(projectDir, ['podcast', 'owner.json']);
    if (owner !== null) addHash(owner.sourceSha256);
  }
  return hashes;
}
async function refreshManifest(prepared, file) {
  const manifestFile = guardedFile(prepared.workDir, 'analysis-manifest.json');
  let manifest; try { manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (manifest) await atomicJson(manifestFile, {...manifest, sha256: await sha256File(file)});
}
export async function listenBreakdown({project, ref, consent = false, env = process.env, keyFile = KEY_FILE, transport = listenToReference, now = () => new Date(), config = loadListenerConfig(), write, recordingHashes = projectRecordingHashes}) {
  const {outDir, breakdown, prepared, breakdownSha256} = await readBreakdown(project, ref);
  if (typeof consent !== 'boolean') throw new Error('Consent must be an explicit boolean.');
  const source = prepared.source.path;
  const guardSource = async () => {
    const realSource = await fsp.realpath(source), realRoot = await fsp.realpath(ROOT);
    const args = {sha256: prepared.source.sha256, ownHashes: await recordingHashes(), durationSec: breakdown.durationSec,
      hasAudio: breakdown.sound?.hasAudio === true, listener: breakdown.listener, config};
    assertListenable({...args, source});
    const mime = assertListenable({...args, source: realSource, root: realRoot});
    let realRaw; try { realRaw = await fsp.realpath(path.join(ROOT, 'Raw')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (realRaw) {
      const relative = path.relative(realRaw.toLowerCase(), realSource.toLowerCase());
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('The listener never sends files from Raw/.');
    }
    if (await sha256File(source) !== prepared.source.sha256) throw new Error('The reference changed since the breakdown; run it again first.');
    return mime;
  };
  const mimeType = await guardSource();
  const {key} = resolveGeminiKey({env, file: keyFile});
  const plan = {wouldSend: {name: prepared.source.name, bytes: (await fsp.stat(source)).size, durationSec: breakdown.durationSec}, provider: 'gemini', model: config.model,
    estimateUsd: estimateListenerCost(breakdown.durationSec, config, now()), dataUse: config.dataUse, keyPresent: Boolean(key)};
  if (plan.wouldSend.bytes > config.maxBytes) throw new Error('The reference is larger than the listener accepts.');
  if (!consent) return {...plan, sent: false, consentRequired: true};
  if (!key) throw new Error('No Gemini key. The creator saves it in their own terminal with: node scripts/breakdown.mjs listener-key (or sets GEMINI_API_KEY).');
  const save = write ?? (async next => writeOutputs(next, prepared, await reportWriter(), breakdownSha256));
  return withReferenceLock(prepared, async () => {
    const file = guardedFile(outDir, 'breakdown.json');
    if (await sha256File(file) !== breakdownSha256) throw new Error('Breakdown changed before the lock; refusing a stale save.');
    await guardSource();
    const at = now().toISOString();
    // Prepare recovery storage before spending a request. Keep each paid answer,
    // including the validated claims, even if a later identity/merge/save check fails.
    const answerDir = guardedFile(prepared.workDir, 'listener');
    await fsp.mkdir(answerDir, {recursive: true});
    let next, outcome, answerFile;
    const preserveError = e => {
      const error = new Error(redactListenerText(e?.message ?? String(e), key)
        + (answerFile ? ' Listener answer saved at ' + answerFile + '; no new request is needed to inspect it.' : ''));
      if (answerFile) error.answerFile = answerFile;
      return error;
    };
    try {
      const got = redactListenerData(await transport({file: source, mimeType, breakdown, key, config}), key);
      const recovery = guardedFile(answerDir, 'response-' + randomUUID() + '.json');
      await atomicJson(recovery, {schema: 1, at, model: got.model, usage: got.usage, raw: got.raw, heard: got.heard,
        referenceSha256: prepared.source.sha256, breakdownSha256, estimateUsd: plan.estimateUsd, remoteDeleted: got.remoteDeleted});
      answerFile = recovery;
      await atomicJson(guardedFile(answerDir, 'response.json'), {schema: 1, at, model: got.model, usage: got.usage, raw: got.raw,
        heard: got.heard, referenceSha256: prepared.source.sha256, breakdownSha256, remoteDeleted: got.remoteDeleted});
      if (await sha256File(source) !== prepared.source.sha256 || await sha256File(file) !== breakdownSha256) throw new Error('Reference or breakdown changed during listening; refusing a stale save.');
      next = mergeHeard(breakdown, got.heard, {provider: 'gemini', model: got.model, at, referenceSha256: prepared.source.sha256, usage: got.usage, estimateUsd: plan.estimateUsd, remoteDeleted: got.remoteDeleted});
      outcome = {sent: true, merged: true, model: got.model, usage: got.usage, remoteDeleted: got.remoteDeleted};
    } catch (e) {
      if (!(e instanceof ListenerError)) throw preserveError(e);
      next = recordListenerFailure(breakdown, {provider: 'gemini', model: config.model, at, code: e.code, message: redactListenerText(e.message, key), remoteDeleted: e.remoteDeleted});
      outcome = {sent: true, merged: false, code: e.code, reason: redactListenerText(e.message, key), remoteDeleted: e.remoteDeleted ?? null};
    }
    let files;
    try {
      if (await sha256File(file) !== breakdownSha256 || await sha256File(source) !== prepared.source.sha256) throw new Error('Reference or breakdown changed before publication; refusing a stale save.');
      files = await save(next);
      await refreshManifest(prepared, file);
    } catch (e) { throw preserveError(e); }
    return {...plan, ...outcome, files, needsConfirmation: next.reviewQueue.length};
  });
}
export function promptHidden(question, {input = process.stdin, output = process.stderr} = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') return Promise.reject(new Error('Run this command yourself in a terminal; the key must never pass through the assistant or a pipe.'));
  if (input.readableEnded || input.destroyed) return Promise.reject(new Error('Key input closed before Enter.'));
  return new Promise((resolve, reject) => {
    let value = '', buffer = '', pasting = false, finished = false;
    const wasRaw = input.isRaw === true, pasteStart = '\x1b[200~', pasteEnd = '\x1b[201~';
    const done = error => {
      if (finished) return;
      finished = true;
      input.removeListener('data', onData); input.removeListener('end', onEnd); input.removeListener('close', onEnd); input.removeListener('error', onError);
      input.setRawMode(wasRaw); input.pause(); output.write('\x1b[?2004l\n');
      error ? reject(error) : resolve(value);
      value = ''; buffer = '';
    };
    const onEnd = () => done(new Error('Key input closed before Enter.'));
    const onError = () => done(new Error('Key input failed.'));
    const onData = chunk => {
      buffer += String(chunk);
      while (buffer && !finished) {
        if (buffer[0] === '\x1b') {
          if (buffer.startsWith(pasteStart)) { buffer = buffer.slice(pasteStart.length); pasting = true; continue; }
          if (buffer.startsWith(pasteEnd)) { buffer = buffer.slice(pasteEnd.length); pasting = false; continue; }
          if (pasteStart.startsWith(buffer) || pasteEnd.startsWith(buffer)) break;
          const escape = /^\x1b\[[0-?]*[ -/]*[@-~]/u.exec(buffer);
          if (escape) { buffer = buffer.slice(escape[0].length); continue; }
          buffer = buffer.slice(1); continue;
        }
        const ch = buffer[0]; buffer = buffer.slice(1);
        if (ch === '\u0003' || ch === '\u0004') return done(new Error('Cancelled.'));
        if (ch === '\r' || ch === '\n') {
          if (pasting) return done(new Error('Paste a single-line key.'));
          return done();
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); else if (ch >= ' ') value += ch;
      }
    };
    output.write(question + '\x1b[?2004h');
    input.setEncoding('utf8'); input.on('data', onData); input.on('end', onEnd); input.on('close', onEnd); input.on('error', onError);
    input.setRawMode(true); input.resume();
  });
}

export async function buildProjectDna({project, refs}) {
  const ids = [...new Set(refs)].sort();
  if (!ids.length) throw new Error(USAGE);
  const loaded = [];
  for (const ref of ids) loaded.push(await readBreakdown(project, ref));
  const releases = [];
  try {
    for (const item of loaded) releases.push(await acquireFileLease(guardedFile(item.prepared.workDir, 'breakdown.lock'), {label: 'Reference analysis'}));
    for (const item of loaded) if (await sha256File(guardedFile(item.outDir, 'breakdown.json')) !== item.breakdownSha256) throw new Error('Breakdown changed before the lock; refusing a stale save.');
    const parts = loaded.map(({breakdown}) => ({breakdown, recipe: buildRecipe(breakdown)}));
    const dna = buildDna(parts);
    const files = {'STYLE_DNA.json': `${JSON.stringify(dna, null, 2)}\n`, 'STYLE_DNA.md': renderDnaMarkdown(dna)};
    for (const {breakdown} of parts) files[`style-analysis/${breakdown.referenceId}.md`] = renderEvidenceMarkdown(breakdown, dna.evidence.filter(row => row.referenceId === breakdown.referenceId));
    const result = await writeDnaFiles(path.dirname(path.dirname(loaded[0].outDir)), files);
    return {...result, status: dna.status, invariants: dna.observedInvariants.length, adaptive: dna.adaptiveVariables.length, uncertain: dna.uncertainTraits.length,
      needsConfirmation: parts.reduce((n, p) => n + (p.breakdown.reviewQueue ?? []).length, 0)};
  } finally { for (const release of releases.reverse()) await release(); }
}

export async function main(argv) {
  const [command,...rest] = argv, args = parseArgs(rest);
  if (!command || command === 'help' || command === '--help' || args.help) return console.log(USAGE);
  const allowed = {dna:['project','ref'],inspect:[],install:['python','artifact-dir','allow-download'],run:['project','speech','force','cold'],review:['project','ref','limit'],listen:['project','ref','consent'],'listener-key':[],'apply-review':['project','ref','answers','heard-by'],report:['project','ref']}[command];
  if (!allowed) throw new Error(USAGE);
  for (const key of Object.keys(args)) if (key !== '_' && !allowed.includes(key)) throw new Error(`Unknown option --${key}`);
  if (command === 'inspect') {
    const config = loadListenerConfig();
    let keyPresent = false, keyIssue = null;
    try { keyPresent = Boolean(resolveGeminiKey().key); } catch (e) { keyIssue = e.message; }
    return console.log(JSON.stringify({...await inspectBreakdownRuntime(), listener: {provider: config.provider, model: config.model, keyPresent, keyIssue}}, null, 2));
  }

  if (command === 'install' && args['allow-download']!==undefined && args['allow-download']!==true)throw new Error('--allow-download is an explicit flag requiring a new user yes.');
  if (command === 'install') return console.log(JSON.stringify(await installBreakdownRuntime({python:args.python,artifactDirectory:args['artifact-dir'],allowDownload:args['allow-download']===true,log:line=>console.error(line)}),null,2));
  if (command === 'run') {
    if (args._.length !== 1 || !args.project || (args.force !== undefined && args.force !== true) || (args.cold !== undefined && args.cold !== true)) throw new Error(USAGE);
    const controller=new AbortController(),cancel=()=>controller.abort(new Error('Breakdown cancelled'));
    process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    try{return console.log(JSON.stringify(await runBreakdown({reference:args._[0],project:args.project,speech:args.speech ?? 'on',force:args.force === true,cold:args.cold === true,signal:controller.signal}),null,2));}
    finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
  }
  if (command === 'dna') {
    if (!args.project || typeof args.ref !== 'string' || args._.length) throw new Error(USAGE);
    return console.log(JSON.stringify(await buildProjectDna({project: args.project, refs: args.ref.split(',').map(s => s.trim()).filter(Boolean)}), null, 2));
  }
  if (command === 'listen') {
    if (!args.project || !args.ref || args._.length || (args.consent !== undefined && args.consent !== 'yes')) throw new Error(USAGE);
    const result = await listenBreakdown({project: args.project, ref: args.ref, consent: args.consent === 'yes'});
    console.log(JSON.stringify(result, null, 2));
    if (result.sent && !result.merged) process.exitCode = 1;
    return;
  }
  if (command === 'listener-key') {
    if (args._.length) throw new Error(USAGE);
    const file = await saveGeminiKey(await promptHidden('Paste your Gemini API key (hidden), then Enter: '));
    return console.log(JSON.stringify({saved: true, file: path.relative(ROOT, file)}, null, 2));
  }

  if (!args.project || !args.ref || args._.length) throw new Error(USAGE);
  const {outDir,breakdown,prepared,breakdownSha256} = await readBreakdown(args.project,args.ref);
  await withReferenceLock(prepared,async()=>{
    if (await sha256File(guardedFile(outDir,'breakdown.json')) !== breakdownSha256) throw new Error('Breakdown changed before the lock; refusing a stale save.');
    if (command === 'review') {
      const result = await buildReviewTasks({breakdown,prepared,dir:outDir,limit:Number(args.limit ?? 25)});
      return console.log(JSON.stringify({tasks:result.tasks.length,file:guardedFile(outDir,'review_tasks.json'),answers:guardedFile(outDir,'review-answers.template.json'),ears:guardedFile(outDir,'review-ears.template.json')},null,2));
    }
    let next = breakdown;
    if (command === 'apply-review') {
      if (typeof args.answers !== 'string') throw new Error(USAGE);
      const tasks = JSON.parse(await fsp.readFile(guardedFile(outDir,'review_tasks.json'),'utf8'));
      if (tasks.breakdownSha256 !== reviewIdentity(breakdown)) throw new Error('Review tasks are stale; rebuild them before applying answers.');
      const answers = JSON.parse(await fsp.readFile(path.resolve(args.answers),'utf8'));
      if (!Array.isArray(answers) || answers.some(a=>!tasks.tasks.some(t=>t.id === a.id))) throw new Error('Answers must refer to the current review tasks.');
      if (args['heard-by'] !== undefined && args['heard-by'] !== 'creator') throw new Error('--heard-by accepts only creator: the creator listened and answered.');
      next = args['heard-by'] === 'creator' ? applyEarReview(breakdown,answers) : applyReview(breakdown,answers);
    }
    const file = guardedFile(outDir,'breakdown.json');
    const files = await writeOutputs(next,prepared,await reportWriter(),breakdownSha256);
    if (command === 'apply-review') await refreshManifest(prepared, file);
    console.log(JSON.stringify({files,needsConfirmation:next.reviewQueue.length},null,2));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
