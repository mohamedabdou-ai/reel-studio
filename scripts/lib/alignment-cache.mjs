import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {ROOT, assertProjectOutput} from './project-paths.mjs';
import {ALIGNMENT_SCHEMA} from './alignment-contract.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function alignmentCacheKey(identity) {
  return createHash('sha256').update(JSON.stringify(canonical({schema: ALIGNMENT_SCHEMA, identity}))).digest('hex');
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

async function atomicJson(file, value) {
  assertProjectOutput(file);
  await fsp.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, file);
}

const FILES = Object.freeze({draft: 'alignment-draft.json', diagnostics: 'diagnostics.json', raw: 'whisperx-raw.json'});
const OUTPUT_NAMES = Object.freeze([...Object.values(FILES), 'alignment-cache.json']);

function canonicalFuturePath(file) {
  const absolute = path.resolve(file);
  let existing = absolute;
  const tail = [];
  while (!fs.existsSync(existing)) {
    tail.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const resolved = path.join(fs.realpathSync(existing), ...tail);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function existingFileIdentity(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? `${stat.dev}:${stat.ino}` : null;
  } catch {
    return null;
  }
}

export function assertAlignmentWritePlan(output, {manifestFile, sourceFile} = {}) {
  const directory = assertProjectOutput(path.resolve(ROOT, output));
  const relative = path.relative(ROOT, directory);
  if (relative.split(path.sep)[0] !== 'Projects') throw new Error('Alignment output must stay under Projects/.');
  if (fs.existsSync(directory) && !fs.statSync(directory).isDirectory()) throw new Error('Alignment output must resolve to a directory.');
  const planned = OUTPUT_NAMES.map(name => assertProjectOutput(path.join(directory, name)));
  const seenPaths = new Set();
  const seenFiles = new Set();
  for (const file of planned) {
    const canonical = canonicalFuturePath(file);
    const identity = existingFileIdentity(file);
    if (seenPaths.has(canonical) || (identity && seenFiles.has(identity))) throw new Error('Planned alignment outputs alias or collide with each other.');
    seenPaths.add(canonical);
    if (identity) seenFiles.add(identity);
  }
  for (const input of [manifestFile, sourceFile].filter(Boolean)) {
    const canonical = canonicalFuturePath(input);
    const identity = existingFileIdentity(input);
    if (seenPaths.has(canonical) || (identity && seenFiles.has(identity))) throw new Error(`Alignment output would overwrite or collide with input: ${input}`);
  }
  return {directory, files: planned};
}

export async function writeAlignmentCache(directory, identity, outputs) {
  const dir = assertProjectOutput(path.resolve(directory));
  await fsp.mkdir(dir, {recursive: true});
  const files = {};
  for (const [key, name] of Object.entries(FILES)) {
    if (!(key in outputs)) throw new Error(`Missing alignment output: ${key}.`);
    const file = path.join(dir, name);
    await atomicJson(file, outputs[key]);
    files[name] = await sha256File(file);
  }
  const manifest = {schema: ALIGNMENT_SCHEMA, cacheKey: alignmentCacheKey(identity), identity, files};
  await atomicJson(path.join(dir, 'alignment-cache.json'), manifest);
  return manifest;
}

export async function readAlignmentCache(directory, identity) {
  const dir = assertProjectOutput(path.resolve(directory));
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'alignment-cache.json'), 'utf8'));
    if (manifest.schema !== ALIGNMENT_SCHEMA || manifest.cacheKey !== alignmentCacheKey(identity)) return null;
    const result = {};
    for (const [key, name] of Object.entries(FILES)) {
      const file = assertProjectOutput(path.join(dir, name));
      if (await sha256File(file) !== manifest.files?.[name]) return null;
      result[key] = JSON.parse(await fsp.readFile(file, 'utf8'));
    }
    return result;
  } catch {
    return null;
  }
}

export async function writeAlignmentOutputs(output, identity, outputs) {
  const {directory: dir} = assertAlignmentWritePlan(output);
  const relative = path.relative(ROOT, dir);
  const cacheManifest = await writeAlignmentCache(dir, identity, outputs);
  return {directory: relative.replaceAll(path.sep, '/'), cacheManifest};
}
