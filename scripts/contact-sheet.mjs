import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import './lib/project-tmp.mjs';
import { run, parseArgs, cacheDirFor, writeJson, ffprobeJson, summarizeProbe, hms } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2), { cols: '6', rows: '5', height: '240' });
const file = args._[0];
if (!file) { console.error('Usage: node scripts/contact-sheet.mjs <file>'); process.exit(1); }

const cols = Number(args.cols), rows = Number(args.rows), H = Number(args.height);
const N = cols * rows;
const probe = summarizeProbe(file, await ffprobeJson(file));
const dur = probe.durationSec;
const cacheDir = await cacheDirFor(file, 'contact-sheet');
const outPath = args.out ? path.resolve(args.out) : path.join(cacheDir, `sheet-${cols}x${rows}.jpg`);
const sidecarPath = outPath.replace(/\.jpg$/, '.json');

const existing = await fs.stat(outPath).catch(() => null);
if (existing) {
  console.log(JSON.stringify({ sheet: outPath, sidecar: sidecarPath, cached: true }, null, 2));
  process.exit(0);
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sheet-'));
const times = Array.from({ length: N }, (_, i) => +((i + 0.5) * dur / N).toFixed(3));

const fontCandidates = ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf'];
let font = null;
for (const f of fontCandidates) if (await fs.stat(f).catch(() => null)) { font = f; break; }

for (let i = 0; i < N; i++) {
  const t = times[i];
  const label = hms(t);
  let vf = `scale=-2:${H}`;
  if (font) {
    const ff = font.replace(':', '\\:');
    vf += `,drawtext=fontfile='${ff}':text='${label.replace(/:/g, '\\:')}':x=8:y=h-th-8:fontsize=${Math.round(H / 10)}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4`;
  }
  const res = await run('ffmpeg', ['-hide_banner', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', vf, '-q:v', '4', path.join(tmp, `s-${String(i).padStart(3, '0')}.jpg`)], { allowFail: true });
  if (!res.ok && font) {

    font = null; i--; continue;
  }
  if (!res.ok) throw new Error(`frame extract failed at ${t}s: ${res.stderr.slice(-500)}`);
}

await run('ffmpeg', ['-hide_banner', '-y', '-framerate', '1', '-i', path.join(tmp, 's-%03d.jpg'), '-frames:v', '1', '-vf', `tile=${cols}x${rows}`, '-q:v', '4', outPath]);
await fs.rm(tmp, { recursive: true, force: true });

const cells = times.map((t, i) => ({ cell: i + 1, row: Math.floor(i / cols) + 1, col: (i % cols) + 1, t, tc: hms(t) }));
await writeJson(sidecarPath, { file: probe.name, durationSec: dur, cols, rows, burnedTimecodes: !!font, cells });
console.log(JSON.stringify({ sheet: outPath, sidecar: sidecarPath, burnedTimecodes: !!font }, null, 2));
