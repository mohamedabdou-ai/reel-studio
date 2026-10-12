import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT, assertProjectOutput} from './project-paths.mjs';
import {alignmentModel, WHISPERX_RELEASE} from './alignment-contract.mjs';
import {runAlignmentCommand} from './alignment-runtime.mjs';

const execFileAsync = promisify(execFile);
const windows = process.platform === 'win32';

export function runtimePaths(language='ar') {
  const root = path.join(ROOT, 'Tools', 'alignment');
  const model=alignmentModel(language);
  const modelSlug = `${model.repository.replace('/', '--')}--${model.revision}`;
  return {
    root,
    venv: path.join(root, 'venv'),
    python: path.join(root, 'venv', windows ? 'Scripts/python.exe' : 'bin/python'),
    cache: path.join(root, 'cache'),
    temp: path.join(root, 'tmp'),
    models: path.join(root, 'models'),
    model: path.join(root, 'models', modelSlug),
    logs: path.join(root, 'logs'),
    runtimeManifest: path.join(root, 'runtime.json'),
    runner: path.join(root, 'align.py'),
    runnerSource:path.join(ROOT,'scripts','python','align.py'),
  };
}

export function alignmentEnvironment(base = process.env) {
  const paths = runtimePaths();
  const dirs = {
    HF_HOME: path.join(paths.cache, 'huggingface'),
    HUGGINGFACE_HUB_CACHE: path.join(paths.cache, 'huggingface', 'hub'),
    TORCH_HOME: path.join(paths.cache, 'torch'),
    XDG_CACHE_HOME: path.join(paths.cache, 'xdg'),
    PIP_CACHE_DIR: path.join(paths.cache, 'pip'),
    NLTK_DATA: path.join(paths.cache, 'nltk'),
    PYTHONPYCACHEPREFIX: path.join(paths.cache, 'pycache'),
    TEMP: paths.temp,
    TMP: paths.temp,
    TMPDIR: paths.temp,
  };
  const publicBase={...base};
  for(const name of ['HF_TOKEN','HUGGING_FACE_HUB_TOKEN','HUGGINGFACE_TOKEN'])delete publicBase[name];
  return {
    ...publicBase,
    ...dirs,
    HF_HUB_DISABLE_TELEMETRY: '1',
    HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONUTF8: '1',
    TOKENIZERS_PARALLELISM: 'false',
    OMP_NUM_THREADS: base.OMP_NUM_THREADS ?? '6',
    MKL_NUM_THREADS: base.MKL_NUM_THREADS ?? '6',
    PATH: [path.join(ROOT, 'Tools', 'bin'), path.dirname(paths.python), base.PATH ?? ''].join(path.delimiter),
  };
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function filesBelow(root, current = root) {
  const result = [];
  for (const entry of await fsp.readdir(current, {withFileTypes: true})) {
    if (entry.name === 'model-manifest.json' || entry.name === '.cache') continue;
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(root, file));
    else if (entry.isFile()) result.push(path.relative(root, file).replaceAll(path.sep, '/'));
    else throw new Error(`Model contains unsupported filesystem link: ${file}`);
  }
  return result.sort();
}

async function atomicJson(file, value) {
  assertProjectOutput(file);
  await fsp.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, file);
}

export async function writeModelManifest(modelDirectory, model = alignmentModel()) {
  const directory = assertProjectOutput(path.resolve(modelDirectory));
  const files = {};
  for (const relative of await filesBelow(directory)) files[relative] = await sha256File(path.join(directory, relative));
  for (const required of ['config.json', 'preprocessor_config.json', 'pytorch_model.bin', 'special_tokens_map.json', 'vocab.json']) {
    if (!(required in files)) throw new Error(`Downloaded alignment model is missing ${required}.`);
  }
  const manifest = {schema: 1, model, files};
  await atomicJson(path.join(directory, 'model-manifest.json'), manifest);
  return manifest;
}

