import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { ROOT } from './media.mjs';

export { ROOT };
export const slug = (value, label = 'id') => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be a lowercase slug (letters, numbers and hyphens, maximum 64 characters).`);
  }
  return value;
};

export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('-') || value.length > 2000 || path.isAbsolute(value)
    || path.win32.isAbsolute(value) || /[\\<>:"|?*\x00-\x1f]/.test(value)) {
    throw new Error(`Use a project-root-relative path with forward slashes: ${String(value)}`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe path component: ${value}`);
  }
  if (parts.some((part) => ['.git', '.codex', '.agents'].includes(part.toLowerCase()))) {
    throw new Error(`Repository control directories are not job paths: ${value}`);
  }
  return value;
}

export async function checkedPath(value, { write = false, project, internal = false, mustExist = false, file = true } = {}) {
  relativePath(value);
  const parts = value.split('/');
  if (!internal && parts.some((part) => part.toLowerCase() === '.jobs')) throw new Error(`Job state is reserved: ${value}`);
  if (write) {
    slug(project, 'project');
    if (parts[0] !== 'Projects' || parts[1] !== project || parts.length < 3) {
      throw new Error(`Outputs must stay in Projects/${project}/; Raw and Reference are read-only: ${value}`);
    }
  }
  let cursor = ROOT;
  let last = null;
  for (let i = 0; i < parts.length; i++) {
    cursor = path.join(cursor, parts[i]);
    const stat = await fs.lstat(cursor).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Symlinks and junctions are not accepted in job paths: ${value}`);
    if (stat && i < parts.length - 1 && !stat.isDirectory()) throw new Error(`Path parent is not a directory: ${value}`);
    if (i === parts.length - 1) last = stat;
  }
  if (mustExist && !last) throw new Error(`Required input is missing: ${value}`);
  if (last && file && !last.isFile()) throw new Error(`Expected a regular file: ${value}`);
  if (write && last && last.nlink !== 1) throw new Error(`Refusing to write a hardlinked file: ${value}`);
  return path.join(ROOT, ...parts);
}

export async function ensureOutput(value, options) {
  let absolute = await checkedPath(value, { ...options, write: true });
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  absolute = await checkedPath(value, { ...options, write: true });
  return absolute;
}

export async function readJson(value, { optional = false, internal = false } = {}) {
  const absolute = await checkedPath(value, { internal });
  let data;
  try {
    const stat = await fs.stat(absolute);
    if (stat.size > 8 * 1024 * 1024) throw new Error(`JSON file is too large: ${value}`);
    data = await fs.readFile(absolute, 'utf8');
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  }
  try { return JSON.parse(data); } catch { throw new Error(`Invalid JSON: ${value}`); }
}

export async function atomicJson(value, data, options) {
  const contents = `${JSON.stringify(data, null, 2)}\n`;
  if (Buffer.byteLength(contents, 'utf8') > 8 * 1024 * 1024) throw new Error(`JSON would exceed the 8 MiB read limit: ${value}`);
  const absolute = await ensureOutput(value, options);
  const temporary = `${value}.${randomUUID()}.tmp`;
  const tempAbsolute = await checkedPath(temporary, { ...options, write: true });
  let handle;
  try {
    handle = await fs.open(tempAbsolute, 'wx');
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await checkedPath(value, { ...options, write: true });
    await fs.rename(tempAbsolute, absolute);
  } finally {
    await handle?.close();
    await fs.unlink(tempAbsolute).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function withFileLock(value, options, operation) {
  const absolute = await ensureOutput(value, options);
  const token = randomUUID();
  let handle;
  try { handle = await fs.open(absolute, 'wx'); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await readJson(value, { internal: options?.internal }).catch(() => null);
    throw new Error(`Project lock is already held: ${value} (PID ${owner?.pid ?? 'unknown'}). Wait for its owner. Forced termination leaves the lock for manual inspection; it is never taken over automatically.`);
  }
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token, createdAt: new Date().toISOString() }));
    await handle.sync();
    await handle.close();
    handle = null;
    return await operation();
  } finally {
    await handle?.close();
    const owner = await readJson(value, { internal: options?.internal }).catch(() => null);
    if (owner?.token === token) await fs.unlink(absolute);
  }
}

export async function fileSnapshot(value, { internal = false, nonempty = true, withMetadata = false } = {}) {
  const absolute = await checkedPath(value, { internal, mustExist: true });
  const handle = await fs.open(absolute, 'r');
  try {
    const before = await handle.stat();
    if (nonempty && !before.size) throw new Error(`Empty file cannot satisfy a stage: ${value}`);
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error(`File changed while being hashed: ${value}`);
    }
    return { path: value, size: after.size, sha256: hash.digest('hex'), ...(withMetadata ? { modifiedMs: after.mtimeMs } : {}) };
  } finally { await handle.close(); }
}








export async function externalFileSnapshot(absolute) {
  if (typeof absolute !== 'string' || !path.isAbsolute(absolute)) {
    throw new Error(`externalFileSnapshot needs an absolute path: ${String(absolute)}`);
  }
  const handle = await fs.open(absolute, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`External path is not a regular file: ${absolute}`);
    if (!before.size) throw new Error(`External file is empty: ${absolute}`);
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error(`External file changed while being hashed: ${absolute}`);
    }
    return { path: absolute.split(path.sep).join('/'), external: true, sha256: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = (value) => createHash('sha256').update(stableJson(value)).digest('hex');

export function object(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
  return value;
}
export function finite(value, min, max, label, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}

export function cliArgs(argv, allowed, flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { out._.push(token); continue; }
    const key = token.slice(2);
    if (!allowed.includes(key) || Object.hasOwn(out, key)) throw new Error(`Unknown or repeated option: ${token}`);
    if (flags.includes(key)) { out[key] = true; continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    out[key] = value;
  }
  return out;
}
