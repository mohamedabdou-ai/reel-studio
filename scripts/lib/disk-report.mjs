import fs from 'node:fs';
import path from 'node:path';
import { pidAlive } from './render-hygiene.mjs';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
export const SAFE_AGE_MS = 45 * 60 * 1000;
export const SCRATCH_AGE_MS = 30 * 60 * 1000;
export const FAT_BUNDLE_BYTES = 500 * MB;

const statBig = (p) => {
  try {
    return fs.lstatSync(p, { bigint: true });
  } catch {
    return null;
  }
};


export function walkFiles(dir, visit) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walkFiles(p, visit);
    else {
      const st = statBig(p);
      if (st) visit(p, st);
    }
  }
}


const fileKey = (st) => `${st.dev}:${st.ino}`;


export function inodeSet(dir) {
  const set = new Set();
  walkFiles(dir, (_p, st) => set.add(fileKey(st)));
  return set;
}





export function measureDir(dir, shared = new Set(), { owner = false } = {}) {
  const seen = new Set();
  let apparent = 0;
  let unique = 0;
  walkFiles(dir, (_p, st) => {
    const size = Number(st.size);
    apparent += size;
    const key = fileKey(st);
    if (shared.has(key) || seen.has(key)) return;
    seen.add(key);


    if (!owner && st.nlink > 1n) return;
    unique += size;
  });
  return { apparent, unique };
}


export function renderBudget({ frames, freeRamBytes, freeDiskBytes, width = 1080, height = 1920, png = true }) {
  const megapixels = (width * height) / 1e6;
  const needRam = (megapixels + 2) * GB;
  const spills = freeRamBytes < needRam;
  const frameBytes = png ? 2.8 * MB : 0.6 * MB;
  const spillBytes = spills ? Math.round(frames * frameBytes) : 0;
  const needDisk = spillBytes + 2 * GB;
  const ok = freeDiskBytes >= needDisk;
  const gb = (n) => (n / GB).toFixed(1);
  const message = spills
    ? `RAM: ${gb(freeRamBytes)} GB free < ${gb(needRam)} GB needed to stream frames, so ~${gb(spillBytes)} GB of frames will be written to disk first; ${gb(freeDiskBytes)} GB free on D: ${ok ? 'is enough' : 'is NOT enough'}.`
    : `RAM: ${gb(freeRamBytes)} GB free: frames stream straight to the encoder (no disk spill). ${gb(freeDiskBytes)} GB free on D:.`;
  return { ok, spills, needRamBytes: needRam, spillBytes, needDiskBytes: needDisk, message };
}


export function freeBytes(dir) {
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}






export function cleanPlan({ root, now = Date.now(), alive = pidAlive, fatBytes = FAT_BUNDLE_BYTES }) {
  const plan = [];
  const add = (p, bytes, reason) => plan.push({ path: p, bytes, reason });
  const publicInodes = inodeSet(path.join(root, 'engine', 'public'));

  const bundleRoot = path.join(root, 'state', 'cache', 'bundle');
  let bundles = [];
  try {
    bundles = fs.readdirSync(bundleRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {

  }
  for (const d of bundles) {
    const p = path.join(bundleRoot, d.name);
    if (/\.tmp-\d+$/.test(d.name)) continue;
    const age = now - fs.statSync(p).mtimeMs;
    if (age < SAFE_AGE_MS) continue;
    const { unique } = measureDir(p, publicInodes);
    if (unique >= fatBytes) add(p, unique, 'copy bundle (pre hard-link): regenerates in seconds and now costs ~30 MB');
  }

  const tmp = path.join(root, 'state', 'tmp');
  let names = [];
  try {
    names = fs.readdirSync(tmp);
  } catch {

  }
  for (const name of names) {
    const p = path.join(tmp, name);
    const m = /^p(\d+)$/.exec(name);
    if (m) {
      if (!alive(Number(m[1]))) add(p, measureDir(p).apparent, `temp folder of dead process ${m[1]}`);
      continue;
    }
    if (/^(remotion-v[\d.]+-assets|react-motion-render)/.test(name) && now - fs.statSync(p).mtimeMs > SCRATCH_AGE_MS) {
      add(p, measureDir(p).apparent, 'orphaned Remotion scratch (plate copy / frame buffer)');
    }
  }
  return plan;
}


export function scanUsage({ root }) {
  const publicDir = path.join(root, 'engine', 'public');
  const publicInodes = inodeSet(publicDir);
  const rows = [];
  const push = (label, dir, note = '', shared, opts) => {
    if (!fs.existsSync(dir)) return;
    const m = measureDir(dir, shared, opts);
    rows.push({ label, path: path.relative(root, dir).replace(/\\/g, '/'), apparent: m.apparent, real: m.unique, note });
  };
  push('engine/public (plates, all videos)', publicDir, 'kept for good; the biggest single item', undefined, { owner: true });
  const bundleRoot = path.join(root, 'state', 'cache', 'bundle');
  if (fs.existsSync(bundleRoot)) {
    for (const d of fs.readdirSync(bundleRoot, { withFileTypes: true })) if (d.isDirectory()) push(`bundle ${d.name}`, path.join(bundleRoot, d.name), 'cache', publicInodes);
  }
  for (const sub of ['rvm', 'matte', 'reframe', 'head', 'downloads', 'audio', 'transcript-chunks']) push(`cache/${sub}`, path.join(root, 'state', 'cache', sub), 'analysis cache: costly to regenerate, never auto-deleted');
  push('state/tmp', path.join(root, 'state', 'tmp'), 'scratch');
  for (const dir of ['Projects', 'Outputs', 'Raw', 'Reference', 'Tools']) push(dir, path.join(root, dir), 'work products / tools: never auto-deleted');
  rows.sort((a, b) => b.real - a.real);
  return rows;
}

export const fmt = (bytes) => (bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${(bytes / MB).toFixed(0)} MB`);