export async function inspectModelFiles(modelDirectory = runtimePaths().model) {
  const directory = assertProjectOutput(path.resolve(modelDirectory));
  const issues = [];
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(directory, 'model-manifest.json'), 'utf8'));
    for (const [relative, expected] of Object.entries(manifest.files ?? {})) {
      if(path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split(/[\\/]/u).some(part=>part==='..'||part==='.'||!part)) {
        issues.push('model manifest contains an unsafe file path');continue;
      }
      const file = path.join(directory, relative);
      try {
        if (await sha256File(assertProjectOutput(file)) !== expected) issues.push(`${relative} hash mismatch`);
      } catch {
        issues.push(`${relative} is missing`);
      }
    }
    for (const required of ['config.json', 'preprocessor_config.json', 'pytorch_model.bin', 'special_tokens_map.json', 'vocab.json']) {
      if (!(required in (manifest.files ?? {}))) issues.push(`${required} is not recorded`);
    }
    const actual = await filesBelow(directory);
    for (const relative of actual) if (!(relative in (manifest.files ?? {}))) issues.push(`${relative} is unrecorded`);
    const filesSha256 = createHash('sha256').update(JSON.stringify(manifest.files ?? {})).digest('hex');
    return {valid: issues.length === 0, issues, manifest, filesSha256};
  } catch (error) {
    return {valid: false, issues: [`model manifest unavailable: ${error.message}`], manifest: null};
  }
}

async function pythonMetadata(python, env) {
  const script = [
    'import json, platform, importlib.metadata as m',
    'import torch, torchaudio, transformers, whisperx, nltk',
    'import whisperx.alignment',
    'nltk.data.find("tokenizers/punkt_tab/english/")',
    'print(json.dumps({"python": platform.python_version(), "whisperx": m.version("whisperx"), "torch": torch.__version__, "torchaudio": torchaudio.__version__, "transformers": transformers.__version__, "packages": {name:m.version(name) for name in ["numpy","pandas","nltk","tokenizers","huggingface-hub","safetensors"]}, "device": "cpu", "cudaAvailable": torch.cuda.is_available()}))',
  ].join('; ');
  const {stdout} = await execFileAsync(python, ['-c', script], {cwd: ROOT, env, windowsHide: true, maxBuffer: 1024 * 1024});
  return JSON.parse(stdout.trim().split(/\r?\n/u).at(-1));
}

export async function inspectAlignmentRuntime({language='ar'}={}) {
  const paths = runtimePaths(language),model=alignmentModel(language);
  const result = {schema: 1, installed: false, ready: false, language, paths, release: WHISPERX_RELEASE, model, issues: []};
  if (!fs.existsSync(paths.python)) result.issues.push('Dedicated Python runtime is not installed.');
  if (!fs.existsSync(paths.runner)) result.issues.push('Alignment runner is missing.');
  if(fs.existsSync(paths.runner) && await sha256File(paths.runner)!==await sha256File(paths.runnerSource)) result.issues.push('Installed runner differs from this studio version; run alignment install again.');
  let runtime = null;
  if (fs.existsSync(paths.python)) {
    try { runtime = await pythonMetadata(paths.python, alignmentEnvironment()); }
    catch (error) { result.issues.push(`Python package inspection failed: ${error.message}`); }
  }
  if (runtime && fs.existsSync(paths.runner)) {
    runtime.implementation = {
      pythonRunnerSha256: await sha256File(paths.runner),
      contractSha256: await sha256File(path.join(ROOT, 'scripts', 'lib', 'alignment-contract.mjs')),
      pipelineSha256: await sha256File(path.join(ROOT, 'scripts', 'lib', 'alignment-pipeline.mjs')),
    };
  }
  if (runtime?.whisperx !== WHISPERX_RELEASE.version) result.issues.push(`Expected WhisperX ${WHISPERX_RELEASE.version}, found ${runtime?.whisperx ?? 'none'}.`);
  if (runtime?.cudaAvailable) result.issues.push('Runtime unexpectedly reports CUDA; this workflow is CPU-only.');
  const modelInspection = await inspectModelFiles(paths.model);
  if(modelInspection.manifest && (modelInspection.manifest.model?.repository!==model.repository || modelInspection.manifest.model?.revision!==model.revision))modelInspection.issues.push('model differs from the pinned language model');
  result.issues.push(...modelInspection.issues);
  result.runtime = runtime;
  result.modelInspection = modelInspection;
  result.installed = Boolean(runtime);
  result.ready = result.issues.length === 0;
  return result;
}

