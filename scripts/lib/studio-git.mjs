import {spawnSync} from 'node:child_process';
import {existsSync, promises as fs} from 'node:fs';
import path from 'node:path';

const GIT_ENV = {...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never'};

export const STORE_MARKER = 'STORE-EDITION.json';
export const isStoreEdition = (root) => existsSync(path.join(root, STORE_MARKER));

export function resolveGit(root) {
  for (const candidate of ['git', path.join(root, 'Tools', 'git', 'cmd', 'git.exe')]) {
    if (spawnSync(candidate, ['--version'], {stdio: 'ignore', windowsHide: true}).status === 0) return candidate;
  }
  return null;
}

function git(gitExe, root, args, timeout = 120000) {
  const result = spawnSync(gitExe, ['-C', root, ...args], {encoding: 'utf8', windowsHide: true, timeout, env: GIT_ENV});
  return {ok: result.status === 0, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() || result.error?.message || ''};
}

const editionOf = (text) => {
  try {
    return JSON.parse(text).edition ?? null;
  } catch {
    return null;
  }
};

function isOwnClone(gitExe, root) {
  const top = git(gitExe, root, ['rev-parse', '--show-toplevel']);
  return top.ok && path.resolve(top.stdout).toLowerCase() === path.resolve(root).toLowerCase();
}

export async function checkForUpdate(root, {gitExe}) {
  if (isStoreEdition(root)) return {ok: true, channel: 'store', updateAvailable: null, current: editionOf(await fs.readFile(path.join(root, 'versions.lock.json'), 'utf8'))};
  if (!gitExe) return {ok: false, reason: 'no-git'};
  if (!isOwnClone(gitExe, root)) return {ok: false, reason: 'not-a-clone'};
  const current = editionOf(await fs.readFile(path.join(root, 'versions.lock.json'), 'utf8'));
  const fetched = git(gitExe, root, ['fetch', '--quiet', 'origin', 'main'], 60000);
  if (!fetched.ok) return {ok: true, updateAvailable: null, reason: 'offline', current, detail: fetched.stderr};
  const behind = Number(git(gitExe, root, ['rev-list', '--count', 'HEAD..origin/main']).stdout || 0);
  const latest = editionOf(git(gitExe, root, ['show', 'origin/main:versions.lock.json']).stdout);
  return {ok: true, updateAvailable: behind > 0, behind, current, latest};
}


export function toolPins(lockText) {
  try {
    const {edition, engine, notices, ...tools} = JSON.parse(lockText);
    return JSON.stringify(tools);
  } catch {
    return lockText;
  }
}

export function pullUpdate(root, {gitExe}) {
  if (isStoreEdition(root)) return {ok: true, channel: 'store', updated: false, changed: {packages: false, tools: false}};
  if (!gitExe) return {ok: false, reason: 'no-git'};
  const dirty = git(gitExe, root, ['status', '--porcelain', '--untracked-files=no']).stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  if (dirty.length) return {ok: false, reason: 'local-changes', dirty};
  const blob = (file) => git(gitExe, root, ['rev-parse', `HEAD:${file}`]).stdout;
  const pins = () => toolPins(git(gitExe, root, ['show', 'HEAD:versions.lock.json']).stdout);
  const from = git(gitExe, root, ['rev-parse', 'HEAD']).stdout;
  const before = {packages: blob('engine/package-lock.json'), tools: pins()};
  const pulled = git(gitExe, root, ['pull', '--ff-only', '--quiet', 'origin', 'main'], 300000);
  if (!pulled.ok) return {ok: false, reason: 'pull-failed', detail: pulled.stderr};
  const to = git(gitExe, root, ['rev-parse', 'HEAD']).stdout;
  return {ok: true, updated: from !== to, from, to, changed: {packages: before.packages !== blob('engine/package-lock.json'), tools: before.tools !== pins()}};
}
