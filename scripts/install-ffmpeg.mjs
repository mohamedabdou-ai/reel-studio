import './lib/project-tmp.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT, run, writeJson } from './lib/media.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';

const version = '8.1.2';
const expected = '0fff188997a499b5382e0f66e845d4556c48c54f0113ebed4853d556dbdd7059';
const base = `ffmpeg-${version}-full_build`;
const url = `https://www.gyan.dev/ffmpeg/builds/packages/${base}.7z`;
const dir = assertProjectOutput(path.join(ROOT, 'Tools/bin'));
const archive = assertProjectOutput(path.join(ROOT, 'state/cache/downloads', `${base}.7z`));
await fs.mkdir(dir, { recursive: true });
await fs.mkdir(path.dirname(archive), { recursive: true });
async function digest(file) {
  if (!(await fs.stat(file).catch(() => null))) return null;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
if (await digest(archive) !== expected) {
  console.error(`Downloading verified FFmpeg ${version} Full into ${dir}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const partial = `${archive}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  if (await digest(partial) !== expected) throw new Error('FFmpeg archive SHA256 mismatch');
  await fs.rename(partial, archive);
}
await run(path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/tar.exe'), [
  '-xf', archive, '-C', dir, '--strip-components', '2', `${base}/bin/ffmpeg.exe`, `${base}/bin/ffprobe.exe`,
]);
const ffmpeg = path.join(dir, 'ffmpeg.exe');
const ver = await run(ffmpeg, ['-version']);
if (!ver.stdout.startsWith(`ffmpeg version ${version}`)) throw new Error('Unexpected FFmpeg version');
const filters = await run(ffmpeg, ['-hide_banner', '-filters']);
for (const filter of ['ebur128', 'loudnorm', 'sidechaincompress']) {
  if (!(filters.stdout + filters.stderr).includes(filter)) throw new Error(`Missing required filter: ${filter}`);
}
const report = { ok: true, version, build: 'full', url, archiveSha256: expected, ffmpeg, ffprobe: path.join(dir, 'ffprobe.exe'), filters: ['ebur128', 'loudnorm', 'sidechaincompress'] };
await writeJson(path.join(dir, 'ffmpeg-install.json'), report);
console.log(JSON.stringify(report, null, 2));
