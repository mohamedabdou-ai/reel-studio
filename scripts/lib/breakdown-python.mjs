import './project-tmp.mjs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {ROOT} from './media.mjs';
import {runLogged} from './python-venv.mjs';
import {breakdownPaths, breakdownEnvironment} from './breakdown-runtime.mjs';
import {atomicJson, guardedFile} from './breakdown-prepare.mjs';
import {assertProjectOutput} from './project-paths.mjs';
import {sha256File} from './studio-download.mjs';
import {performance} from 'node:perf_hooks';

const COMMANDS = new Set(['shots', 'camera', 'overlays', 'look', 'text', 'sound', 'speech']);
const REQUIRED = {shots: ['shots', 'cuts', 'transitions'], camera: ['camera'], overlays: ['overlays'], look: ['look'], text: ['text'], sound: ['sound'], speech:['speechActivity']};
async function implementationIdentity(packageRoot) {
  const dir = path.join(packageRoot, 'breakdown');
  const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.py')).sort();
  return Promise.all(files.map(async file => [file, await sha256File(path.join(dir, file))]));
}
async function inputIdentity(request) {
  const files = [request.proxy, request.wav, ...Object.values(request.models ?? {}), request.yamnet?.model, request.yamnet?.classMap].filter(Boolean);
  return Promise.all(files.map(async file => {
    const hash = await sha256File(file);
    if (!hash) throw new Error(`Named analyser input is missing: ${file}`);
    return [file, hash];
  }));
}
function validResult(name, result) {
  if (!result || result.analyser?.name !== name || result.analyser?.version !== '1.0.0' || REQUIRED[name].some(key => !Object.hasOwn(result, key))) throw new Error(`Invalid or stale ${name} analyser result.`);
  for (const key of REQUIRED[name]) if (!['look','sound','speechActivity'].includes(key) && !Array.isArray(result[key])) throw new Error(`Invalid ${name} analyser list.`);
  if (name === 'speech' && (result.speechActivity?.schema !== 1 || typeof result.speechActivity.hasVoicing !== 'boolean' || !Array.isArray(result.speechActivity.independentSpans))) throw new Error('Invalid independent speech evidence.');
  if (name === 'speech') {
    const a = result.speechActivity;
    if (!Number.isFinite(a.durationSec) || a.durationSec < 0 || a.hasVoicing !== (a.independentSpans.length > 0)
      || a.independentSpans.some(s => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.end > a.durationSec + .001
        || !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1)) throw new Error('Invalid independent speech timeline.');
  }
  return result;
}
export async function runAnalyser(name, request, {workDir, exec = runLogged, paths = breakdownPaths(), force = false, onTiming = () => {}} = {}) {
  const started = performance.now();
  const finish = (value, cacheHit) => { onTiming({stage: name, wallSec: (performance.now() - started) / 1000, cacheHit, state: cacheHit ? 'warm' : 'cold'}); return value; };
  if (!COMMANDS.has(name)) throw new Error(`Unknown breakdown analyser: ${name}`);
  paths = {...breakdownPaths(), ...paths};
  // Parallel CV/ONNX kernels can change last-bit reductions. Pure DSP is fixed
  // single-threaded; scheduling/core counts do not belong in its cache key.
  const execution=(name==='speech'||name==='sound')&&!request.yamnet?undefined:exec.cacheIdentity;
  const identity = {name, version: '1.0.0', implementation: await implementationIdentity(paths.packageRoot), request, files: await inputIdentity(request),execution};
  const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const output = guardedFile(workDir, `${name}.json`), manifestFile = guardedFile(workDir, `${name}-cache.json`);
  if (!force) {
    try {
      const cache = JSON.parse(await fsp.readFile(manifestFile, 'utf8'));
      if (cache.key === key && cache.sha256 === await sha256File(output)) return finish(validResult(name, JSON.parse(await fsp.readFile(output, 'utf8'))), true);
    } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError) && !e.message.startsWith('Invalid or stale')) throw e; }
  }
  const attempt = guardedFile(workDir, `${name}-${randomUUID()}`);
  await fsp.mkdir(attempt, {recursive: true});
  try {
    const input = guardedFile(attempt, 'request.json'), staged = guardedFile(attempt, 'result.json');
    await atomicJson(input, request);
    await exec(paths.python, ['-m', 'breakdown', name, '--input', input, '--output', staged],
      {logFile: guardedFile(workDir, path.join('logs', `${name}.log`)), cwd: ROOT, env: breakdownEnvironment(process.env, paths), label: `Breakdown ${name}`, timeout:20 * 60_000});
    const result = validResult(name, JSON.parse(await fsp.readFile(staged, 'utf8')));
    // Inputs must still identify the bytes actually analysed.
    if (JSON.stringify(await inputIdentity(request)) !== JSON.stringify(identity.files)) throw new Error('Analyser inputs changed during analysis.');
    await atomicJson(output, result);
    await atomicJson(manifestFile, {schema: 1, key, sha256: await sha256File(output)});
    return finish(result, false);
  } finally { await fsp.rm(assertProjectOutput(attempt), {recursive: true, force: true}); }
}
