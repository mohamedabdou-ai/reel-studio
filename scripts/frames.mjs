import path from 'node:path';
import { promises as fs } from 'node:fs';
import { run, parseArgs, cacheDirFor, writeJson, ffprobeJson, summarizeProbe, hms } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2), { height: '480' });
const file = args._[0];
if (!file) { console.error('Usage: node scripts/frames.mjs <file> --fps 1 | --at t1,t2,...'); process.exit(1); }

const probe = summarizeProbe(file, await ffprobeJson(file));
const outDir = args.out ? path.resolve(args.out) : path.join(await cacheDirFor(file, 'frames'), 'set');
await fs.mkdir(outDir, { recursive: true });
const H = Number(args.height);
const manifest = { file: probe.name, height: H, frames: [] };

if (args.at) {
  const times = String(args.at).split(',').map(Number).filter(t => !Number.isNaN(t));
  for (const t of times) {
    const name = `f-${t.toFixed(2).replace('.', '_')}s.jpg`;
    await run('ffmpeg', ['-hide_banner', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `scale=-2:${H}`, '-q:v', '3', path.join(outDir, name)]);
    manifest.frames.push({ t, tc: hms(t), path: path.join(outDir, name) });
  }
} else {
  const fps = Number(args.fps ?? 1);
  const start = Number(args.start ?? 0);
  const end = args.end != null ? Number(args.end) : probe.durationSec;
  const dur = Math.max(0, end - start);
  const seekArgs = start > 0 ? ['-ss', String(start)] : [];
  await run('ffmpeg', ['-hide_banner', '-y', ...seekArgs, '-i', file, '-t', String(dur), '-vf', `fps=${fps},scale=-2:${H}`, '-q:v', '3', path.join(outDir, 'f-%04d.jpg')]);
  const written = (await fs.readdir(outDir)).filter(f => /^f-\d+\.jpg$/.test(f)).sort();
  written.forEach((name, i) => {
    const t = +(start + i / fps).toFixed(3);
    manifest.frames.push({ t, tc: hms(t), path: path.join(outDir, name) });
  });
}

await writeJson(path.join(outDir, 'manifest.json'), manifest);
console.log(JSON.stringify({ outDir, count: manifest.frames.length, manifest: path.join(outDir, 'manifest.json') }, null, 2));
