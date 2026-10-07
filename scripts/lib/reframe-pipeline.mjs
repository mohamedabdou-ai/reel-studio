import './project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ROOT, run, ffprobeJson, writeJson } from './media.mjs';
import { assertProjectOutput } from './project-paths.mjs';
import { checkedPath, fileSnapshot, digest } from './job-paths.mjs';
import { withOutputTransaction } from './delivery.mjs';
import { displayGeometry, outputGeometry, planReframe, cropCommands, trackingSettings } from './reframe-core.mjs';

const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const fraction = (value) => { const [n, d] = String(value ?? '0/1').split('/').map(Number); return n / d; };
const readJson = async (file) => fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null);
const snapshotAbsolute = (file) => fileSnapshot(relative(file));

export async function inspectReframeSource(source, { startSec = 0, durationSec } = {}) {
  const file = await checkedPath(source, { mustExist: true });
  const sourceIdentity = await fileSnapshot(source);
  const probe = await ffprobeJson(file);
  const video = probe.streams?.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) throw new Error('Face reframing requires a video stream');
  if (video.index !== 0 && probe.streams.filter((s) => s.codec_type === 'video').length > 1) throw new Error('Select a single source video stream in a prepared plate');
  const geometry = displayGeometry(video);
  const totalDurationSec = Number(probe.format?.duration ?? video.duration);
  const fps = fraction(video.r_frame_rate);
  if (!(fps > 0 && fps <= 240) || !(totalDurationSec > 0)) throw new Error('Source cadence or duration could not be determined');
  const duration = durationSec ?? totalDurationSec - startSec;
  if (!Number.isFinite(startSec) || startSec < 0 || !Number.isFinite(duration) || duration <= 0 || duration > 3600 || startSec + duration > totalDurationSec + 1e-6) throw new Error('Invalid source range; start/duration must lie inside source and span at most one hour');
  return { file, source, sourceIdentity, video, audio: probe.streams.filter((s) => s.codec_type === 'audio'), geometry, fps,
    range: { startSec, durationSec: duration }, totalDurationSec, formatStartSec: Number(probe.format?.start_time ?? 0) };
}

async function codeIdentity() {
  const files = ['scripts/lib/reframe-core.mjs', 'scripts/lib/reframe-runtime.mjs', 'scripts/lib/reframe-pipeline.mjs'];
  const identities = [];
  for (const file of files) identities.push(await fileSnapshot(file));
  return identities;
}

async function ffmpegIdentity() {
  return { binary: await fileSnapshot('Tools/bin/ffmpeg.exe'), version: (await run('ffmpeg', ['-version'])).stdout.split(/\r?\n/)[0] };
}

