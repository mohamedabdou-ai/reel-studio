import './lib/project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run, parseArgs, ffprobeJson } from './lib/media.mjs';

export const JOIN_XFADE_MAX_MS = 200;

export function parseCutSegments(text) {
  return String(text).split(',').map((p, i) => {
    const [a, b] = p.split('-').map(Number);
    if (!(b > a)) throw new Error(`segment ${i} is not increasing: ${p}`);
    return { a, b, dur: b - a };
  });
}

export function parseJoinXfadeMs(value) {
  if (value === undefined) return 0;
  const ms = typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(ms) || ms < 0 || ms > JOIN_XFADE_MAX_MS) throw new Error(`--join-xfade expects 0 to ${JOIN_XFADE_MAX_MS} milliseconds.`);
  return ms;
}

const seconds = (value) => +value.toFixed(6);

export function buildCutAudioFilter(segs, { fadeSec = 0.012, joinXfadeMs = 0, sourceDurationSec = null } = {}) {
  const labels = segs.map((_, i) => `[a${i}]`).join('');
  if (!joinXfadeMs || segs.length < 2) {
    const parts = segs.map((s, i) => {
      const filters = [`atrim=start=${s.a}:end=${s.b}`, 'asetpts=PTS-STARTPTS'];

      if (i > 0) filters.push(`afade=t=in:st=0:d=${fadeSec}:curve=qsin`);

      if (i < segs.length - 1) filters.push(`afade=t=out:st=${(s.dur - fadeSec).toFixed(6)}:d=${fadeSec}:curve=qsin`);
      return `[0:a]${filters.join(',')}[a${i}]`;
    });
    return `${parts.join(';')};${labels}concat=n=${segs.length}:v=0:a=1[outa]`;
  }
  if (!Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0) throw new Error('--join-xfade needs the measured source audio duration.');
  const x = seconds(joinXfadeMs / 1000), half = x / 2;
  const parts = segs.map((s, i) => {
    if (s.dur < x) throw new Error(`segment ${i} (${s.dur.toFixed(3)} s) is shorter than the ${joinXfadeMs} ms join crossfade.`);
    const start = i > 0 ? seconds(s.a - half) : s.a;
    const end = i < segs.length - 1 ? seconds(s.b + half) : s.b;
    if (start < 0) throw new Error(`segment ${i} has no ${joinXfadeMs / 2} ms source handle before ${s.a} s.`);
    if (i < segs.length - 1 && end > sourceDurationSec) throw new Error(`segment ${i} has no ${joinXfadeMs / 2} ms source handle after ${s.b} s (source ends at ${sourceDurationSec} s).`);
    return `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`;
  });

  return `${parts.join(';')};${labels}acrossfade=n=${segs.length}:d=${x}:c1=qsin:c2=qsin[outa]`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { fade: '0.012' });
  const src = args._[0];
  if (!src || !args.segments || !args.out) {
    console.error('Usage: node scripts/build-cut-audio.mjs <source> --segments "a-b,c-d" --out out.wav [--fade 0.012] [--join-xfade 40]');
    process.exit(1);
  }
  const FADE = Number(args.fade);
  const out = path.resolve(args.out);
  let segs, joinXfadeMs, filter;
  try {
    segs = parseCutSegments(args.segments);
    joinXfadeMs = parseJoinXfadeMs(args['join-xfade']);
    let sourceDurationSec = null;
    if (joinXfadeMs > 0 && segs.length > 1) {
      const probe = await ffprobeJson(src);
      const audio = (probe.streams ?? []).find((stream) => stream.codec_type === 'audio');
      if (!audio) throw new Error(`${src} has no audio stream.`);
      sourceDurationSec = Number(audio.duration ?? probe.format?.duration);
    }
    filter = buildCutAudioFilter(segs, { fadeSec: FADE, joinXfadeMs, sourceDurationSec });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  await run('ffmpeg', [
    '-hide_banner', '-y', '-i', src,
    '-filter_complex', filter,
    '-map', '[outa]',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    out,
  ]);
  const total = segs.reduce((n, s) => n + s.dur, 0);
  const stat = await fs.stat(out);
  console.log(JSON.stringify({
    ok: true, out, bytes: stat.size,
    segments: segs.length,
    expectedSec: +total.toFixed(3),
    actualSec: +((stat.size - 44) / (48000 * 2 * 2)).toFixed(3),
    fadeSec: FADE,
    ...(joinXfadeMs > 0 && segs.length > 1 ? { joinXfadeMs, joins: 'equal-power-crossfade' } : {}),
  }, null, 2));
}


const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) await main();
