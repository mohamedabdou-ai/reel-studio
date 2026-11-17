import './project-tmp.mjs';
import fs from 'node:fs';
import {promises as fsp} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT, run, ffprobeJson, summarizeProbe} from './media.mjs';
import {assertProjectOutput} from './project-paths.mjs';
import {describeSource, toneMapFilter, ratio} from './intake.mjs';
import {acquireFileLease, fileLeaseError} from './python-venv.mjs';
import {sha256File} from './studio-download.mjs';

export const PREPARE_VERSION = 4;
export function assertSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(slug)) throw new Error(`Invalid project name: ${slug}`);
  return slug;
}
export function assertReferenceId(ref) {
  if (typeof ref !== 'string' || !/^ref-[0-9a-f]{12}$/u.test(ref)) throw new Error('Invalid reference id.');
  return ref;
}
export function referenceIdFor(sha256) {
  if (!/^[0-9a-f]{64}$/u.test(sha256)) throw new Error('Invalid SHA-256 digest.');
  return `ref-${sha256.slice(0, 12)}`;
}
export function outDirFor(project, ref) {
  return assertProjectOutput(path.join(ROOT, 'Projects', assertSlug(project), 'style-analysis', assertReferenceId(ref)));
}
export function guardedFile(dir, name) {
  const target = path.resolve(dir, name), rel = path.relative(path.resolve(dir), target);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Unsafe reference output path.');
  return assertProjectOutput(target);
}
export async function atomicJson(file, value) {
  assertProjectOutput(file);
  await fsp.mkdir(path.dirname(file), {recursive: true});
  const temp = assertProjectOutput(`${file}.${randomUUID()}.tmp`);
  try { await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'}); await fsp.rename(temp, assertProjectOutput(file)); }
  finally { await fsp.rm(temp, {force: true}); }
}
export function cropFromDetect(text, width, height) {
  const all = [...String(text).matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/gu)];
  if (!all.length) return null;
  const [, w, h, x, y] = all.at(-1).map(Number);
  if (!(w > 0 && h > 0 && x + w <= width && y + h <= height)) return null;
  return w * h >= 0.97 * width * height ? null : {x, y, w, h};
}
export function analysisRate(rawProbe) {
  const v = rawProbe.streams?.find(s => s.codec_type === 'video') ?? {};
  const avg = ratio(v.avg_frame_rate), tagged = ratio(v.r_frame_rate);
  const valid = v => Number.isFinite(v) && v > 0 && v <= 1000;
  // VFR uses the tagged cadence; CFR preserves fractional source rates exactly.
  const useTagged = valid(tagged) && (!valid(avg) || Math.abs(avg - tagged) / tagged > .005);
  if (useTagged && valid(avg) && tagged > avg * 2.01) return {rate:v.avg_frame_rate,fps:avg,fallback:false,limitation:`Tagged frame rate ${tagged} exceeds average ${avg} by more than 2x; proxy uses the measured average cadence.`};
  if (useTagged) return {rate: v.r_frame_rate, fps: tagged, fallback: false};
  if (valid(avg)) return {rate: v.avg_frame_rate, fps: avg, fallback: false};
  return {rate: '30', fps: 30, fallback: true};
}

export function streamDuration(stream) {
  if(Number.isFinite(Number(stream?.duration)) && Number(stream.duration)>0)return Number(stream.duration);
  const ticks=Number(stream?.duration_ts),base=ratio(stream?.time_base);
  if(Number.isFinite(ticks) && ticks>0 && base>0)return ticks*base;
  const tag=stream?.tags?.DURATION?.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/u);
  return tag?Number(tag[1])*3600+Number(tag[2])*60+Number(tag[3]):null;
}

