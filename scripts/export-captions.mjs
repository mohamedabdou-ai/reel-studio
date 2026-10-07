import path from 'node:path';
import { promises as fs } from 'node:fs';
import { parseArgs } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2));
const src = args._[0];
if (!src) { console.error('Usage: node scripts/export-captions.mjs <captions.json> [--outdir dir]'); process.exit(1); }
const data = JSON.parse(await fs.readFile(src, 'utf8'));
const outDir = path.resolve(args.outdir ?? path.dirname(src));
await fs.mkdir(outDir, { recursive: true });
const base = path.basename(src, '.json');

const pad = (n, w = 2) => String(n).padStart(w, '0');
const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const assTime = (s) => {
  const cs = Math.round(s * 100);
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
};


const cues = [
  ...data.pills.map((p) => ({ from: p.from, to: p.to, text: p.text })),
  ...(data.cta ? [{ from: data.cta.from, to: data.cta.to, text: data.cta.lines.join('\n') }] : []),
].sort((a, b) => a.from - b.from);

const srt = cues
  .map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`)
  .join('\n');
await fs.writeFile(path.join(outDir, `${base}.srt`), '﻿' + srt, 'utf8');


const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Pill,Dubai,62,&H00FFFFFF,&H00000000,&HD91B1A19,-1,0,0,0,100,100,0,0,3,10,0,2,60,60,300,178
Style: Cta,Dubai,78,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,3,2,60,60,560,178

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues
  .map((c) => {
    const isCta = data.cta && c.from === data.cta.from;
    const text = c.text.replace(/\n/g, '\\N');
    return `Dialogue: 0,${assTime(c.from)},${assTime(c.to)},${isCta ? 'Cta' : 'Pill'},,0,0,0,,${text}`;
  })
  .join('\n')}
`;
await fs.writeFile(path.join(outDir, `${base}.ass`), '﻿' + ass, 'utf8');

console.log(JSON.stringify({ ok: true, cues: cues.length, srt: path.join(outDir, `${base}.srt`), ass: path.join(outDir, `${base}.ass`) }, null, 2));