export async function analyzeReframe({ source, startSec = 0, durationSec, sampleFps = 5, analysisMaxEdge = 640, minConfidence = 0.5, force = false, log = () => {} }) {
  if (!Number.isFinite(sampleFps) || sampleFps < 0.5 || sampleFps > 15) throw new Error('Detection sample FPS must be between 0.5 and 15');
  if (!Number.isInteger(analysisMaxEdge) || analysisMaxEdge < 160 || analysisMaxEdge > 1280) throw new Error('Analysis edge must be an integer from 160 to 1280');
  trackingSettings({ minConfidence });
  const sourceInfo = await inspectReframeSource(source, { startSec, durationSec });
  const { faceRuntimeIdentity, detectFrameFiles } = await import('./reframe-runtime.mjs');
  const runtime = await faceRuntimeIdentity();
  const identity = { version: 1, source: sourceInfo.sourceIdentity, runtime, code: await codeIdentity(), ffmpeg: await ffmpegIdentity(),
    settings: { sampleFps, analysisMaxEdge, minConfidence, ...sourceInfo.range } };
  const key = digest(identity);
  const dir = assertProjectOutput(path.join(ROOT, 'state/cache/reframe', key));
  const metadataFile = assertProjectOutput(path.join(dir, 'analysis.json'));
  await fs.mkdir(dir, { recursive: true });
  const lockFile = assertProjectOutput(path.join(dir, 'analysis.lock'));
  const lock = await fs.open(lockFile, 'wx').catch(() => { throw new Error('Face analysis cache is busy; wait for the current process'); });
  try {
    const previous = !force && await readJson(metadataFile);
    if (previous?.key === key && digest(previous.identity) === key && previous.source === source
      && digest(previous.range) === digest(sourceInfo.range) && digest(previous.geometry) === digest(sourceInfo.geometry)
      && previous.payloadHash === digest({ samples: previous.samples, frames: previous.frames, runtime: previous.runtime })) {
      let valid = true;
      for (const frame of previous.frames) if ((await fileSnapshot(frame.path).catch(() => null))?.sha256 !== frame.sha256) { valid = false; break; }
      if (valid && (await fileSnapshot(source)).sha256 === sourceInfo.sourceIdentity.sha256) return { ...previous, cached: true, metadata: relative(metadataFile) };
    }
    const framesDir = assertProjectOutput(path.join(dir, `frames-${randomUUID()}`));
    await fs.mkdir(framesDir);
    const factor = Math.min(1, analysisMaxEdge / Math.max(sourceInfo.geometry.width, sourceInfo.geometry.height));
    const width = Math.max(2, Math.round(sourceInfo.geometry.width * factor / 2) * 2);
    const height = Math.max(2, Math.round(sourceInfo.geometry.height * factor / 2) * 2);
    const filter = `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${1 / sampleFps - 1e-7})',scale=${width}:${height},setsar=1,showinfo`;
    const decode = await run('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-threads', '2', '-ss', String(startSec), '-i', sourceInfo.file,
      '-t', String(sourceInfo.range.durationSec), '-map', '0:v:0', '-an', '-vf', filter, '-fps_mode', 'vfr', '-threads', '2', path.join(framesDir, 'frame-%06d.png')]);
    const points = [...decode.stderr.matchAll(/Parsed_showinfo_\d+[^\r\n]*\bn:\s*(\d+)[^\r\n]*\bpts_time:([-+0-9.eE]+)/g)]
      .map((match) => ({ index: Number(match[1]), timeSec: Number(match[2]) })).filter((point) => point.timeSec < sourceInfo.range.durationSec - 1e-7);
    const files = (await fs.readdir(framesDir)).filter((file) => /^frame-\d{6}\.png$/.test(file)).sort();
    if (!files.length || files.length !== points.length) throw new Error(`Decoded detection frames and actual timestamps disagree (${files.length}/${points.length})`);
    const frames = [];
    for (let i = 0; i < files.length; i++) {
      if (points[i].index !== i || points[i].timeSec < -1e-6 || (i && points[i].timeSec <= points[i - 1].timeSec)) throw new Error('Decoded face frame timestamps are not monotonic');
      frames.push({ ...(await snapshotAbsolute(path.join(framesDir, files[i]))), timeSec: Math.max(0, points[i].timeSec), sourceTimeSec: startSec + points[i].timeSec, width, height });
    }
    const detected = await detectFrameFiles(frames, { runtime, minConfidence, log });
    if ((await fileSnapshot(source)).sha256 !== sourceInfo.sourceIdentity.sha256) throw new Error('Source changed during face analysis');
    const payload = { samples: detected.samples, frames, runtime: detected.runtime };
    const analysis = { version: 1, key, identity, source, sourceIdentity: sourceInfo.sourceIdentity, geometry: sourceInfo.geometry, range: sourceInfo.range,
      ...payload, payloadHash: digest(payload), cached: false, metadata: relative(metadataFile), verified: true,
      limitations: ['Sparse sampled face boxes are draft crop guidance; brief events between samples can be missed.', 'CPU geometric face location only; no identity recognition or appearance processing.'] };
    const temporary = assertProjectOutput(`${metadataFile}.${randomUUID()}.tmp`);
    await writeJson(temporary, analysis);
    await fs.rename(temporary, metadataFile);
    return analysis;
  } finally { await lock.close(); await fs.unlink(lockFile); }
}

async function frameTimes(file, range) {
  const interval = range ? ['-read_intervals', `${Math.max(0, range.startSec)}%${range.startSec + range.durationSec + 0.1}`] : [];
  const { stdout } = await run('ffprobe', ['-v', 'error', ...interval, '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time,duration_time', '-of', 'json', file]);
  return JSON.parse(stdout).frames.map((frame) => ({ time: Number(frame.best_effort_timestamp_time), duration: Number(frame.duration_time ?? 0) }))
    .filter((frame) => Number.isFinite(frame.time) && (!range || frame.time >= range.startSec - 1e-6 && frame.time < range.startSec + range.durationSec - 1e-6));
}

