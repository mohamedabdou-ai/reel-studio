import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_TMP } from './project-tmp.mjs';

const rmQuiet = (p) => {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return true;
  } catch {
    return false;
  }
};


export const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
};

const PROCESS_DIR = /^p(\d+)$/;
const SCRATCH = /^(remotion-v[\d.]+-assets|react-motion-render)/;


export function sweepDeadProcessTemps(root = PROJECT_TMP, alive = pidAlive) {
  const removed = [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return removed;
  }
  for (const name of names) {
    const m = PROCESS_DIR.exec(name);
    if (!m || alive(Number(m[1]))) continue;
    if (rmQuiet(path.join(root, name))) removed.push(name);
  }
  return removed;
}


export function sweepRenderScratch(dir) {
  const removed = [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return removed;
  }
  for (const name of names) if (SCRATCH.test(name) && rmQuiet(path.join(dir, name))) removed.push(name);
  return removed;
}

export const processTempDir = (pid = process.pid, root = PROJECT_TMP) => path.join(root, `p${pid}`);

let installed = null;


export function useProcessTemp() {
  if (installed) return installed;
  const dir = processTempDir();
  fs.mkdirSync(dir, { recursive: true });
  process.env.TEMP = dir;
  process.env.TMP = dir;
  process.env.TMPDIR = dir;
  sweepDeadProcessTemps();
  process.on('exit', () => rmQuiet(dir));

  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));
  installed = dir;
  return dir;
}






export function hygienicRenderer(renderer, dir = () => process.env.TEMP) {
  let inflight = 0;
  const wrap = (fn) => async (...args) => {
    inflight++;
    try {
      return await fn(...args);
    } finally {
      inflight--;
      if (inflight === 0) sweepRenderScratch(dir());
    }
  };
  const wrapped = new Map();
  return new Proxy(renderer, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if ((key === 'renderStill' || key === 'renderMedia') && typeof value === 'function') {
        if (!wrapped.has(key)) wrapped.set(key, wrap(value));
        return wrapped.get(key);
      }
      return value;
    },
  });
}
