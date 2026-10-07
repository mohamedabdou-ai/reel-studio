import path from 'node:path';
import { promises as fs } from 'node:fs';
import './lib/project-tmp.mjs';
import { parseArgs, run, ROOT } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const comp = args._[0];
if (!comp) {
  console.error('Usage: node scripts/iterate.mjs <CompositionId> [--at 2.9,17,43] [--out dir] [--frames a-b] [--no-render] [--zoom x,y,w,h]');
  process.exit(1);
}

const ats = String(args.at ?? '2.9,8.8,17,27.5,43,53').split(',').map(Number).filter((n) => Number.isFinite(n));
const outDir = path.resolve(ROOT, args.out ?? path.join('state', 'cache', 'work', 'iterate', comp));
const cols = Math.max(1, Number(args.cols ?? 3));
await fs.mkdir(outDir, { recursive: true });

const mp4 = path.join(outDir, `${comp}-preview.mp4`);
const t0 = Date.now();

if (!args['no-render']) {
  const rargs = [path.join(ROOT, 'scripts', 'render.mjs'), comp, '--preview', '--out', mp4];
  if (args.frames) rargs.push('--frames', String(args.frames));
  const r = await run(process.execPath, rargs, { allowFail: true });
  if (!r.ok) {


    console.error(String(r.buf ?? '').split('\n').slice(-12).join('\n'));
    process.exit(1);
  }
}

try {
  await fs.access(mp4);
} catch {
  console.error(`no render at ${mp4} — drop --no-render`);
  process.exit(1);
}


const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { allowFail: true });
const clipSec = probe.ok ? Number(String(probe.stdout).trim()) : 0;
const past = ats.filter((t) => clipSec > 0 && t >= clipSec);
if (past.length) {
  console.error(`warning: ${past.join(', ')} s ${past.length > 1 ? 'are' : 'is'} past the end of a ${clipSec.toFixed(2)} s clip` +
    (args.frames ? ' — with --frames, --at is relative to the rendered RANGE' : ''));
}

const shots = [];
for (const t of ats) {
  const png = path.join(outDir, `t${String(t).replace('.', '_')}.png`);






  const r = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', png], { allowFail: true });
  const wrote = await fs.stat(png).then((st) => st.size > 0).catch(() => false);
  if (r.ok && wrote) shots.push({ t, png });
  else console.error(
    `sample ${t}s produced no frame` +
      (clipSec ? ` — the clip is ${clipSec.toFixed(2)} s long, so ${t} s is past its end` +
        (args.frames ? ` (--frames makes timestamps relative to the RANGE, not the composition)` : '') : '') +
      ((r.stderr || '').trim() ? `: ${(r.stderr || '').trim().slice(-200)}` : ''),
  );
}
if (!shots.length) {
  console.error('no frames sampled');
  process.exit(1);
}



const sheet = path.join(outDir, 'sheet.png');
const inputs = shots.flatMap((s) => ['-i', s.png]);
const labelled = shots
  .map((s, i) => `[${i}:v]drawtext=text=${s.t}s:x=12:y=12:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8[l${i}]`)
  .join(';');
const rows = [];
for (let i = 0; i < shots.length; i += cols) {
  const row = shots.slice(i, i + cols).map((_, j) => `[l${i + j}]`).join('');
  const n = Math.min(cols, shots.length - i);
  rows.push(n > 1 ? `${row}hstack=inputs=${n}[r${rows.length}]` : `${row}null[r${rows.length}]`);
}
const stackRows = rows.length > 1
  ? `${rows.map((_, i) => `[r${i}]`).join('')}vstack=inputs=${rows.length}[out]`
  : `[r0]null[out]`;
const chain = `${labelled};${rows.join(';')};${stackRows}`;
const rs = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', chain, '-map', '[out]', sheet], { allowFail: true });
if (!rs.ok) console.error((rs.stderr || '').slice(-800));

let zoomSheet = null;
if (args.zoom) {
  const [zx, zy, zw, zh] = String(args.zoom).split(',').map(Number);
  const zin = [];
  const zlab = [];
  for (const [i, s] of shots.entries()) {
    zin.push('-i', s.png);
    zlab.push(`[${i}:v]crop=${zw}:${zh}:${zx}:${zy},scale=iw*2:-1:flags=neighbor,drawtext=text=${s.t}s:x=8:y=8:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=6[z${i}]`);
  }
  zoomSheet = path.join(outDir, 'zoom.png');
  const zchain = `${zlab.join(';')};${shots.map((_, i) => `[z${i}]`).join('')}hstack=inputs=${shots.length}[out]`;
  const zr = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...zin, '-filter_complex', zchain, '-map', '[out]', zoomSheet], { allowFail: true });
  if (!zr.ok) { console.error((zr.stderr || '').slice(-600)); zoomSheet = null; }
}

console.log(JSON.stringify({
  ok: true,
  comp,
  mp4,
  sheet,
  zoom: zoomSheet,
  shots: shots.map((s) => ({ t: s.t, png: s.png })),
  elapsedSec: Math.round((Date.now() - t0) / 100) / 10,
}, null, 2));