async function audioHash(file, range) {
  const before = range ? ['-ss', String(range.startSec)] : [];
  const after = range ? ['-t', String(range.durationSec)] : [];
  const { stdout } = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...before, '-i', file, ...after, '-map', '0:a', '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-']);
  return stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(',').slice(1).join(','));
}

async function validateRender(sourceInfo, output, expectedGeometry, sourceFrames, sourceAudio) {
  const probe = await ffprobeJson(output);
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  if (!video || video.width !== expectedGeometry.width || video.height !== expectedGeometry.height || displayGeometry(video).rotation !== 0 || video.sample_aspect_ratio !== '1:1') throw new Error('Reframe output geometry/rotation validation failed');
  const frames = await frameTimes(output);
  if (!frames.length || frames.length !== sourceFrames.length) throw new Error(`Reframe changed frame count (${sourceFrames.length} to ${frames.length})`);
  let maxCadenceErrorSec = 0;
  for (let i = 0; i < frames.length; i++) maxCadenceErrorSec = Math.max(maxCadenceErrorSec, Math.abs((frames[i].time - frames[0].time) - (sourceFrames[i].time - sourceFrames[0].time)));
  if (maxCadenceErrorSec > 0.00002) throw new Error(`Reframe altered presentation cadence by ${maxCadenceErrorSec}s`);
  const videoDurationSec = Number(video.duration);
  const maxFrameDuration = Math.max(1 / sourceInfo.fps, ...sourceFrames.map((f) => f.duration));
  if (Math.abs(videoDurationSec - sourceInfo.range.durationSec) > maxFrameDuration + 0.002) throw new Error('Reframe output duration differs from selected range');
  const audio = probe.streams.filter((stream) => stream.codec_type === 'audio');
  if (audio.length !== sourceInfo.audio.length || audio.some((a, i) => a.codec_name !== sourceInfo.audio[i].codec_name || a.sample_rate !== sourceInfo.audio[i].sample_rate || a.channels !== sourceInfo.audio[i].channels)) throw new Error('Reframe audio format or stream count changed');
  const outputAudio = audio.length ? await audioHash(output) : null;
  if (digest(outputAudio) !== digest(sourceAudio)) throw new Error('Original compressed audio packets were not preserved');
  const audioPacketToleranceSec = audio.length ? Math.max(...audio.map((a) => 2048 / Number(a.sample_rate))) : 0;
  const containerDurationSec = Number(probe.format.duration);
  if (Math.abs(containerDurationSec - sourceInfo.range.durationSec) > Math.max(maxFrameDuration, audioPacketToleranceSec) + 0.01) throw new Error('Reframe container duration is outside one source-frame/audio-packet tolerance');
  return { frameCount: frames.length, cadencePreserved: true, maxCadenceErrorSec, videoDurationSec, containerDurationSec,
    audioPacketsPreserved: audio.length ? true : null, audioHashes: outputAudio, audioMode: audio.length ? 'original compressed packets copied' : 'source has no audio',
    selectedRangeDurationSec: sourceInfo.range.durationSec, geometry: expectedGeometry };
}


