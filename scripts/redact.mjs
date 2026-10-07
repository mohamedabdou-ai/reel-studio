import './lib/project-tmp.mjs';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {ROOT, run, parseArgs, ffprobeJson, summarizeProbe, writeJson, readCachedJson} from './lib/media.mjs';
import {fileSnapshot, externalFileSnapshot, digest} from './lib/job-paths.mjs';
import {withOutputTransaction} from './lib/delivery.mjs';
import {
  REDACT_VERSION, REDACT_ENCODE, REDACT_OUTPUT_LABEL, validateRects, buildRedactFilter, verificationPoint,
  meanAbsGradient, redactionVerdict, redactOutputPath, parseRectsDocument, sameCadence, classifyInputPath,
} from './lib/redact.mjs';

const USAGE = 'Usage: node scripts/redact.mjs --in <capture> --rects <rects.json> --out <Projects/<slug>/….mp4 | engine/public/_redacted/….mp4> [--replace]';

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function toRelative(value) {
  const relative = path.relative(ROOT, path.resolve(value)).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || /^[a-z]:/i.test(relative)) {
    throw fail(`Path must be inside the project: ${value}`);
  }
  return relative;
}

function frameRate(stream) {
  for (const value of [stream.avg_frame_rate, stream.r_frame_rate]) {
    const [n, d] = String(value ?? '').split('/').map(Number);
    if (n > 0 && d > 0) return n / d;
  }
  throw fail('The capture has no readable frame rate.');
}

async function packetTiming(file) {
  const {stdout} = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=time_base:packet=pts', '-of', 'json', file]);
  const json = JSON.parse(stdout);
  return {timeBase: json.streams?.[0]?.time_base ?? '', pts: (json.packets ?? []).map((p) => Number(p.pts))};
}


async function regionGradient(file, seekSec, box) {
  const {stdout} = await run('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-ss', String(seekSec), '-i', file,
    '-frames:v', '1', '-fps_mode', 'passthrough', '-vf', `crop=${box.width}:${box.height}:${box.x}:${box.y},format=gray`,
    '-f', 'rawvideo', '-'], {encoding: 'buffer'});
  return meanAbsGradient(stdout.subarray(0, box.width * box.height), box.width, box.height);
}

