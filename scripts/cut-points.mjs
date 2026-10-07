import { promises as fs } from 'node:fs';
import { parseArgs } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2), { radius: '0.25' });
const wavPath = args._[0];
if (!wavPath || !args.cuts) {
  console.error('Usage: node scripts/cut-points.mjs <16k-mono-wav> --cuts "9.04-10.24,..." [--radius 0.25]');
  process.exit(1);
}
const RADIUS = Number(args.radius);
const HOP = 0.01;
const WIN = 0.02;

const buf = await fs.readFile(wavPath);

let pos = 12, sampleRate = 16000, dataOff = -1, dataLen = 0;
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4);
  const size = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') sampleRate = buf.readUInt32LE(pos + 12);
  if (id === 'data') { dataOff = pos + 8; dataLen = size; break; }
  pos += 8 + size + (size % 2);
}
if (dataOff < 0) { console.error('no data chunk found'); process.exit(1); }

const samples = Math.min(dataLen / 2, (buf.length - dataOff) / 2) | 0;
const at = (i) => buf.readInt16LE(dataOff + i * 2) / 32768;

const hop = Math.round(HOP * sampleRate);
const win = Math.round(WIN * sampleRate);
const env = [];
for (let s = 0; s + win <= samples; s += hop) {
  let sum = 0;
  for (let i = s; i < s + win; i++) sum += at(i) * at(i);
  env.push(Math.sqrt(sum / win));
}
const db = (v) => (v <= 1e-9 ? -120 : 20 * Math.log10(v));
const idxOf = (t) => Math.max(0, Math.min(env.length - 1, Math.round(t / HOP)));

const snap = (t) => {
  const lo = idxOf(t - RADIUS);
  const hi = idxOf(t + RADIUS);
  let best = lo;
  for (let i = lo; i <= hi; i++) if (env[i] < env[best]) best = i;
  return { t: +(best * HOP).toFixed(3), rms: env[best], moved: +(best * HOP - t).toFixed(3) };
};

const cuts = String(args.cuts).split(',').map((pair) => {
  const [a, b] = pair.split('-').map(Number);
  return { a, b };
});

const out = [];
console.log('proposed → snapped   (dB at snapped point, shift in ms)');
for (const { a, b } of cuts) {
  const sa = snap(a);
  const sb = snap(b);
  console.log(
    `${a.toFixed(2)}–${b.toFixed(2)}  →  ${sa.t.toFixed(2)}–${sb.t.toFixed(2)}   ` +
    `[${db(sa.rms).toFixed(1)} dB, ${(sa.moved * 1000).toFixed(0)} ms] ` +
    `[${db(sb.rms).toFixed(1)} dB, ${(sb.moved * 1000).toFixed(0)} ms]  ` +
    `len ${(sb.t - sa.t).toFixed(2)}s`,
  );
  out.push({ from: sa.t, to: sb.t, fromDb: +db(sa.rms).toFixed(1), toDb: +db(sb.rms).toFixed(1) });
}
console.log('\nJSON:');
console.log(JSON.stringify(out));