export async function renderReframe({ source, analysis, samples, ratio = '9:16', startSec = 0, durationSec, out, shortEdge = 1080, settings = {}, force = false }) {
  const output = assertProjectOutput(await checkedPath(out));
  if (path.extname(output).toLowerCase() !== '.mp4') throw new Error('Reframe output must be a separate .mp4 file');
  const suppliedSource = analysis?.source ?? source;
  const sourceInfo = await inspectReframeSource(suppliedSource, analysis?.range ?? { startSec, durationSec });
  if (output.toLowerCase() === sourceInfo.file.toLowerCase()) throw new Error('Reframe output must be separate from source');
  if (analysis && (analysis.sourceIdentity.sha256 !== sourceInfo.sourceIdentity.sha256 || digest(analysis.geometry) !== digest(sourceInfo.geometry))) throw new Error('Face analysis does not match current source');
  if (analysis && (analysis.key !== digest(analysis.identity) || analysis.source !== analysis.identity.source.path
    || digest(analysis.range) !== digest({ startSec: analysis.identity.settings.startSec, durationSec: analysis.identity.settings.durationSec }))) throw new Error('Face analysis source/range identity is inconsistent');
  if (analysis && analysis.payloadHash !== digest({ samples: analysis.samples, frames: analysis.frames, runtime: analysis.runtime })) throw new Error('Face analysis payload integrity failed');
  const plan = planReframe({ geometry: sourceInfo.geometry, ratio, durationSec: sourceInfo.range.durationSec, samples: analysis?.samples ?? samples, settings });
  const geometry = outputGeometry(ratio, shortEdge);
  const identity = { version: 1, source: sourceInfo.sourceIdentity, range: sourceInfo.range, geometry, plan,
    detector: analysis ? { key: analysis.key, runtime: analysis.runtime, payloadHash: analysis.payloadHash } : { mode: 'provided-detections', note: 'Explicit caller-supplied crop guidance, not detector evidence' },
    code: await codeIdentity(), ffmpeg: await ffmpegIdentity(), encode: { video: 'libx264', crf: 18, preset: 'fast', audio: 'copy', fpsMode: 'passthrough', timeBase: sourceInfo.video.time_base } };
  const key = digest(identity);
  const metadataFile = assertProjectOutput(`${output}.reframe.json`);
  const previous = !force && await readJson(metadataFile);
  if (previous?.key === key && digest(previous.identity) === key && digest(previous.plan) === digest(plan)
    && previous.evidenceHash === digest({ validation: previous.validation, verified: previous.verified, outputHash: previous.outputHash })
    && previous.outputHash === (await snapshotAbsolute(output).catch(() => null))?.sha256) {
    if ((await fileSnapshot(sourceInfo.source)).sha256 !== sourceInfo.sourceIdentity.sha256) throw new Error('Source changed during reframe cache validation');
    return { ...previous, cached: true, output: relative(output), metadata: relative(metadataFile) };
  }
  const sourceFrames = await frameTimes(sourceInfo.file, { ...sourceInfo.range, startSec: sourceInfo.range.startSec + sourceInfo.formatStartSec });
  const sourceAudio = sourceInfo.audio.length ? await audioHash(sourceInfo.file, sourceInfo.range) : null;
  let metadata;
  await withOutputTransaction(output, async (staged, work) => {
    const commands = path.join(work, 'crop.cmd');
    await fs.writeFile(commands, cropCommands(plan), 'utf8');
    const first = plan.keyframes[0];
    const filter = `scale=${sourceInfo.geometry.width}:${sourceInfo.geometry.height},setsar=1,sendcmd=f=crop.cmd,crop@face=w=${plan.crop.width}:h=${plan.crop.height}:x=${first.x}:y=${first.y}:exact=1,scale=${geometry.width}:${geometry.height}:flags=lanczos,setsar=1`;
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', '-ss', String(sourceInfo.range.startSec), '-i', sourceInfo.file,
      '-t', String(sourceInfo.range.durationSec), '-map', '0:v:0', '-map', '0:a?', '-vf', filter, '-fps_mode', 'passthrough', '-enc_time_base:v', sourceInfo.video.time_base,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-map_metadata', '0', '-metadata:s:v:0', 'rotate=0', '-movflags', '+faststart', staged], { cwd: work });
    const validation = await validateRender(sourceInfo, staged, geometry, sourceFrames, sourceAudio);
    if ((await fileSnapshot(sourceInfo.source)).sha256 !== sourceInfo.sourceIdentity.sha256) throw new Error('Source changed during reframe render');
    metadata = { version: 1, key, identity, output: relative(output), outputHash: (await snapshotAbsolute(staged)).sha256,
      source: sourceInfo.source, sourceIdentity: sourceInfo.sourceIdentity, range: sourceInfo.range, plan, validation, verified: true, cached: false,
      delivery: false, note: 'Derived working footage; platform delivery still requires the project delivery/QC gates.' };
    metadata.evidenceHash = digest({ validation: metadata.validation, verified: metadata.verified, outputHash: metadata.outputHash });
    await writeJson(`${staged}.reframe.json`, metadata);
  }, { sidecars: ['.reframe.json'] });
  return { ...metadata, metadata: relative(metadataFile) };
}
