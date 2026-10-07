import './lib/project-tmp.mjs';
import path from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { run, parseArgs, cacheDirFor, ffprobeJson, writeJson, ROOT } from './lib/media.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';
import { withOutputTransaction } from './lib/delivery.mjs';
import { proxyGeometry } from './lib/proxy-geometry.mjs';

const args = parseArgs(process.argv.slice(2), { height: '540' });
if (!args._[0]) throw new Error('Usage: node scripts/proxy.mjs <file> [--height 540] [--out path.mp4] [--force]');
const file = path.resolve(args._[0]);
const height = Number(args.height);
if (!Number.isInteger(height) || height < 120 || height > 1080 || height % 2) throw new Error('--height must be an even integer from 120 to 1080');
const out = assertProjectOutput(args.out ?? path.join(await cacheDirFor(file, 'proxy'), `proxy-${height}p.mp4`));
if (out.toLowerCase() === file.toLowerCase() || path.extname(out).toLowerCase() !== '.mp4') throw new Error('Proxy must be a separate .mp4 output');
const sha256 = async (p) => { const hash = createHash('sha256'); for await (const chunk of createReadStream(p)) hash.update(chunk); return hash.digest('hex'); };
const sourceHash = await sha256(file);
const sourceProbe = await ffprobeJson(file);
const video = sourceProbe.streams?.find((s) => s.codec_type === 'video');
if (!video || video.tags?.alpha_mode === '1' || /yuva|rgba|bgra/.test(video.pix_fmt ?? '')) throw new Error('Proxy requires an opaque video source; alpha plates keep originals');
const geometry = proxyGeometry(video, height);
const [num, den] = (video.r_frame_rate ?? '0/1').split('/').map(Number);
const fps = num / den;
if (!(fps > 0 && fps <= 240)) throw new Error('Cannot determine source frame rate');
const sourceDurationSec = Number(video.duration ?? sourceProbe.format.duration);
if (!(sourceDurationSec > 0)) throw new Error('Cannot determine source duration');
const metaPath = assertProjectOutput(`${out}.proxy.json`);
const identity = async (p) => { const stat = await fs.stat(p); return { sizeInBytes: stat.size, lastModified: Math.floor(stat.mtimeMs) }; };
const previous = await fs.readFile(metaPath, 'utf8').then(JSON.parse).catch(() => null);
let cached = false;
let metadata;
if (!args.force && previous?.sourceHash === sourceHash && previous.height === height && previous.version === 1 && await fs.stat(out).catch(() => null)) {
  cached = previous.outputHash === await sha256(out);
  if (cached) metadata = previous;
}
if (!cached) {
  await withOutputTransaction(out, async (stage) => {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '4', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=${geometry.width}:${height},setsar=1`, '-r', String(fps), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
      '-threads', '4', '-g', String(Math.round(fps)), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', stage]);
    const probe = await ffprobeJson(stage);
    const pv = probe.streams?.find((s) => s.codec_type === 'video');
    const proxyDurationSec = Number(pv?.duration ?? probe.format?.duration);
    const [pn, pd] = (pv?.r_frame_rate ?? '0/1').split('/').map(Number);
    if (!pv || pv.width !== geometry.width || pv.height !== height || Math.abs(pn / pd - fps) > 0.01 || Math.abs(proxyDurationSec - sourceDurationSec) > 1 / fps + 0.01) throw new Error('Proxy timing or geometry does not match source');
    if (await sha256(file) !== sourceHash) throw new Error('Source changed while generating the proxy; retry after source preparation finishes');
    metadata = { version: 1, source: path.relative(ROOT, file).split(path.sep).join('/'), sourceHash, outputHash: await sha256(stage), height, fps, sourceDurationSec, proxyDurationSec, verified: true, sourceIdentity: await identity(file), proxyIdentity: await identity(stage) };
    await writeJson(`${stage}.proxy.json`, metadata);
  }, { sidecars: ['.proxy.json'] });
}
if (cached) {
  const lockPath = assertProjectOutput(`${out}.render.lock`);
  const lock = await fs.open(lockPath, 'wx').catch(() => { throw new Error('Proxy output is busy; retry this command'); });
  const temporary = assertProjectOutput(`${metaPath}.${process.pid}.tmp`);
  try {
    if (await sha256(out) !== metadata.outputHash || await sha256(file) !== sourceHash) throw new Error('Proxy or source changed during cache validation; retry');
    metadata = { ...metadata, sourceIdentity: await identity(file), proxyIdentity: await identity(out) };
    await writeJson(temporary, metadata);
    await fs.rename(temporary, metaPath);
  } finally {
    await fs.rm(temporary, { force: true });
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}
const publicRoot = path.join(ROOT, 'engine/public');
const publicRelative = (p) => { const rel = path.relative(publicRoot, p); return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : null; };
const source = publicRelative(file);
const proxy = publicRelative(out);
let registered = false;
if (source && proxy) {
  const registryPath = assertProjectOutput(path.join(ROOT, 'engine/proxies.json'));
  assertProjectOutput(`${registryPath}.lock`);
  const lock = await fs.open(`${registryPath}.lock`, 'wx').catch(() => { throw new Error('Proxy registry is busy; retry this command'); });
  try {
    const registry = await fs.readFile(registryPath, 'utf8').then(JSON.parse).catch(() => ({}));
    registry[source] = { proxy, ...metadata };
    const temporary = assertProjectOutput(`${registryPath}.${process.pid}.tmp`);
    await writeJson(temporary, registry);
    await fs.rename(temporary, registryPath);
    registered = true;
  } finally { await lock.close(); await fs.rm(`${registryPath}.lock`, { force: true }); }
}
console.log(JSON.stringify({ ok: true, proxy: out, cached, registered, metadata: metaPath, ...metadata }, null, 2));
