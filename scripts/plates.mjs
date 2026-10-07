import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ROOT, parseArgs, run, writeJson, readCachedJson } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? 'check';
const PUBLIC = path.join(ROOT, 'engine', 'public');
const MANIFEST = path.join(ROOT, 'engine', 'plates.json');
const VIDEO = new Set(['.mp4', '.mov', '.webm', '.mkv']);

async function probePlate(file) {


  const { stdout, stderr, ok } = await run('ffprobe', [
    '-v', 'error', '-count_packets', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_packets,pix_fmt,color_transfer:format=duration,size',
    '-of', 'json', file,
  ], { allowFail: true });
  const j = JSON.parse(stdout || '{}');
  const s = j.streams?.[0] ?? {};
  const [n, d] = (s.r_frame_rate || '0/1').split('/').map(Number);
  return {
    name: path.relative(PUBLIC, file).split(path.sep).join('/'),
    codec: s.codec_name ?? null,
    width: s.width ?? null,
    height: s.height ?? null,
    fps: d ? +(n / d).toFixed(3) : null,
    frames: Number(s.nb_read_packets ?? 0),
    pixFmt: s.pix_fmt ?? null,
    transfer: s.color_transfer ?? null,
    durationSec: j.format?.duration ? +Number(j.format.duration).toFixed(3) : null,
    bytes: Number(j.format?.size ?? 0),
    truncated: !ok || !Number(s.nb_read_packets) || /ended prematurely|Invalid data|error/i.test(stderr || ''),
    probeNote: (stderr || '').trim().split('\n').filter(Boolean).slice(-1)[0] ?? '',
  };
}

async function listVideos(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listVideos(file));
    else if (entry.isFile() && VIDEO.has(path.extname(file).toLowerCase())) files.push(path.relative(PUBLIC, file).split(path.sep).join('/'));
  }
  return files;
}
const requested = args.only ? new Set(String(args.only).split(',').map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean)) : null;
const files = (await listVideos(PUBLIC)).filter((file) => !requested || requested.has(file)).sort();
const plates = [];
for (const f of files) plates.push(await probePlate(path.join(PUBLIC, f)));

if (cmd === 'record') {
  const broken = plates.filter((p) => p.truncated || !p.frames);
  if (broken.length) {
    console.error('Refusing to record a manifest with unreadable / truncated plates:\n' + broken.map((p) => `  ${p.name}: ${p.probeNote || 'no frames'}`).join('\n'));
    process.exit(3);
  }
  if (requested && [...requested].some((name) => !files.includes(name))) throw new Error('Cannot record a missing declared plate');
  const existing = requested ? ((await readCachedJson(MANIFEST))?.plates ?? {}) : {};
  await writeJson(MANIFEST, { recordedOn: new Date().toISOString().slice(0, 10), plates: { ...existing, ...Object.fromEntries(plates.map((p) => [p.name, { frames: p.frames, fps: p.fps, width: p.width, height: p.height, bytes: p.bytes }])) } });
  console.log(JSON.stringify({ ok: true, recorded: plates.length, manifest: MANIFEST }, null, 2));
  process.exit(0);
}

const manifest = (await readCachedJson(MANIFEST))?.plates ?? {};
const compFps = args.fps ? Number(args.fps) : null;
const only = args.only ? new Set(String(args.only).split(',').map((s) => s.trim()).filter(Boolean)) : null;
const problems = [];
for (const name of only ?? []) {
  if (!plates.some((p) => p.name === name)) problems.push({ plate: name, problem: 'declared by the composition but missing from engine/public' });
}
for (const p of plates) {
  const rec = manifest[p.name];













  const used = only ? only.has(p.name) : true;
  const soft = !used;
  if (p.truncated) problems.push({ plate: p.name, problem: `truncated / unreadable: ${p.probeNote}`, warn: soft });
  if (rec && rec.frames !== p.frames) problems.push({ plate: p.name, problem: `frame count ${p.frames} != recorded ${rec.frames}`, warn: soft });
  if (rec && rec.bytes !== p.bytes) problems.push({ plate: p.name, problem: `size ${p.bytes} != recorded ${rec.bytes}`, warn: soft });
  if (p.transfer && /arib-std-b67|smpte2084/.test(p.transfer)) problems.push({ plate: p.name, problem: `HDR transfer ${p.transfer} — tone-map to bt709 before use`, warn: soft });
  if (compFps && p.fps) {
    const ratio = p.fps / compFps;
    if (Math.abs(ratio - Math.round(ratio)) > 0.01) {
      problems.push({ plate: p.name, problem: `plate ${p.fps} fps / composition ${compFps} fps = ${ratio.toFixed(3)} — irregular cadence (judder)`, warn: soft });
    }
  }
  if (!rec) problems.push({ plate: p.name, problem: 'not in engine/plates.json — run `node scripts/plates.mjs record` after verifying it', warn: true });
}
const hard = problems.filter((p) => !p.warn);
console.log(JSON.stringify({ ok: hard.length === 0, plates, problems }, null, 2));
process.exit(hard.length ? 3 : 0);
