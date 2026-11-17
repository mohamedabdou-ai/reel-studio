import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';
import {ROOT, assertProjectOutput} from './project-paths.mjs';
import {runLogged, bootstrapVenv, acquireFileLease} from './python-venv.mjs';
import {sha256File, downloadVerified} from './studio-download.mjs';

const execute = promisify(execFile);
export const PINS_FILE = path.join(ROOT, 'scripts', 'data', 'breakdown-pins.json');
const APPROVED = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0']);
export const NAMED_EXCEPTIONS = Object.freeze({
  numpy: Object.freeze({'GCC runtime library':'GPL-3.0-or-later WITH GCC-exception-3.1',libdivide:'Zlib',LAPACK:'BSD-3-Clause-Attribution',OpenBLAS:'BSD-3-Clause-Attribution'}),
  scipy: Object.freeze({'GCC runtime library':'GPL-3.0-or-later WITH GCC-exception-3.1',LAPACK:'BSD-3-Clause-Attribution',OpenBLAS:'BSD-3-Clause-Attribution'}),
  'opencv-python-headless': Object.freeze({'FFmpeg':'LGPL-2.1-or-later','Intel IPP ICV':'LicenseRef-Intel-Simplified-Software-License'}),
  onnxruntime: Object.freeze({'Eigen':'MPL-2.0','Intel MKL':'LicenseRef-Intel-Simplified-Software-License','Intel oneDNN':'LicenseRef-Intel-Simplified-Software-License'}),
});
// Owner decision 2026-11-15: Eigen only in this audited official Windows wheel.
export const EIGEN_APPROVAL = Object.freeze({
  version:'1.23.2', file:'onnxruntime-1.23.2-cp311-cp311-win_amd64.whl',
  wheelSha256:'902c756d8b633ce0dedd889b7c08459433fbcf35e9c38d1c03ddc020f0648c6e',
  binary:'onnxruntime/capi/onnxruntime.dll',
  binarySha256:'93457c4f17904d0ab98f3e9ac27ed153993f4b5b769337cbfd6f4c528fb0a509',
});
function withinEigenApproval(wheel, component) {
  if (component.name !== 'Eigen') return true;
  return canonical(wheel.name ?? '') === 'onnxruntime' && component.license === 'MPL-2.0'
    && wheel.version === EIGEN_APPROVAL.version && wheel.file === EIGEN_APPROVAL.file && wheel.sha256 === EIGEN_APPROVAL.wheelSha256
    && component.binaryFiles.includes(EIGEN_APPROVAL.binary)
    && component.binaryEvidence?.some(e => (e.file ?? e.binary) === EIGEN_APPROVAL.binary && e.sha256 === EIGEN_APPROVAL.binarySha256
      && (typeof e.marker === 'string' && e.marker.includes('EigenNonBlockingThreadPool.h') && Number.isSafeInteger(e.offset) && e.offset >= 0
        || e.markers?.some(marker => marker.includes('EigenNonBlockingThreadPool.h') && Number.isSafeInteger(e.markerOffsets?.[marker]) && e.markerOffsets[marker] >= 0)));
}
export const APPROVAL_STATEMENTS = Object.freeze({
  FFmpeg:'Approved FFmpeg LGPL-2.1-or-later in unmodified official OpenCV PyPI wheels for local installation only.',
  'GCC runtime library':'Approved the GCC runtime with GCC-exception-3.1 in unmodified official NumPy and SciPy wheels only.',
  'Intel IPP ICV':'Approved Intel IPP ICV under the Intel Simplified Software License in unmodified official OpenCV wheels only.',
  'Intel MKL':'Approved Intel code under the Intel Simplified Software License in official ONNX Runtime wheels only when binary evidence proves inclusion.',
  'Intel oneDNN':'Approved Intel code under the Intel Simplified Software License in official ONNX Runtime wheels only when binary evidence proves inclusion.',
  libdivide:'Approved libdivide under Zlib in unmodified official NumPy wheels only.',
  LAPACK:'Approved LAPACK BSD-3-Clause-Attribution in unmodified official NumPy and SciPy wheels only.',
  OpenBLAS:'Approved OpenBLAS BSD-3-Clause-Attribution in unmodified official NumPy and SciPy wheels only.',
  Eigen:'Approved Eigen MPL-2.0 in the audited unmodified official ONNX Runtime 1.23.2 Windows wheel only.',
});
export function runtimePinsIdentity(pins) {
  return createHash('sha256').update(JSON.stringify({packages:pins.packages,
    wheels:pins.wheels.map(w=>({name:w.name,version:w.version,file:w.file,sha256:w.sha256,bytes:w.bytes})),
    models:Object.fromEntries(Object.entries(pins.models).map(([k,m])=>[k,m&&{file:m.file,sha256:m.sha256,bytes:m.bytes}])),
    ocr:{backend:pins.ocr.backend,visualOrder:pins.ocr.visualOrder,characterSource:pins.ocr.characterSource}})).digest('hex');
}
// Metadata-only provenance revision: the previously installed, audited artifact set is unchanged.
const LEGACY_RUNTIME_IDENTITIES = Object.freeze({'a23bb299fbd8a31cebc6f4e8ad3d8afbc3f8ef8e7dac2ff6aa6a2e66230a506a':'0f246cad2dfc162ac4a26ec8187967a23577798c1fc906785af069835ba7bf16'});
export class LicensePolicyError extends Error {
  constructor(issues) { super('Breakdown licence policy blocks installation: ' + issues.join('; ')); this.code = 'BREAKDOWN_LICENSE_POLICY'; this.issues = issues; }
}
const PRIMARY = ['numpy', 'scipy', 'opencv-python-headless', 'onnxruntime'];
const BLOCKED = /^(?:rapidocr|six|colorama|requests|certifi|tqdm|charset-normalizer|idna|urllib3|pillow|shapely|pyclipper|omegaconf|pyyaml|colorlog|madmom|beatnet|essentia|aubio|bandit|uvr|open-unmix|demucs|librosa)(?:$|-)/u;
const canonical = name => name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
const safeName = file => typeof file === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(file) && file !== '..';
const isHash = hash => typeof hash === 'string' && /^[0-9a-f]{64}$/u.test(hash);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validatePins(pins, {auditOnly = false} = {}) {
  const policyIssues = [];
  if (pins?.schema !== 1 || !Array.isArray(pins.packages) || !pins.packages.length || !Array.isArray(pins.wheels) || !pins.wheels.length || !pins.models || typeof pins.ocr?.visualOrder !== 'boolean') throw new Error('Breakdown pins are incomplete; Task 1 must provide verified wheels, models and OCR order.');
  if (pins.python?.min !== '3.10' || pins.python?.maxExclusive !== '3.14') throw new Error('Unsupported Python range in breakdown pins.');
  if (pins.wheelTarget && (pins.wheelTarget.python !== '3.11' || pins.wheelTarget.implementation !== 'cp' || pins.wheelTarget.platform !== 'win_amd64')) throw new Error('This retained wheel set targets CPython 3.11 Windows x64.');
  const packages = new Map(), wheelNames = new Set(), files = new Set();
  for (const spec of pins.packages) {
    if (typeof spec !== 'string' || !/^[a-zA-Z0-9_.-]+==[a-zA-Z0-9.+!_-]+$/u.test(spec)) throw new Error('Every package must have one exact version.');
    const [raw, version] = spec.split('=='), name = canonical(raw);
    if (packages.has(name) || BLOCKED.test(name) || ['opencv-python','opencv-contrib-python','opencv-contrib-python-headless'].includes(name)) throw new Error('Duplicate or unapproved package in pins.');
    packages.set(name, version);
  }
  for (const name of PRIMARY) if (!packages.has(name)) throw new Error(`Required package missing: ${name}`);
  function artifact(a, wheel = false) {
    if (!a || !safeName(a.file) || !isHash(a.sha256) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0 || typeof a.license !== 'string' || !a.license || typeof a.licenseUrl !== 'string') throw new Error('Artifact needs a safe filename, size, SHA-256 and verified permitted licence.');
    if (!APPROVED.has(a.license)) policyIssues.push(`${a.name ?? a.file}: ${a.license} is outside the approved allowlist`);
    // A top-level SPDX label does not cover bundled DLLs (GEOS/FFmpeg).
    if (!Array.isArray(a.bundledLicenses)) throw new Error('Every artifact requires an explicit bundled-license audit.');
    for (const component of a.bundledLicenses) {
      if (!component.name || !component.license || !component.licenseUrl || new URL(component.licenseUrl).protocol !== 'https:') throw new Error('Bundled component needs its name, licence and evidence URL.');
      const excepted = wheel && NAMED_EXCEPTIONS[canonical(a.name ?? '')]?.[component.name] === component.license
        && component.source === 'official-pypi-wheel' && Array.isArray(component.binaryFiles) && component.binaryFiles.length > 0
        && component.licenseFile && isHash(component.licenseSha256) && withinEigenApproval(a,component)
        && component.approval?.date === '2026-11-15' && component.approval?.statement === APPROVAL_STATEMENTS[component.name]
        && (canonical(a.name ?? '') !== 'onnxruntime' || component.binaryEvidence?.some(e=>component.binaryFiles.includes(e.file ?? e.binary) && isHash(e.sha256) && (typeof e.marker === 'string' && Number.isSafeInteger(e.offset) && e.offset >= 0 || e.markers?.some(marker=>Number.isSafeInteger(e.markerOffsets?.[marker]) && e.markerOffsets[marker] >= 0))));
      if (!APPROVED.has(component.license) && !excepted) policyIssues.push(`${a.name ?? a.file}/${component.name}: ${component.license} is not an approved named exception`);
    }
    const url = new URL(a.url), licenseUrl = new URL(a.licenseUrl);
    if (url.protocol !== 'https:' || licenseUrl.protocol !== 'https:' || url.username || url.password) throw new Error('Artifacts require public HTTPS URLs.');
    if (wheel && (url.hostname !== 'files.pythonhosted.org' || !a.file.endsWith('.whl'))) throw new Error('Only PyPI wheels are approved.');
    if (files.has(a.file)) throw new Error('Artifact filenames must be unique.');
    files.add(a.file);
  }
  for (const wheel of pins.wheels) {
    artifact(wheel, true);
    const name = canonical(wheel.name ?? '');
    if (packages.get(name) !== wheel.version || wheelNames.has(name)) throw new Error('Wheel lock and packages must match exactly.');
    wheelNames.add(name);
  }
  if (wheelNames.size !== packages.size) throw new Error('Every dependency must have a locked wheel.');
  if (!pins.models.det || !pins.models.rec) throw new Error('Arabic OCR detection and recognition models are required.');
  for (const [key, model] of Object.entries(pins.models)) {
    if (!['det', 'rec', 'keys', 'yamnet', 'yamnetClassMap'].includes(key)) throw new Error('Unapproved model slot.');
    if (model) artifact(model);
  }
  if (Boolean(pins.models.yamnet) !== Boolean(pins.models.yamnetClassMap)) throw new Error('YAMNet requires its verified class map.');
  if (pins.postInstallUninstall?.length) throw new Error('Removing dependencies after installation is unsupported.');
  if (pins.audit?.status === 'blocked') policyIssues.push(...(pins.audit.blockers ?? ['Wheel licence audit requires owner review.']));
  if (policyIssues.length && !auditOnly) throw new LicensePolicyError([...new Set(policyIssues)]);
  return pins;
}
export function loadPins(file = PINS_FILE) { return validatePins(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function breakdownPaths(root = ROOT) {
  const base = path.join(root, 'Tools', 'breakdown');
  return {root: base, venv: path.join(base, 'venv'), python: path.join(base, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    models: path.join(base, 'models'), logs: path.join(base, 'logs'), cache: path.join(base, 'cache'), wheels: path.join(base, 'cache', 'wheels'),
    temp: path.join(base, 'tmp'), lock: path.join(base, 'requirements.lock'), runtimeManifest: path.join(base, 'runtime.json'), packageRoot: path.join(root, 'scripts', 'python')};
}
export function breakdownEnvironment(base = process.env, paths = breakdownPaths()) {
  const clean = {...base};
  for (const key of Object.keys(clean)) if (/TOKEN|SECRET|API_KEY|^PYTHONHOME$|^PYTHONPATH$|^PIP_/iu.test(key)) delete clean[key];
  return {...clean, PYTHONPATH: paths.packageRoot, PYTHONNOUSERSITE: '1', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1',
    PIP_CONFIG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null', PIP_NO_INDEX: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1',
    HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PIP_CACHE_DIR: path.join(paths.cache, 'pip'), PYTHONPYCACHEPREFIX: path.join(paths.cache, 'pycache'),
    TEMP: paths.temp, TMP: paths.temp, TMPDIR: paths.temp, OMP_NUM_THREADS: base.OMP_NUM_THREADS ?? '6',
    PATH: [path.join(ROOT, 'Tools', 'bin'), path.dirname(paths.python), base.PATH ?? ''].join(path.delimiter)};
}
export function modelPaths(pins = loadPins(), paths = breakdownPaths()) {
  validatePins(pins);
  return Object.fromEntries(['det', 'rec', 'keys', 'yamnet', 'yamnetClassMap'].map(key => [key, pins.models[key] ? path.join(paths.models, pins.models[key].file) : null]));
}
export function requirementsLock(pins) {
  validatePins(pins);
  return pins.wheels.map(w => `${w.name}==${w.version} --hash=sha256:${w.sha256}`).sort().join('\n') + '\n';
}
export async function verifyArtifacts(pins, paths, {wheels = true} = {}) {
  validatePins(pins);
  const entries = [...(wheels ? pins.wheels.map(a => [path.join(paths.wheels, a.file), a]) : []), ...Object.values(pins.models).filter(Boolean).map(a => [path.join(paths.models, a.file), a])];
  for (const [file, artifact] of entries) {
    const stat = await fsp.stat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!stat?.isFile() || stat.size !== artifact.bytes || await sha256File(file) !== artifact.sha256) throw new Error(`Verified local artifact missing or corrupt: ${file}. Run the approved Task 1 acquisition in the main checkout; analysis never downloads.`);
  }
}
async function pythonVersions(python, paths) {
  const {stdout} = await execute(python, ['-m', 'breakdown', 'version'], {cwd: ROOT, env: breakdownEnvironment(process.env, paths), windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024});
  return JSON.parse(stdout.trim());
}
export async function inspectBreakdownRuntime({paths = breakdownPaths(), pinsFile = PINS_FILE, inspectPython = pythonVersions} = {}) {
  const result = {schema: 1, installed: fs.existsSync(paths.python), ready: false, issues: [], runtime: null, paths, unavailable: null};
  let pins;
  try { pins = loadPins(pinsFile); }
  catch (e) {
    if (e.code === 'ENOENT' && !result.installed) { result.unavailable = 'pins-missing'; result.issues.push('Verified breakdown pins are not available yet (Task 1).'); return result; }
    if (e.code === 'BREAKDOWN_LICENSE_POLICY' && !result.installed) { result.unavailable = 'license-policy'; result.issues.push(...e.issues); return result; }
    throw new Error(`Breakdown pins are invalid: ${e.message}`, {cause: e});
  }
  if (!result.installed) { result.unavailable = 'runtime-missing'; result.issues.push('The breakdown add-on is not installed.'); return result; }
  try {
    result.runtime = await inspectPython(paths.python, paths);
    const py = result.runtime.python?.split('.').map(Number);
    if (py?.[0] !== 3 || !(py[1] >= 10 && py[1] < 14)) throw new Error('Python 3.10-3.13 is required.');
    if (result.runtime.breakdown !== '1.0.0') throw new Error('Analyser version differs from the expected version.');
    for (const spec of pins.packages) {
      const [name, version] = spec.split('==');
      if (result.runtime.packages?.[canonical(name)] !== version) throw new Error(`Expected ${name} ${version}, found ${result.runtime.packages?.[canonical(name)] ?? 'none'}.`);
    }
    const allowed = new Set([...pins.packages.map(s=>canonical(s.split('==')[0])), 'pip','setuptools','wheel']);
    for (const name of Object.keys(result.runtime.packages ?? {})) if (!allowed.has(canonical(name))) throw new Error(`Installed runtime contains unpinned package: ${name}`);
    const manifest = JSON.parse(await fsp.readFile(paths.runtimeManifest, 'utf8'));
    result.cachePolicy = manifest.cachePolicy ?? {mode:'retained-local-cache'};
    const identity=runtimePinsIdentity(pins);
    const matching=manifest.runtimeIdentitySha256 ? manifest.runtimeIdentitySha256===identity : manifest.pinsSha256===digest(pins) || LEGACY_RUNTIME_IDENTITIES[manifest.pinsSha256]===identity;
    if (!matching) throw new Error('Installed runtime lock differs from current pins.');
    await verifyArtifacts(pins, paths, {wheels: false});
  } catch (e) { result.issues.push(`Installed breakdown runtime is corrupt: ${e.message}`); }
  result.ready = result.issues.length === 0;
  return result;
}
export function runtimeTestSkip(readiness) {
  if (readiness.ready) return false;
  if (readiness.unavailable) return `breakdown add-on unavailable (${readiness.unavailable}): ${readiness.issues[0] ?? 'unknown'}${readiness.issues.length > 1 ? ` (+${readiness.issues.length - 1} more; see inspect)` : ''}`;
  throw new Error(`Installed breakdown runtime failed inspection: ${readiness.issues.join('; ')}`);
}
// Installation is standalone: the coordinator only needs this module, the
// shared venv helper, pins and Python skeleton in the main checkout.
async function atomicJson(file, value) {
  assertProjectOutput(file);
  const temp = assertProjectOutput(`${file}.${randomUUID()}.tmp`);
  try {
    await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {encoding:'utf8',flag:'wx'});
    await fsp.rename(temp, assertProjectOutput(file));
  } finally { await fsp.rm(temp, {force:true}); }
}

const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
async function bytesBelow(directory) {
  let entries;
  try { entries = await fsp.readdir(directory, {withFileTypes:true}); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  let bytes = 0;
  for (const entry of entries) {
    const file = path.join(directory,entry.name);
    if (entry.isDirectory()) bytes += await bytesBelow(file);
    else if (entry.isFile()) bytes += (await fsp.stat(file)).size;
    else throw new Error(`Unexpected filesystem link in add-on size measurement: ${file}`);
  }
  return bytes;
}
export async function pruneBreakdownCache({paths=breakdownPaths(),pinsFile=PINS_FILE,inspectPython=pythonVersions}={}) {
  assertProjectOutput(paths.root);
  const release=await acquireFileLease(path.join(paths.root,'install.lock'),{label:'Breakdown maintenance'});
  try{return await discardVerifiedCache({paths,pinsFile,inspectPython});}finally{await release();}
}
async function discardVerifiedCache({paths,pinsFile,inspectPython}) {
  const cache=assertProjectOutput(paths.cache),root=await fsp.realpath(paths.root);
  if(path.relative(path.resolve(paths.root),cache)!=='cache')throw new Error('Refusing to remove anything other than the add-on cache.');
  if(fs.existsSync(cache)&&path.relative(root,await fsp.realpath(cache))!=='cache')throw new Error('Cache resolves to an unexpected directory.');
  const before=await inspectBreakdownRuntime({paths,pinsFile,inspectPython});
  if(!before.ready)throw new Error('Cache cleanup requires a verified installed add-on: '+before.issues.join('; '));
  const installedBytesBefore=await bytesBelow(paths.root),removedBytes=await bytesBelow(cache);
  const manifest=JSON.parse(await fsp.readFile(paths.runtimeManifest,'utf8'));
  await fsp.rm(assertProjectOutput(cache),{recursive:true,force:true});await fsp.mkdir(assertProjectOutput(cache),{recursive:true});
  await atomicJson(paths.runtimeManifest,{...manifest,cachePolicy:{mode:'discard-after-verified-install',prunedAt:new Date().toISOString(),removedBytes,
    reinstall:'Healthy install is idempotent. Repair requires explicit local staging or --allow-download after a new user yes. No archive path is stored.'}});
  const after=await inspectBreakdownRuntime({paths,pinsFile,inspectPython});if(!after.ready)throw new Error(after.issues.join('; '));
  const installedBytesAfter=await bytesBelow(paths.root);
  return {ready:true,removedBytes,installedBytesBefore,installedBytesAfter,targetBytes:450000000,withinTarget:installedBytesAfter<=450000000,cachePolicy:after.cachePolicy};
}
async function stageArtifacts(pins,paths,{artifactDirectory,allowDownload,download,log}) {
  for(const [targetDir,sourceDir,artifacts] of [[paths.wheels,artifactDirectory&&path.join(artifactDirectory,'cache/wheels'),pins.wheels],[paths.models,artifactDirectory&&path.join(artifactDirectory,'models'),Object.values(pins.models).filter(Boolean)]]){
    await fsp.mkdir(assertProjectOutput(targetDir),{recursive:true});
    for(const a of artifacts){
      const target=assertProjectOutput(path.join(targetDir,a.file));
      if(await sha256File(target)===a.sha256 && (await fsp.stat(target)).size===a.bytes)continue;
      if(sourceDir){
        const source=path.join(sourceDir,a.file);
        if(await sha256File(source)!==a.sha256 || (await fsp.stat(source)).size!==a.bytes)throw new Error('Local staged artifact is missing or corrupt: '+source);
        const temp=assertProjectOutput(target+'.'+randomUUID()+'.tmp');
        try{await fsp.copyFile(source,temp,fs.constants.COPYFILE_EXCL);await fsp.rename(temp,assertProjectOutput(target));}finally{await fsp.rm(temp,{force:true});}
      }else if(allowDownload){await download({url:a.url,sha256:a.sha256,bytes:a.bytes,target,log});}
      else throw new Error('Verified local artifact unavailable: '+a.file+'. Supply --artifact-dir for this operation, or obtain a new user yes before --allow-download. No download was started.');
    }
  }
}
export async function installBreakdownRuntime({python,artifactDirectory,allowDownload=false,download=downloadVerified,log=()=>{},paths=breakdownPaths(),pinsFile=PINS_FILE,run=runLogged,inspectPython=pythonVersions}={}) {
  if(typeof allowDownload!=='boolean')throw new Error('allowDownload must be an explicit boolean backed by a new user yes.');
  if(artifactDirectory!==undefined && (typeof artifactDirectory!=='string'||!artifactDirectory.trim()))throw new Error('artifactDirectory must name explicit local staging.');
  const pins=loadPins(pinsFile),env=breakdownEnvironment(process.env,paths);
  for(const dir of [paths.root,paths.models,paths.logs,paths.cache,paths.temp,paths.wheels,env.PIP_CACHE_DIR])assertProjectOutput(dir);
  await fsp.mkdir(paths.root,{recursive:true});
  const release=await acquireFileLease(path.join(paths.root,'install.lock'),{label:'Breakdown install'});
  try{
    const current=await inspectBreakdownRuntime({paths,pinsFile,inspectPython});
    if(current.ready){const cacheCleanup=await discardVerifiedCache({paths,pinsFile,inspectPython});return {...await inspectBreakdownRuntime({paths,pinsFile,inspectPython}),cacheCleanup,alreadyReady:true};}
    await stageArtifacts(pins,paths,{artifactDirectory,allowDownload,download,log});await verifyArtifacts(pins,paths);
    for(const dir of [paths.logs,paths.temp,env.PIP_CACHE_DIR])await fsp.mkdir(assertProjectOutput(dir),{recursive:true});
    await fsp.writeFile(assertProjectOutput(paths.lock),requirementsLock(pins),'utf8');
    await bootstrapVenv({venv:paths.venv,python:paths.python,explicitPython:python,logFile:path.join(paths.logs,'bootstrap.log'),env,run:(command,args,options)=>run(command,args,{...options,cwd:ROOT})});
    const required=pins.wheelTarget?.python;
    await run(paths.python,['-c',`import sys,platform; required=${required?JSON.stringify(required):'None'}; ok=(3,10)<=sys.version_info[:2]<(3,14) and (required is None or sys.version_info[:2]==tuple(map(int,required.split('.'))) and platform.machine().lower() in ('amd64','x86_64')); sys.exit(0 if ok else 'Matching CPython 3.11 Windows x64 is required')`],{logFile:path.join(paths.logs,'python-version.log'),cwd:ROOT,env,label:'Breakdown Python version'});
    await run(paths.python,['-m','breakdown.offline_pip','install','--no-compile','--no-cache-dir','--isolated','--disable-pip-version-check','--no-index','--find-links',paths.wheels,'--only-binary=:all:','--require-hashes','-r',paths.lock],{logFile:path.join(paths.logs,'pip-install.log'),cwd:ROOT,env,label:'Breakdown package install'});
    await run(paths.python,['-m','breakdown.offline_pip','check'],{logFile:path.join(paths.logs,'pip-check.log'),cwd:ROOT,env,label:'Breakdown dependency check'});
    const runtime=await inspectPython(paths.python,paths);await atomicJson(paths.runtimeManifest,{schema:1,pinsSha256:digest(pins),runtimeIdentitySha256:runtimePinsIdentity(pins),runtime});
    const cacheCleanup=await discardVerifiedCache({paths,pinsFile,inspectPython});return {...await inspectBreakdownRuntime({paths,pinsFile,inspectPython}),cacheCleanup};
  }finally{await release();}
}
