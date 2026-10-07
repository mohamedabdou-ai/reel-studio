import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const FOOTAGE_EXT = /\.(mp4|mov|webm|mkv)$/i;
export const HEAD_FLAG_KEYS = Object.freeze(['head-envelope', 'head-geometry', 'head-source', 'head-method', 'head-exempt']);
export const HEAD_METHODS = Object.freeze(['auto', 'blazeface']);
export const HEAD_EXEMPT_REASONS = Object.freeze(['no-presenter']);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const pushUnique = (list, value) => { if (value && !list.includes(value)) list.push(value); };



export function plateName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\\/g, '/');
  return name || null;
}


export function footageName(value) {
  const name = plateName(value);
  if (!name || !FOOTAGE_EXT.test(name)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(name) || name.startsWith('/') || name.split('/').includes('..')) return null;
  return name;
}



export function manifestFootage(props) {
  const found = [];
  if (!isObject(props)) return found;
  if (isObject(props.plate)) pushUnique(found, footageName(props.plate.src));
  const scenes = isObject(props.edit) && Array.isArray(props.edit.scenes) ? props.edit.scenes : [];
  for (const scene of scenes) {
    const data = isObject(scene) ? scene.data : null;
    if (!isObject(data)) continue;
    if (isObject(data.foreground)) pushUnique(found, footageName(data.foreground.src));
    if (!Array.isArray(data.steps)) continue;
    for (const step of data.steps) if (isObject(step) && step.kind === 'video') pushUnique(found, footageName(step.src));
  }
  return found;
}


export function plateGate({ comp, mode, props, inputProps = {}, noCheck = false }) {
  const deliver = mode === 'deliver';
  const given = isObject(props) ? props : {};
  const declared = [];
  if (Array.isArray(given.plates)) for (const plate of given.plates) pushUnique(declared, plateName(plate));
  const discovered = manifestFootage(given);
  const undeclared = discovered.filter((name) => !declared.includes(name));
  const only = [...declared, ...undeclared];
  const markerFromCli = isObject(inputProps) && Object.hasOwn(inputProps, 'noPlates');
  const noPlates = given.noPlates === true && !markerFromCli;
  const messages = [];
  const decide = (action, level) => ({ action, level, declared, discovered, undeclared, only, noPlates, messages });

  if (markerFromCli) {
    messages.push('noPlates is a registration marker (engine/src/Root.tsx withoutPlates()), never a render prop — remove it from --props / --props-file');
    if (deliver) return decide('refuse', 'fail');
  }
  if (noCheck) return decide('skip', markerFromCli ? 'warn' : 'ok');
  if (only.length && noPlates) {
    messages.push(`${comp} is marked noPlates: true but mounts footage (${only.join(', ')}) — replace withoutPlates() with withPlates([...])`);
    return deliver ? decide('refuse', 'fail') : decide('check', 'warn');
  }
  if (only.length) {
    if (undeclared.length) messages.push(`${comp} mounts ${undeclared.length} video file(s) missing from props.plates; checking them too: ${undeclared.join(', ')}`);
    return decide('check', messages.length ? 'warn' : 'ok');
  }
  if (noPlates) {
    messages.push(`${comp} declares noPlates: true (no footage) — plate guard not applicable`);
    return decide('skip', 'ok');
  }
  messages.push(`${comp} declares no plates: declare the footage it mounts with withPlates([...]) in engine/src/Root.tsx, or mark a footage-free composition with withoutPlates()${deliver ? '' : ' — --deliver will refuse it'}`);
  return deliver ? decide('refuse', 'fail') : decide('skip', 'warn');
}


export function validateHeadFlags(args, { mode, comp, manifestComps }) {
  const flags = { envelope: null, geometry: null, source: null, method: null, exempt: null };
  const present = HEAD_FLAG_KEYS.filter((key) => args[key] !== undefined);
  if (!present.length) return flags;
  const names = present.map((key) => `--${key}`).join(', ');
  if (mode !== 'deliver') throw new Error(`${names}: head keep-out flags are delivery options (--deliver); for a review run node scripts/head-check.mjs directly`);
  for (const key of present) if (typeof args[key] !== 'string' || !args[key].trim()) throw new Error(`--${key} needs a value`);
  const value = (key) => (args[key] === undefined ? null : args[key].trim());
  Object.assign(flags, { envelope: value('head-envelope'), geometry: value('head-geometry'), source: value('head-source'), method: value('head-method'), exempt: value('head-exempt') });
  if (flags.method !== null && !HEAD_METHODS.includes(flags.method)) throw new Error(`--head-method must be one of ${HEAD_METHODS.join('|')}`);
  const manifest = manifestComps.includes(comp);
  if (flags.exempt !== null) {
    if (!HEAD_EXEMPT_REASONS.includes(flags.exempt)) throw new Error(`--head-exempt must be one of ${HEAD_EXEMPT_REASONS.join('|')}`);
    if (present.length > 1) throw new Error('--head-exempt cannot be combined with other --head-* flags');
    if (manifest) throw new Error(`${comp} always mounts the presenter plate; it cannot be --head-exempt`);
    return flags;
  }
  if (manifest && flags.geometry !== null) throw new Error(`--head-geometry is for hand-built compositions; ${comp} takes its head geometry from the edit manifest`);
  if (manifest && flags.source !== null) throw new Error(`--head-source is for hand-built compositions; ${comp}'s source comes from the edit manifest`);
  if (!manifest && flags.geometry === null) throw new Error(`${names} need a head-check run, but ${comp} has no manifest geometry: add --head-geometry <file> (the scripts/head-check.mjs --geometry format)`);
  return flags;
}


