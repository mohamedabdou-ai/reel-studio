import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ffprobeJson, summarizeProbe, parseArgs, writeJson, cacheDirFor, readCachedJson } from './lib/media.mjs';

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.mts', '.wav', '.mp3', '.m4a', '.aac', '.flac']);
const args = parseArgs(process.argv.slice(2));

async function collect(p) {
  const stat = await fs.stat(p);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(p, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      if (e.isDirectory()) out.push(...await collect(path.join(p, e.name)));
      else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) out.push(path.join(p, e.name));
    }
    return out;
  }
  return [p];
}

const files = (await Promise.all(args._.map(collect))).flat();
if (!files.length) { console.error('No media files found.'); process.exit(1); }

const results = [];
for (const f of files) {
  const dir = await cacheDirFor(f, 'probe');
  const cached = await readCachedJson(path.join(dir, 'probe.json'));
  if (cached) { results.push(cached); continue; }
  const probe = await ffprobeJson(f);
  const summary = summarizeProbe(f, probe);
  summary.raw = probe;
  await writeJson(path.join(dir, 'probe.json'), summary);
  results.push(summary);
}

const table = results.map(({ raw, ...s }) => s);
console.log(JSON.stringify(table, null, 2));
if (args.json) await writeJson(args.json, table);
