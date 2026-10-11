import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {browserHomeProblem} from './studio-setup.mjs';
import {sha256File} from './studio-download.mjs';

const inside = (root, file) => {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const at = (root, relative) => {
  const file = path.resolve(root, relative);
  if (!inside(root, file)) throw new Error(`Path outside the snapshot: ${relative}`);
  return file;
};

export async function assertFreshTarget(root, {nodePath = process.env.NODE_PATH} = {}) {
  if (nodePath?.trim()) throw new Error('Unset NODE_PATH for the clean installation test.');
  if (await fs.lstat(root).catch(() => null)) throw new Error(`The clean-install destination already exists: ${root}`);
  const location = browserHomeProblem(root);
  if (location) throw new Error(location);
}

export async function snapshotWorktree(source, target, files) {
  const names = [...new Set(files)].sort();
  for (const name of names) {
    const normalized = name.replaceAll('\\', '/');
    if (path.isAbsolute(name) || path.win32.isAbsolute(name) || normalized.split('/').some(part => part === '.' || part === '..')) throw new Error(`Not part of a public source snapshot: ${name}`);
    at(source, name);
    if (/^(?:Raw|Reference|Projects|Outputs|Tools|state)\//i.test(normalized) || /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/i.test(normalized)
      || /(?:^|\/)PROFILE\.json$/i.test(normalized) || /(?:^|\/)\.env(?:\.|$)/i.test(normalized)) throw new Error(`Not part of a public source snapshot: ${name}`);
  }
  await assertFreshTarget(target);
  const manifest = [];
  for (const name of names) {
    const from = at(source, name), to = at(target, name);
    if (!(await fs.lstat(from)).isFile()) throw new Error(`The source snapshot must contain regular files: ${name}`);
    const bytes = await fs.readFile(from);
    await fs.mkdir(path.dirname(to), {recursive: true});
    await fs.writeFile(to, bytes);
    manifest.push({path: name, sha256: hash(bytes), bytes: bytes.length});
  }
  return manifest;
}

export async function verifySnapshot(source, target, manifest) {
  for (const file of manifest) {
    const [from, to] = await Promise.all([sha256File(at(source, file.path)), sha256File(at(target, file.path))]);
    if (from !== file.sha256 || to !== file.sha256) throw new Error(`Candidate changed while copying the snapshot: ${file.path}`);
  }
}

export async function assertNoLinks(root) {
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink()) throw new Error(`A clean installation cannot contain a symlink or junction: ${root}`);
  if (stat.isDirectory()) for (const entry of await fs.readdir(root)) await assertNoLinks(path.join(root, entry));
}

async function copyVerified(from, to, sha256) {
  if (await sha256File(from) !== sha256) return false;
  await fs.mkdir(path.dirname(to), {recursive: true});
  await fs.copyFile(from, to);
  if (await sha256File(to) !== sha256) throw new Error(`Cached artifact changed while copying: ${to}`);
  return true;
}

export async function seedPinnedArtifacts(cacheRoot, target, lock) {
  const copied = [];
  for (const font of lock.fonts) {
    const relative = `engine/public/fonts/${font.file}`;
    if (await copyVerified(at(cacheRoot, relative), at(target, relative), font.sha256)) copied.push(relative);
  }
  for (const model of lock.models) if (await copyVerified(at(cacheRoot, model.path), at(target, model.path), model.sha256)) copied.push(model.path);
  const archive = `ffmpeg-${lock.ffmpeg.version}-full_build.7z`;
  for (const folder of ['state/cache/downloads', 'state/qa/downloads']) {
    if (await copyVerified(at(cacheRoot, `${folder}/${archive}`), at(target, `state/cache/downloads/${archive}`), lock.ffmpeg.sha256)) {
      copied.push(`state/cache/downloads/${archive}`); break;
    }
  }
  const npmCache = at(cacheRoot, 'state/cache/npm/_cacache');
  if (await fs.stat(npmCache).catch(() => null)) {
    await assertNoLinks(npmCache);
    await fs.cp(npmCache, at(target, 'state/cache/npm/_cacache'), {recursive: true});
    copied.push('npm content cache (integrity checked by npm ci)');
  }
  // Only the render-browser binary tree may be copied from node_modules.
  // The destination is .remotion/, so npm ci cannot remove the cached browser.
  for (const home of ['.remotion', 'engine/node_modules/.remotion']) {
    if (await sha256File(at(cacheRoot, `${home}/${lock.browser.exe}`)) !== lock.browser.exeSha256) continue;
    const from = at(cacheRoot, `${home}/chrome-headless-shell`), to = at(target, '.remotion/chrome-headless-shell');
    await assertNoLinks(from);
    await fs.cp(from, to, {recursive: true});
    if (await sha256File(at(target, `.remotion/${lock.browser.exe}`)) !== lock.browser.exeSha256) throw new Error('Cached render browser changed while copying.');
    copied.push('pinned render browser'); break;
  }
  return copied;
}

export function installEnvironment(root) {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (['NODE_PATH', 'NODE_OPTIONS', 'NODE_COMPILE_CACHE'].includes(key.toUpperCase())) delete env[key];
  const tmp = path.join(root, 'state', 'tmp');
  return {...env, TEMP: tmp, TMP: tmp, TMPDIR: tmp, npm_config_cache: path.join(root, 'state', 'cache', 'npm'),
    NODE_COMPILE_CACHE: path.join(root, 'state', 'cache', 'node-compile'), GIT_TERMINAL_PROMPT: '0'};
}
