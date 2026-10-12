import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {ROOT, assertProjectOutput} from './project-paths.mjs';
import {buildAlignmentDraft, buildAlignmentRequest} from './alignment-contract.mjs';
import {alignmentCacheKey, assertAlignmentWritePlan, readAlignmentCache, writeAlignmentCache, writeAlignmentOutputs} from './alignment-cache.mjs';
import {alignmentEnvironment, inspectAlignmentRuntime, runtimePaths} from './alignment-install.mjs';
import {runAlignmentCommand} from './alignment-runtime.mjs';

const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function resolveProjectInput(value, label) {
  const absolute = path.resolve(ROOT, value);
  if (!contained(ROOT, absolute) || absolute === ROOT) throw new Error(`${label} must be inside the project.`);
  const realRoot = fs.realpathSync(ROOT);
  const real = fs.realpathSync(absolute);
  if (!contained(realRoot, real) || !fs.statSync(real).isFile()) throw new Error(`${label} must resolve to a project file.`);
  return real;
}

export async function prepareAlignmentJob(editPath, range, provenance) {
  const manifestFile = resolveProjectInput(editPath, 'Edit manifest');
  let manifest;
  try { manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8')); }
  catch (error) { throw new Error(`Edit manifest is not valid JSON: ${error.message}`); }
  const request = buildAlignmentRequest(manifest, range);
  const sourceFile = resolveProjectInput(request.source.path, 'Alignment source');
  const sourceSha256 = await sha256File(sourceFile);
  if (sourceSha256 !== request.source.sha256.toLowerCase()) throw new Error(`Alignment source hash differs from the edit manifest: ${sourceFile}`);
  return {
    manifestFile,
    manifestSha256:await sha256File(manifestFile),
    sourceFile,
    request,
    identity: {
      sourceSha256,
      transcriptSha256: request.transcriptSha256,
      model: provenance.model,
      runtime: provenance.runtime,
      range: {startMs: request.range.startMs, durationMs: request.range.durationMs},
    },
  };
}

export function ffmpegAudioArguments({source, output, startMs, durationMs}) {
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', (startMs / 1000).toFixed(3), '-i', source,
    '-t', (durationMs / 1000).toFixed(3), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', output,
  ];
}

