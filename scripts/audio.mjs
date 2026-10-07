import path from 'node:path';
import { run, parseArgs, cacheDirFor, readCachedJson, writeJson, ffprobeJson, summarizeProbe, hms } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2), { 'silence-db': '-35', 'silence-dur': '0.35' });
const file = args._[0];
if (!file) { console.error('Usage: node scripts/audio.mjs <file>'); process.exit(1); }

const dir = await cacheDirFor(file, 'audio');
const cachePath = path.join(dir, 'audio-analysis.json');
const cached = await readCachedJson(cachePath);
if (cached) { console.log(JSON.stringify(cached, null, 2)); process.exit(0); }

const probe = summarizeProbe(file, await ffprobeJson(file));
if (!probe.hasAudio) {
  const result = { file: probe.name, hasAudio: false };
  await writeJson(cachePath, result);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}


const wavPath = path.join(dir, 'audio-16k.wav');
if (!args['no-wav']) {
  await run('ffmpeg', ['-hide_banner', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath]);
}


const sdb = args['silence-db'], sdur = args['silence-dur'];
const { stderr } = await run('ffmpeg', [
  '-hide_banner', '-i', file, '-vn',
  '-af', `silencedetect=n=${sdb}dB:d=${sdur},ebur128=peak=true`,
  '-f', 'null', '-',
], { allowFail: true });

const silences = [];
{
  const re = /silence_start: (\d+(?:\.\d+)?)[\s\S]*?silence_end: (\d+(?:\.\d+)?) \| silence_duration: (\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(stderr))) silences.push({ start: +(+m[1]).toFixed(3), end: +(+m[2]).toFixed(3), dur: +(+m[3]).toFixed(3), tc: `${hms(+m[1])}–${hms(+m[2])}` });
}
const lufs = stderr.match(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)?.at(-1)?.match(/(-?\d+(?:\.\d+)?)/)?.[1];
const lra = stderr.match(/LRA:\s+(\d+(?:\.\d+)?) LU/g)?.at(-1)?.match(/(\d+(?:\.\d+)?)/)?.[1];
const peak = stderr.match(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)?.at(-1)?.match(/(-?\d+(?:\.\d+)?)/)?.[1];

const result = {
  file: probe.name, hasAudio: true, durationSec: probe.durationSec,
  loudness: { integratedLUFS: lufs ? +lufs : null, LRA: lra ? +lra : null, truePeakDBFS: peak ? +peak : null },
  silence: {
    thresholdDb: +sdb, minDur: +sdur, count: silences.length,
    totalSilentSec: +silences.reduce((a, s) => a + s.dur, 0).toFixed(3),
    spans: silences,
  },
  wav16k: args['no-wav'] ? null : wavPath,
};
await writeJson(cachePath, result);
console.log(JSON.stringify(result, null, 2));