function report(sidecar, cached, outRel) {
  const next = [];
  if (sidecar.source.path.startsWith('engine/public/')) {
    next.push(`The unredacted capture ${sidecar.source.path} is inside engine/public, which every preview bundle serves; move it out once this plate is approved.`);
  }
  if (sidecar.status === 'NEEDS-REVIEW') next.push('Open every verification PNG whose verdict is NEEDS-REVIEW and confirm the region is unreadable.');
  next.push(`Scrub ${outRel} across each window, then author the edit from it, never from ${sidecar.source.path}.`);
  if (outRel.startsWith('engine/public/_redacted/')) next.push(`node scripts/plates.mjs record --only ${outRel.slice('engine/public/'.length)}`);
  return {
    ok: true, status: sidecar.status, cached,
    source: sidecar.source, output: sidecar.output, sidecar: `${outRel}.redaction.json`,
    verifyFrames: sidecar.verification.map((v) => v.png), verification: sidecar.verification, next,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.in !== 'string' || typeof args.rects !== 'string' || typeof args.out !== 'string') throw fail(USAGE);




  const inClass = classifyInputPath(args.in, ROOT);
  const outRel = redactOutputPath(toRelative(args.out));
  const inAbs = inClass.external ? inClass.absolute : path.join(ROOT, ...inClass.relative.split('/'));
  const outAbs = path.join(ROOT, ...outRel.split('/'));
  if (inAbs.toLowerCase() === outAbs.toLowerCase()) throw fail('--out must differ from --in; the capture is never overwritten.');
  const rects = parseRectsDocument(JSON.parse(await fs.readFile(path.resolve(args.rects), 'utf8')));

  const snapshot = inClass.external ? await externalFileSnapshot(inAbs) : await fileSnapshot(inClass.relative);
  const source = inClass.external
    ? {path: snapshot.path, external: true, sha256: snapshot.sha256}
    : {path: snapshot.path, sha256: snapshot.sha256};
  const probe = await ffprobeJson(inAbs);
  const stream = (probe.streams ?? []).find((s) => s.codec_type === 'video');
  if (!stream) throw fail('The capture has no video stream.');
  if (stream.disposition?.attached_pic) throw fail('The first video stream is cover art; remux the capture without it.');
  if (['smpte2084', 'arib-std-b67'].includes(stream.color_transfer)) throw fail('HDR capture: tone-map it to SDR bt709 before redacting.');
  const summary = summarizeProbe(inAbs, probe);
  const video = {width: summary.width, height: summary.height, fps: frameRate(stream)};
  const normalized = validateRects(rects, video);
  const filter = buildRedactFilter(rects, video);
  const [tbNum, tbDen] = String(stream.time_base ?? '').split('/').map(Number);
  if (!(tbNum > 0) || !Number.isInteger(tbDen) || tbDen <= 0) throw fail(`Unreadable video time base: ${stream.time_base}`);
  const audio = (probe.streams ?? []).find((s) => s.codec_type === 'audio') ?? null;
  const audioMode = !audio ? 'none' : audio.codec_name === 'aac' ? 'copy' : 'aac-320k';
  const ffmpegVersion = (await run('ffmpeg', ['-hide_banner', '-version'])).stdout.split(/\r?\n/)[0].trim();
  const code = await Promise.all(['scripts/lib/redact.mjs', 'scripts/redact.mjs'].map((file) => fileSnapshot(file)));
  const key = digest({version: REDACT_VERSION, source: source.sha256, rects, filter, encode: REDACT_ENCODE, audioMode,
    ffmpeg: ffmpegVersion, code: code.map((c) => [c.path, c.sha256])});


  const existing = await fs.stat(outAbs).catch(() => null);
  const prior = await readCachedJson(`${outAbs}.redaction.json`);
  if (existing && prior?.key === key) {
    const current = await fileSnapshot(outRel).catch(() => null);
    const pngs = await Promise.all((prior.verification ?? []).map((v) => fs.stat(path.join(ROOT, ...v.png.split('/'))).then(() => true, () => false)));
    if (current?.sha256 === prior.output?.sha256 && pngs.length === normalized.length && pngs.every(Boolean)) return report(prior, true, outRel);
  }
  if (existing && prior?.version !== REDACT_VERSION && args.replace !== true) {
    throw fail(`${outRel} exists and was not produced by redact.mjs; pass --replace to overwrite it.`);
  }

  const sidecar = await withOutputTransaction(outAbs, async (staged, work) => {
    const graphFile = path.join(work, 'redact.ffgraph');
    await fs.writeFile(graphFile, filter, 'utf8');
    await run('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-threads', '4', '-i', inAbs,
      '-/filter_complex', graphFile, '-map', `[${REDACT_OUTPUT_LABEL}]`, ...(audio ? ['-map', `0:${audio.index}`] : []),
      '-map_metadata', '-1', '-map_chapters', '-1',
      '-c:v', REDACT_ENCODE.codec, '-preset', REDACT_ENCODE.preset, '-crf', String(REDACT_ENCODE.crf), '-pix_fmt', REDACT_ENCODE.pixFmt,
      '-enc_time_base:v', '-1', '-fps_mode', 'passthrough', '-video_track_timescale', String(tbDen),
      ...(audioMode === 'copy' ? ['-c:a', 'copy'] : audioMode === 'aac-320k' ? ['-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : []),
      '-movflags', '+faststart', staged]);

    const cadence = sameCadence(await packetTiming(inAbs), await packetTiming(staged));
    if (!cadence.ok) throw fail(`The redacted plate changed the capture's cadence: ${cadence.reason}.`);

    const verifyDir = `${staged}.verify`;
    await fs.mkdir(verifyDir);
    const verification = [];
    for (const rect of normalized) {
      const point = verificationPoint(rect, video.fps);
      const name = `r${String(rect.index).padStart(2, '0')}-f${String(point.frame).padStart(6, '0')}.png`;
      await run('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-y', '-ss', String(point.seekSec), '-i', staged,
        '-frames:v', '1', '-fps_mode', 'passthrough', '-update', '1', path.join(verifyDir, name)]);
      const sourceGradient = await regionGradient(inAbs, point.seekSec, point.box);
      const outputGradient = await regionGradient(staged, point.seekSec, point.box);
      verification.push({rect: rect.index, label: rect.label, frame: point.frame, t: point.t, box: point.box,
        sourceGradient: Number(sourceGradient.toFixed(3)), outputGradient: Number(outputGradient.toFixed(3)),
        ...redactionVerdict(sourceGradient, outputGradient), png: `${outRel}.verify/${name}`});
    }
    const leaks = verification.filter((v) => v.verdict === 'NOT-REDACTED');
    if (leaks.length) {
      throw fail(`Readable detail survives in ${leaks.map((v) => `rects[${v.rect}] (frame ${v.frame}, ratio ${v.ratio})`).join(', ')}; nothing was published.`, 3);
    }
    const stillSha256 = inClass.external ? (await externalFileSnapshot(inAbs)).sha256 : (await fileSnapshot(inClass.relative)).sha256;
    if (stillSha256 !== source.sha256) throw fail('The capture changed while it was being redacted.');
    const output = await fileSnapshot(toRelative(staged));
    const record = {
      version: REDACT_VERSION, key,
      source,
      output: {path: outRel, sha256: output.sha256},
      video: {width: video.width, height: video.height, fps: video.fps, timeBase: stream.time_base, frames: cadence.frames},
      encode: {...REDACT_ENCODE, audio: audioMode},
      rects, filter, verification,
      status: verification.some((v) => v.verdict === 'NEEDS-REVIEW') ? 'NEEDS-REVIEW' : 'PASS',
    };
    await writeJson(`${staged}.redaction.json`, record);
    return record;
  }, {sidecars: ['.redaction.json', '.verify']});
  return report(sidecar, false, outRel);
}

try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({ok: false, error: error.message}, null, 2));
  process.exitCode = error.exitCode ?? 1;
}