async function defaultExtractAudio({source, output, startMs, durationMs, logFile}) {
  const bundled = path.join(ROOT, 'Tools', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const executable=fs.existsSync(bundled)?bundled:'ffmpeg';
  await runAlignmentCommand(executable, ffmpegAudioArguments({source, output, startMs, durationMs}), {logFile, cwd: ROOT});
}

async function defaultInvokeAlignment({requestFile, audioFile, outputFile, logFile,language='ar'}) {
  const paths = runtimePaths(language);
  await runAlignmentCommand(paths.python, [paths.runner, '--input', requestFile, '--audio', audioFile, '--model', paths.model, '--output', outputFile,'--language',language], {
    logFile,
    cwd: ROOT,
    env: {...alignmentEnvironment(), HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PROJECT_ROOT: ROOT},
  });
  return JSON.parse(await fsp.readFile(outputFile, 'utf8'));
}

export async function runAlignmentWorkflow(options, dependencies = {}) {
  const inspectRuntime = dependencies.inspectRuntime ?? inspectAlignmentRuntime;
  const extractAudio = dependencies.extractAudio ?? defaultExtractAudio;
  const invokeAlignment = dependencies.invokeAlignment ?? defaultInvokeAlignment;
  const language=options.language??'ar';
  const inspection = await inspectRuntime({language});
  if (!inspection.ready) throw new Error(`Alignment runtime is not ready: ${(inspection.issues ?? []).join('; ')}`);
  const recordedModel = inspection.modelInspection?.manifest?.model;
  const model = recordedModel ? {...recordedModel, filesSha256: inspection.modelInspection.filesSha256} : null;
  if (!model?.repository || !model?.revision) throw new Error('Alignment model provenance is missing.');
  const job = await prepareAlignmentJob(options.edit, {startMs: options.startMs, durationMs: options.durationMs}, {runtime: inspection.runtime, model});
  assertAlignmentWritePlan(options.out, {manifestFile: job.manifestFile, sourceFile: job.sourceFile});
  const confidenceThreshold = options.confidenceThreshold ?? 0.6;
  job.identity.parameters = {language, interpolation: 'ignore', confidenceThreshold};
  const cacheKey = alignmentCacheKey(job.identity);
  const cacheDirectory = assertProjectOutput(path.join(ROOT, 'state', 'cache', 'alignment', cacheKey));
  let outputs = await readAlignmentCache(cacheDirectory, job.identity);
  const cacheHit = Boolean(outputs);
  if (!outputs) {
    const paths = runtimePaths();
    const attempt = assertProjectOutput(path.join(paths.temp, `attempt-${randomUUID()}`));
    await fsp.mkdir(attempt, {recursive: true});
    const audioFile = path.join(attempt, 'audio-16k.wav');
    const requestFile = path.join(attempt, 'request.json');
    const rawFile = path.join(attempt, 'whisperx-raw.json');
    await fsp.writeFile(requestFile, `${JSON.stringify({schema: 1, segments: job.request.segments}, null, 2)}\n`, 'utf8');
    const startedAt = Date.now();
    await extractAudio({
      source: job.sourceFile,
      output: audioFile,
      startMs: job.request.range.startMs,
      durationMs: job.request.range.durationMs,
      logFile: path.join(paths.logs, `${cacheKey}-ffmpeg.log`),
    });
    const raw = await invokeAlignment({requestFile, audioFile, outputFile: rawFile, logFile: path.join(paths.logs, `${cacheKey}-whisperx.log`),language});
    if(await sha256File(job.sourceFile)!==job.identity.sourceSha256 || await sha256File(job.manifestFile)!==job.manifestSha256)throw new Error('Alignment input changed during extraction/inference; preserve the draft and rerun against the reviewed source.');
    const draft = buildAlignmentDraft(job.request, raw, {confidenceThreshold,language});
    draft.provenance = {
      editManifest: path.relative(ROOT, job.manifestFile).replaceAll(path.sep, '/'),
      source: {path: job.request.source.path, sha256: job.identity.sourceSha256},
      model,
      runtime: inspection.runtime,
      interpolation: 'ignore',
    };
    const diagnostics = {
      schema: 1,
      status: 'draft',
      identity: job.identity,
      cacheKey,
      coverage: draft.coverage,
      issues: draft.issues,
      performance: {...(raw.backend ?? {}), workflowElapsedMs: Date.now() - startedAt},
      limitations: [
        'Word boundaries are model alignment evidence and are not manually reviewed.',
        'English or mixed-script words require listening review even when a timestamp is present.',
        'Unresolved words retain null timestamps; this workflow never interpolates or guesses them.',
      ],
    };
    outputs = {draft, diagnostics, raw};
    await writeAlignmentCache(cacheDirectory, job.identity, outputs);
    await fsp.rm(attempt, {recursive: true, force: true});
  }
  const invocation = {
    editManifest: path.relative(ROOT, job.manifestFile).replaceAll(path.sep, '/'),
    source: {path: job.request.source.path, sha256: job.identity.sourceSha256},
  };
  if(await sha256File(job.sourceFile)!==job.identity.sourceSha256 || await sha256File(job.manifestFile)!==job.manifestSha256)throw new Error('Alignment input changed during this run; rerun against the reviewed source.');
  const invocationOutputs = structuredClone(outputs);
  invocationOutputs.draft.provenance = {...invocation, model, runtime: inspection.runtime, interpolation: 'ignore'};
  invocationOutputs.diagnostics.invocation = invocation;
  const written = await writeAlignmentOutputs(options.out, job.identity, invocationOutputs);
  return {cacheHit, cacheKey, cacheDirectory, outputDirectory: written.directory, identity: job.identity, outputs: invocationOutputs};
}