export async function prepareReference({reference, project, force = false, onCacheHit = () => {}}) {
  if (typeof reference !== 'string' || !reference.trim()) throw new Error('A named local reference file is required.');
  const source = await fsp.realpath(path.resolve(reference));
  if (!(await fsp.stat(source)).isFile()) throw new Error('Reference must be a file.');
  const sha256 = await sha256File(source), referenceId = referenceIdFor(sha256);
  const outDir = outDirFor(project, referenceId), workDir = guardedFile(outDir, 'work');
  const cachePath = guardedFile(workDir, 'prepare.json');
  const rawProbe = await ffprobeJson(source), probe = summarizeProbe(source, rawProbe);
  if (!probe.hasVideo || !(probe.durationSec > 0) || !(probe.width > 0 && probe.height > 0)) throw new Error('Reference needs a video stream with valid size and duration.');
  const containerDurationSec=probe.durationSec;
  const videoStream=rawProbe.streams.find(s=>s.codec_type==='video');
  const videoStreamDurationSec=streamDuration(videoStream);
  const origin=Number(rawProbe.format?.start_time),videoStart=Number(videoStream.start_time);
  const videoStartSec=Number.isFinite(videoStart)?Math.max(0,videoStart-(Number.isFinite(origin)?origin:0)):0;
  const measuredVideoDurationSec=videoStreamDurationSec==null?null:videoStreamDurationSec+videoStartSec;
  let videoDurationSec=measuredVideoDurationSec ?? containerDurationSec;
  const audioDurationSec=probe.hasAudio?streamDuration(rawProbe.streams.find(s=>s.codec_type==='audio')):null;
  probe.durationSec=videoDurationSec;
  const limitations=[];
  if(videoStartSec>.001)limitations.push(`Video begins ${videoStartSec.toFixed(3)}s after the input origin; the proxy holds its first frame to preserve the common audio/video timeline.`);
  if(!streamDuration(rawProbe.streams.find(s=>s.codec_type==='video')))limitations.push('Video stream duration is unavailable; the decoded proxy determines the analysis timeline.');
  if(audioDurationSec && Math.abs(audioDurationSec-videoDurationSec)>.05)limitations.push(`Audio duration (${audioDurationSec.toFixed(3)}s) differs from video (${videoDurationSec.toFixed(3)}s); audio analysis is trimmed or padded to the video timeline.`);
  const {hdr} = describeSource(rawProbe), rate = analysisRate(rawProbe);
  if(rate.limitation)limitations.push(rate.limitation);
  const settings = {version: PREPARE_VERSION, code: await sha256File(new URL(import.meta.url)), width: 540, crf: 18, rate: rate.rate, hdr, audio: probe.hasAudio};
  const proxyPath = guardedFile(workDir, 'proxy.mp4'), wavPath = guardedFile(workDir, 'audio-16k.wav');
  let cached;
  try { cached = JSON.parse(await fsp.readFile(cachePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
  if (!force && cached?.source?.sha256 === sha256 && cached.source.path === source && JSON.stringify(cached.cache?.settings) === JSON.stringify(settings)
    && cached.proxy?.path === proxyPath && cached.outDir === outDir && cached.workDir === workDir
    && await sha256File(proxyPath) === cached.cache?.proxySha256 && cached.cache?.proxySha256
    && (!probe.hasAudio || (cached.wav?.path === wavPath && cached.cache?.wavSha256 && await sha256File(wavPath) === cached.cache.wavSha256))) { onCacheHit(true); return cached; }
  if (cached?.source?.sha256 && cached.source.sha256 !== sha256) throw new Error('Reference id prefix collision; preserve the existing reference.');
  if (fs.existsSync(guardedFile(workDir, 'breakdown.lock'))) throw await fileLeaseError(guardedFile(workDir,'breakdown.lock'),'Reference analysis');
  if ([proxyPath, wavPath, cachePath].some(file => path.resolve(file).toLowerCase() === source.toLowerCase())) throw new Error('Source collides with generated output.');
  // A reference placed inside its own generated directory is never overwritten.
  const sourceRel = path.relative(outDir, source);
  if (sourceRel && sourceRel !== '..' && !sourceRel.startsWith(`..${path.sep}`) && !path.isAbsolute(sourceRel)) throw new Error('Source cannot live in the reference output directory.');
  await fsp.mkdir(workDir, {recursive: true});
  const lock = guardedFile(workDir, 'prepare.lock');
  const release = await acquireFileLease(lock,{label:'Reference preparation'});
  const attempt = guardedFile(workDir, `prepare-${randomUUID()}`);
  try {
    await fsp.mkdir(attempt);
    const detect = await run('ffmpeg', ['-hide_banner', '-nostdin', '-t', '180', '-i', source, '-vf', 'fps=2,cropdetect=limit=24:round=2:reset=0', '-an', '-f', 'null', '-']);
    const crop = cropFromDetect(detect.stderr, probe.width, probe.height);
    const filters = [hdr ? toneMapFilter(hdr) : null, crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : null,
      'scale=540:-2:flags=area', 'setsar=1', `fps=fps=${rate.rate}:start_time=0`, 'format=yuv420p'].filter(Boolean);
    const proxyTemp = guardedFile(attempt, 'proxy.mp4'), wavTemp = guardedFile(attempt, 'audio.wav');
    await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', source, '-map', '0:v:0', '-vf', filters.join(','), '-fps_mode', 'cfr', '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '1', proxyTemp]);
    const proxyProbe = summarizeProbe(proxyTemp, await ffprobeJson(proxyTemp));
    if (Math.abs(proxyProbe.fps - rate.fps) > .002 || measuredVideoDurationSec && Math.abs(proxyProbe.durationSec - measuredVideoDurationSec) > 2 / rate.fps + .05) throw new Error('Prepared proxy cadence or duration changed unexpectedly.');
    if(!measuredVideoDurationSec){videoDurationSec=proxyProbe.durationSec;probe.durationSec=videoDurationSec;if(audioDurationSec && Math.abs(audioDurationSec-videoDurationSec)>.05)limitations.push('Audio duration differs from the decoded video timeline; spectral analysis is aligned to the video.');}
    let wav = null;
    if (probe.hasAudio) {
      await run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', source, '-map', '0:a:0', '-vn', '-af', `aresample=async=1:first_pts=0,apad=whole_dur=${videoDurationSec}`, '-t', String(videoDurationSec), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavTemp]);
      wav = {path: wavPath, sampleRate: 16000};
    }
    if (await sha256File(source) !== sha256) throw new Error('Source changed during preparation.');
    await fsp.rename(proxyTemp, assertProjectOutput(proxyPath));
    if (wav) await fsp.rename(wavTemp, assertProjectOutput(wavPath));
    const prepared = {schema: 1, referenceId, source: {path: source, name: path.basename(source), sha256},
      probe: {durationSec: probe.durationSec, width: probe.width, height: probe.height, fps: probe.fps, hasAudio: probe.hasAudio,videoDurationSec,audioDurationSec,containerDurationSec,videoStreamDurationSec,videoStartSec}, crop, hdr, outDir, workDir,
      proxy: {path: proxyPath, width: proxyProbe.width, height: proxyProbe.height, fps: proxyProbe.fps,durationSec:proxyProbe.durationSec}, wav,
      limitations: [...limitations,...(rate.fallback ? ['Source frame rate unavailable; analysis proxy uses 30 fps.'] : [])],
      cache: {settings, proxySha256: await sha256File(proxyPath), wavSha256: wav ? await sha256File(wavPath) : null}};
    await atomicJson(cachePath, prepared);
    onCacheHit(false);
    return prepared;
  } finally {
    await release();
    await fsp.rm(assertProjectOutput(attempt), {recursive: true, force: true});
  }
}