export function headGatePlan({ comp, flags, footageMounted, manifestComps, presenter = true }) {
  const skip = (status, reason) => ({ run: false, status, reason, geometryArgs: [] });
  if (flags.exempt) return skip('EXEMPT', `--head-exempt ${flags.exempt}: declared to show no presenter`);
  if (presenter === false) return skip('EXEMPT', `${comp} edits a screen-only source (edit.presenter: false); there is no face to protect`);
  if (!footageMounted) {
    const ignored = flags.envelope || flags.geometry || flags.source || flags.method ? '; --head-* flags ignored' : '';
    return skip('NO-FOOTAGE', `${comp} mounts no footage (noPlates: true), so it cannot show the presenter${ignored}`);
  }
  if (manifestComps.includes(comp)) return { run: true, status: null, reason: null, geometryArgs: ['--manifest-geometry'] };
  if (flags.geometry) return { run: true, status: null, reason: null, geometryArgs: ['--geometry', flags.geometry] };
  return skip('NEEDS-REVIEW', `head-check did not run: ${comp} has no manifest geometry. Pass --head-geometry <file> to measure it, or --head-exempt no-presenter when no presenter is on screen`);
}


export function headCheckArgv({ script, comp, propsFile, outDir, plan, flags }) {
  if (!plan.run) throw new Error('headCheckArgv: this plan does not run head-check');
  return [script, '--comp', comp, '--props-file', propsFile, '--out', outDir, ...plan.geometryArgs,
    ...(flags.source ? ['--source', flags.source] : []), ...(flags.method ? ['--method', flags.method] : [])];
}

function describeCounts(report) {
  const c = isObject(report?.counts) ? report.counts : {};
  const e = isObject(report?.envelope) ? report.envelope : {};
  return `frames ${c.frames ?? '?'}: PASS ${c.PASS ?? 0}, FAIL ${c.FAIL ?? 0}, NEEDS-REVIEW ${c['NEEDS-REVIEW'] ?? 0}, SKIPPED ${c.SKIPPED ?? 0}, HEAD-OFFSCREEN ${c['HEAD-OFFSCREEN'] ?? 0}; envelope ${e.method ?? 'missing'} (${e.nullSamples ?? '?'} null of ${e.samples ?? '?'} samples)`;
}


export function headGateResult({ exitCode, report, exitCodes, reviewedBy = null }) {
  const byExit = new Map([[exitCodes.PASS, 'PASS'], [exitCodes.FAIL, 'FAIL'], [exitCodes['NEEDS-REVIEW'], 'NEEDS-REVIEW'], [exitCodes.contract, 'CONTRACT-FAILURE']]);
  const expected = byExit.get(exitCode) ?? null;
  const said = isObject(report) && typeof report.status === 'string' ? report.status : null;
  const counts = isObject(report?.counts) ? report.counts : null;
  if (!expected) return { status: 'ERROR', block: true, reason: `head-check exited ${exitCode}${said ? ` (report: ${said})` : ' without a report'}`, counts };
  if (said !== expected) return { status: 'ERROR', block: true, reason: `head-check exit ${exitCode} means ${expected} but report.json says ${said ?? 'nothing'}`, counts };
  if (expected === 'PASS') return { status: 'PASS', block: false, reason: null, counts };
  if (expected === 'NEEDS-REVIEW') return reviewedBy
    ? { status: 'NEEDS-REVIEW', block: false, reason: `${describeCounts(report)}; face-check stills reviewed by ${reviewedBy}`, counts }
    : { status: 'NEEDS-REVIEW', block: true, reason: `${describeCounts(report)}; show the face-check stills to the creator, then deliver with --face-reviewed-by <name> once they confirm`, counts };
  if (expected === 'FAIL') return { status: 'FAIL', block: true, reason: `${counts?.FAIL ?? 'some'} frame(s) put graphics on the head, hair or beard — ${describeCounts(report)}`, counts };
  return { status: 'CONTRACT-FAILURE', block: true, reason: typeof report.contractFailure === 'string' ? report.contractFailure : 'probe contract failure', counts };
}