async function bootstrapRuntime(paths, env, python) {
  if (fs.existsSync(paths.python)) return;
  const log = path.join(paths.logs, 'bootstrap.log');
  const candidates = python?[{command:python,args:['-m','venv',paths.venv]}]:windows?[
    {command:'python',args:['-m','venv',paths.venv]}, {command:'py',args:['-3','-m','venv',paths.venv]},
  ]:[{command:'python3',args:['-m','venv',paths.venv]}];
  const failures = [];
  for (const candidate of candidates) {
    try {
      await runAlignmentCommand(candidate.command, candidate.args, {logFile: log, cwd: ROOT, env});
      if (fs.existsSync(paths.python)) return;
    } catch (error) { failures.push(error.message); }
  }
  throw new Error(`Could not create the dedicated Python runtime. ${failures.join(' | ')}`);
}

export async function installAlignmentRuntime({language='ar',python}={}) {
  const paths = runtimePaths(language),model=alignmentModel(language);
  const env = alignmentEnvironment();
  const cacheVariables = ['HF_HOME', 'HUGGINGFACE_HUB_CACHE', 'TORCH_HOME', 'XDG_CACHE_HOME', 'PIP_CACHE_DIR', 'NLTK_DATA', 'PYTHONPYCACHEPREFIX'];
  for (const directory of [paths.root, paths.cache, paths.temp, paths.models, paths.logs, ...cacheVariables.map(name => env[name])]) {
    await fsp.mkdir(assertProjectOutput(directory), {recursive: true});
  }
  await bootstrapRuntime(paths, env,python);
  await fsp.copyFile(paths.runnerSource,assertProjectOutput(paths.runner));
  const pipLog = path.join(paths.logs, 'pip-install.log');
  await runAlignmentCommand(paths.python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir','--only-binary=:all:', '--index-url','https://download.pytorch.org/whl/cpu','torch==2.8.0', 'torchaudio==2.8.0'], {logFile: pipLog, cwd: ROOT, env});
  await runAlignmentCommand(paths.python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir','--only-binary=:all:', 'transformers>=4.48.0,<5', 'pandas>=2.2.3,<3', 'nltk>=3.9.1,<4'], {logFile: path.join(paths.logs,'packages.log'), cwd: ROOT, env});
  const requirement = path.join(paths.root, 'whisperx-requirement.txt');
  await fsp.writeFile(requirement, `whisperx==${WHISPERX_RELEASE.version} --hash=sha256:${WHISPERX_RELEASE.packageSha256}\n`, 'utf8');
  await runAlignmentCommand(paths.python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir','--no-deps', '--require-hashes', '-r', requirement], {logFile: path.join(paths.logs,'whisperx.log'), cwd: ROOT, env});
  const modelScript = [
    'from huggingface_hub import snapshot_download',
    `snapshot_download(repo_id=${JSON.stringify(model.repository)}, revision=${JSON.stringify(model.revision)}, local_dir=${JSON.stringify(paths.model)}, allow_patterns=["config.json","preprocessor_config.json","pytorch_model.bin","special_tokens_map.json","tokenizer_config.json","vocab.json"])`,
  ].join('; ');
  await runAlignmentCommand(paths.python, ['-c', modelScript], {logFile: path.join(paths.logs, 'model-download.log'), cwd: ROOT, env});
  await runAlignmentCommand(paths.python, ['-c', 'import nltk, os; nltk.download("punkt_tab", download_dir=os.environ["NLTK_DATA"], quiet=False, raise_on_error=True)'], {logFile: path.join(paths.logs, 'nltk-download.log'), cwd: ROOT, env});
  const modelManifest = await writeModelManifest(paths.model,model);
  const runtime = await pythonMetadata(paths.python, env);
  const {stdout: freeze} = await execFileAsync(paths.python, ['-m', 'pip', 'freeze', '--all'], {cwd: ROOT, env, windowsHide: true, maxBuffer: 4 * 1024 * 1024});
  await atomicJson(paths.runtimeManifest, {schema: 1, release: WHISPERX_RELEASE, model, runtime, packages: freeze.trim().split(/\r?\n/u), modelFiles: modelManifest.files});
  const inspection = await inspectAlignmentRuntime({language});
  if (!inspection.ready) throw new Error(`Alignment install did not pass inspection: ${inspection.issues.join('; ')}`);
  return inspection;
}
