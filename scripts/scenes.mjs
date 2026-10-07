import path from 'node:path';
import { run, parseArgs, cacheDirFor, readCachedJson, writeJson, ffprobeJson, summarizeProbe, hms } from './lib/media.mjs';

const args = parseArgs(process.argv.slice(2), { threshold: '0.25' });
const file = args._[0];
if (!file) { console.error('Usage: node scripts/scenes.mjs <file> [--threshold 0.25]'); process.exit(1); }
const thr = Number(args.threshold);

const dir = await cacheDirFor(file, 'scenes');
const cachePath = path.join(dir, `scenes-${thr}.json`);
const cached = await readCachedJson(cachePath);
if (cached) { console.log(JSON.stringify(cached, null, 2)); process.exit(0); }

const probe = summarizeProbe(file, await ffprobeJson(file));


const allPath = path.join(dir, 'all-scores.json');
let scores = await readCachedJson(allPath);
if (!scores) {
  const { stdout, stderr } = await run('ffmpeg', [
    '-hide_banner', '-i', file,
    '-vf', "select='gt(scene,0)',metadata=print:file=-",
    '-an', '-f', 'null', 'NUL',
  ], { allowFail: true });
  const text = stdout + '\n' + stderr;

  scores = [];
  const re = /pts_time:(\d+(?:\.\d+)?)[\s\S]*?scene_score=(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text))) scores.push({ t: +(+m[1]).toFixed(3), score: +(+m[2]).toFixed(4) });
  await writeJson(allPath, scores);
}

const cuts = scores.filter(s => s.score >= thr).map(s => s.t);
const bounds = [0, ...cuts, probe.durationSec ?? (cuts.at(-1) ?? 0)];
const shots = [];
for (let i = 0; i < bounds.length - 1; i++) {
  const len = +(bounds[i + 1] - bounds[i]).toFixed(3);
  if (len > 0.01) shots.push({ start: bounds[i], end: bounds[i + 1], len, tc: `${hms(bounds[i])}–${hms(bounds[i + 1])}` });
}
const lens = shots.map(s => s.len).sort((a, b) => a - b);
const result = {
  file: probe.name, durationSec: probe.durationSec, threshold: thr,
  cutCount: cuts.length,
  cutsPerMinute: probe.durationSec ? +(cuts.length / (probe.durationSec / 60)).toFixed(2) : null,
  shotLen: lens.length ? {
    min: lens[0], max: lens.at(-1),
    median: lens[Math.floor(lens.length / 2)],
    mean: +(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(3),
  } : null,
  cuts: cuts.map(t => ({ t, tc: hms(t) })),
  shots,
};
await writeJson(cachePath, result);
console.log(JSON.stringify(args['all-scores'] ? { ...result, allScores: scores } : result, null, 2));