export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}


export function envelopeProblems({ provided, report, cachedAfter }) {
  const problems = [];
  const used = isObject(report) && isObject(report.envelope) ? report.envelope : null;
  if (!used) problems.push('head-check report has no envelope section');
  else {
    if (used.sourceSha256 !== provided.source.sha256) problems.push(`head-check measured source ${used.sourceSha256 ?? 'unknown'}, but --head-envelope belongs to ${provided.source.sha256}`);
    if (used.method !== provided.method) problems.push(`head-check used a "${used.method}" envelope, --head-envelope is "${provided.method}"`);
    if (typeof used.samples === 'number' && used.samples !== provided.samples.length) problems.push(`head-check used ${used.samples} samples, --head-envelope has ${provided.samples.length}`);
  }
  if (!cachedAfter || stableStringify(cachedAfter) !== stableStringify(provided)) problems.push('the cached envelope was replaced while head-check ran, so the provided envelope is not the one that was checked');
  return problems;
}


export function headBanner(head, directory) {
  const bar = '='.repeat(72);
  return [bar,
    `HEAD KEEP-OUT ${head.status}: ${head.reason ?? 'no reason recorded'}`,
    directory ? `Evidence: ${directory} (report.json, sheet.jpg)` : 'Evidence: none — scripts/head-check.mjs did not run',
    'This delivery is NOT head-verified. Look at the presenter frames before posting and record the decision in QC_REPORT.md.',
    bar].join('\n');
}


export async function readEnvelopeBack(file, headLib) {
  const text = await fs.readFile(file, 'utf8').catch(() => null);
  if (text === null) return null;
  try { return headLib.validateHeadEnvelope(JSON.parse(text)); } catch { return null; }
}






async function headEnvelopeCodeSha256() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'head-envelope.mjs');
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}








export function headMethodConflict({ requested, installedMethod }) {
  if (requested && requested !== 'auto' && installedMethod && requested !== installedMethod) {
    return `--head-method ${requested} conflicts with --head-envelope method ${installedMethod}; drop one`;
  }
  return null;
}






















export async function installHeadEnvelope(file, headLib) {
  const text = await fs.readFile(file, 'utf8').catch(() => null);
  if (text === null) throw new Error(`--head-envelope not found: ${file}`);
  const provided = headLib.validateHeadEnvelope(JSON.parse(text));
  if (provided.method === 'none') throw new Error('--head-envelope has method "none" (no head was detected); omit it so head-check builds an envelope, or fix the source');
  const target = headLib.envelopeFile(provided.source.sha256);
  const slotUsed = (await fs.stat(target).catch(() => null)) !== null;
  const existing = slotUsed ? await readEnvelopeBack(target, headLib) : null;
  if (slotUsed && !existing) throw new Error(`The cached head envelope ${target} is unreadable; rebuild it: node scripts/head-check.mjs --envelope-only --source <file> --rebuild-envelope`);
  if (existing && stableStringify(existing) !== stableStringify(provided)) throw new Error(`A different head envelope is already cached for source ${provided.source.sha256} at ${target}; compare the two, then remove the stale one or pass it instead`);

  const buildTarget = target.replace(/\.json$/, '.build.json');
  const sidecarCore = {
    version: 1,
    sha256: provided.source.sha256,
    method: provided.method,
    every: Math.max(1, Math.round(provided.source.fps / 5)),
    analysisWidth: headLib.ANALYSIS_WIDTH,
    rvmOutWidth: headLib.RVM_OUT_WIDTH,
    alphaThreshold: headLib.ALPHA_THRESHOLD,
    padding: headLib.HEAD_PADDING?.[provided.method] ?? null,
    matte: null,
    codeSha256: await headEnvelopeCodeSha256(),
    errors: [],
  };
  const sidecar = { ...sidecarCore, installedFrom: file };







  const sidecarKey = (record) => stableStringify({ sha256: record?.sha256, method: record?.method, every: record?.every, codeSha256: record?.codeSha256 });
  const existingSidecarText = await fs.readFile(buildTarget, 'utf8').catch(() => null);
  let existingSidecar = null;
  if (existingSidecarText !== null) {
    try { existingSidecar = JSON.parse(existingSidecarText); } catch { existingSidecar = null; }
    if (!existingSidecar || sidecarKey(existingSidecar) !== sidecarKey(sidecarCore)) {
      throw new Error(`A different head envelope build record is already cached at ${buildTarget}; compare the two, then remove the stale one`);
    }
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!existing) await fs.writeFile(target, JSON.stringify(provided, null, 2), 'utf8');
  if (existingSidecarText === null) await fs.writeFile(buildTarget, JSON.stringify(sidecar, null, 2), 'utf8');
  return { source: file, provided, target, installed: !existing };
}
