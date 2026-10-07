import './project-tmp.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ROOT } from './project-paths.mjs';

const pExecFile = promisify(execFile);
export { ROOT };
export const CACHE_DIR = path.join(ROOT, 'state', 'cache');

export async function run(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await pExecFile(cmd, args, {
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
      ...opts,
    });
    return { stdout, stderr, ok: true };
  } catch (err) {
    if (opts.allowFail) return { stdout: err.stdout ?? '', stderr: err.stderr ?? String(err), ok: false };
    err.message = `${cmd} ${args.join(' ')}\n${err.stderr ?? ''}\n${err.message}`;
    throw err;
  }
}

export async function ffprobeJson(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', file,
  ]);
  return JSON.parse(stdout);
}

export function summarizeProbe(file, probe) {
  const v = (probe.streams || []).find(s => s.codec_type === 'video');
  const a = (probe.streams || []).find(s => s.codec_type === 'audio');
  const fmt = probe.format || {};
  const fps = v?.avg_frame_rate && v.avg_frame_rate !== '0/0'
    ? (() => { const [n, d] = v.avg_frame_rate.split('/').map(Number); return d ? +(n / d).toFixed(3) : null; })()
    : null;
  const rotation = v?.side_data_list?.find(s => s.rotation != null)?.rotation ?? 0;
  const w = v?.width, h = v?.height;
  const [dw, dh] = Math.abs(rotation) % 180 === 90 ? [h, w] : [w, h];
  return {
    file: path.resolve(file),
    name: path.basename(file),
    sizeBytes: Number(fmt.size ?? 0),
    durationSec: fmt.duration ? +Number(fmt.duration).toFixed(3) : null,
    width: dw ?? null,
    height: dh ?? null,
    aspect: dw && dh ? +(dw / dh).toFixed(4) : null,
    fps,
    rotation,
    vcodec: v?.codec_name ?? null,
    pixFmt: v?.pix_fmt ?? null,
    acodec: a?.codec_name ?? null,
    audioChannels: a?.channels ?? null,
    audioSampleRate: a ? Number(a.sample_rate) : null,
    bitrate: fmt.bit_rate ? Number(fmt.bit_rate) : null,
    hasVideo: !!v,
    hasAudio: !!a,
  };
}


export async function fileKey(file) {
  const stat = await fs.stat(file);
  const fh = await fs.open(file, 'r');
  try {
    const head = Buffer.alloc(Math.min(1 << 20, stat.size));
    await fh.read(head, 0, head.length, 0);
    const tail = Buffer.alloc(Math.min(1 << 20, stat.size));
    await fh.read(tail, 0, tail.length, Math.max(0, stat.size - tail.length));
    return createHash('sha1').update(String(stat.size)).update(head).update(tail).digest('hex').slice(0, 16);
  } finally {
    await fh.close();
  }
}

export async function cacheDirFor(file, kind) {
  const key = await fileKey(file);
  const dir = path.join(CACHE_DIR, kind, `${path.parse(file).name}-${key}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function readCachedJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

export async function writeJson(p, data) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export function parseArgs(argv, defaults = {}) {
  const args = { _: [], ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {

      const eq = a.indexOf('=');
      if (eq !== -1) { args[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

export function hms(sec) {
  if (sec == null) return null;
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
}
