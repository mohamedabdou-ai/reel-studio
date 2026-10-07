import './project-tmp.mjs';
import { PROJECT_TMP } from './project-tmp.mjs';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { ROOT } from './project-paths.mjs';
import { CACHE_DIR, fileKey } from './media.mjs';
import { normalizeMixOptions, mixOutputPath, chooseMixSfxGain, parseMixStemStats, parseMixLoudness, assessMixDelivery, VOICE_SILENCE, buildVoiceChain, buildVoiceMeasureFilter, buildMixFilterGraph, parseSilenceSpans, silenceSpansFromAudioCache, selectFloorWindows, parseRmsLevelDb, estimateNoiseFloorDb, decideDenoise } from './mix-contract.mjs';

const execute = promisify(execFile);
const ffmpeg = path.join(ROOT, 'Tools/bin/ffmpeg.exe'), ffprobe = path.join(ROOT, 'Tools/bin/ffprobe.exe');
async function hashFile(file) { const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
async function writeReport(file, value) { mixOutputPath(file); await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); }
async function assertInput(file) {
  const real = await fsp.realpath(file), relative = path.relative(ROOT, real);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !(await fsp.stat(file)).isFile()) throw new Error('Mix input must resolve to a file inside the project.');
  return real;
}
async function probe(file) {
  const { stdout } = await execute(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { cwd: ROOT, env: process.env, windowsHide: true, encoding: 'utf8', timeout: 30000 });
  return JSON.parse(stdout);
}


async function readCachedSilence(file) {
  const cacheFile = path.join(CACHE_DIR, 'audio', `${path.parse(file).name}-${await fileKey(file)}`, 'audio-analysis.json');
  let cached;
  try { cached = JSON.parse(await fsp.readFile(cacheFile, 'utf8')); } catch { return null; }
  const spans = silenceSpansFromAudioCache(cached);
  return spans ? { file: path.relative(ROOT, cacheFile).split(path.sep).join('/'), spans } : null;
}
async function runFfmpeg(args, logFile) {
  let stderr = '';
  const handle = await fsp.open(mixOutputPath(logFile), 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, ['-nostdin', ...args], { cwd: ROOT, env: process.env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], timeout: 30 * 60 * 1000 });
      child.stderr.on('data', chunk => { const text = chunk.toString(); stderr = (stderr + text).slice(-1024 * 1024); fs.writeSync(handle.fd, chunk); });
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code ?? signal}; see ${logFile}. ${stderr.slice(-1200)}`)));
    });
  } finally { await handle.close(); }
  return stderr;
}

export async function mixDelivery(args, { onProgress = message => process.stderr.write(message + '\n') } = {}) {
  const options = normalizeMixOptions(args);
  const result = { schema: 1, ok: false, status: 'failed', out: options.out, published: false, style: options.style, styleProfile: options.styleProfile, targets: { LUFS: options.lufs, truePeakDb: options.tp, loudnessToleranceLU: 1, peakToleranceDb: 0.3, lraBand: options.lraBand }, voice: { mode: options.voice, chain: '', denoise: null, intermediateCodec: options.voice === 'off' ? 'pcm_s24le' : 'pcm_f32le', stemMeasuredAfterChain: options.voice !== 'off' }, errors: [], warnings: [] };
  let stage = 'preflight';
  try {
    const inputs = [await assertInput(options.video)];
    if (options.sfx) inputs.push(await assertInput(options.sfx));
    if (fs.existsSync(options.out) && inputs.includes(await fsp.realpath(options.out))) throw new Error('Mix output aliases a source input.');
    if (options.reportFile && fs.existsSync(options.reportFile) && inputs.includes(await fsp.realpath(options.reportFile))) throw new Error('Mix report aliases a source input.');
    const sourceProbe = await probe(options.video);
    const primaryVideo = sourceProbe.streams?.find(stream => stream.codec_type === 'video');
    const primaryAudio = sourceProbe.streams?.find(stream => stream.codec_type === 'audio');
    if (!primaryVideo) throw new Error('Primary source has no video stream.');
    if (!primaryAudio) throw new Error('Primary source has no audio stream; a dialogue mix cannot invent one.');
    const durationSec = Number(primaryAudio.duration ?? sourceProbe.format?.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Primary audio duration is unavailable.');
    if (options.sfx && !(await probe(options.sfx)).streams?.some(stream => stream.codec_type === 'audio')) throw new Error('Explicit SFX input has no audio stream.');
    const scratch = await fsp.mkdtemp(mixOutputPath(path.join(PROJECT_TMP, 'mix-')));
    result.diagnostics = scratch;
    const tmp = mixOutputPath(path.join(scratch, 'mixed.wav')), candidate = mixOutputPath(path.join(scratch, 'mastered.mp4'));
    result.sources = { video: { path: options.video, sha256: await hashFile(options.video) }, sfx: options.sfx ? { path: options.sfx, sha256: await hashFile(options.sfx) } : null };
    stage = 'stem_measurement';
    const detect = async (input, name, filter = 'astats=metadata=0:reset=0,volumedetect') => parseMixStemStats(await runFfmpeg(['-hide_banner', '-i', input, '-map', '0:a:0', '-vn', '-af', filter, '-f', 'null', '-'], path.join(scratch, `${name}.log`)));
    let denoiseSkipped = null;
    if (options.voice === 'denoise') {
      stage = 'voice_floor';
      const cached = await readCachedSilence(options.video);
      const spans = cached ? cached.spans : parseSilenceSpans(await runFfmpeg(['-hide_banner', '-i', options.video, '-map', '0:a:0', '-vn', '-af', `silencedetect=n=${VOICE_SILENCE.thresholdDb}dB:d=${VOICE_SILENCE.minDurSec}`, '-f', 'null', '-'], path.join(scratch, 'voice-silence.log')));
      const windows = selectFloorWindows(spans);
      const levels = [];
      for (const [index, w] of windows.entries()) {
        levels.push(parseRmsLevelDb(await runFfmpeg(['-hide_banner', '-ss', String(w.start), '-t', String(+(w.end - w.start).toFixed(3)), '-i', options.video, '-map', '0:a:0', '-vn', '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-'], path.join(scratch, `voice-floor-${index}.log`))));
      }
      const denoise = { ...decideDenoise(estimateNoiseFloorDb(levels), windows.length), spanSource: cached ? 'audio-cache' : 'measured', cacheFile: cached?.file ?? null, spansDetected: spans.length, windows: windows.map((w, index) => ({ ...w, rmsDb: Number.isFinite(levels[index]) ? +levels[index].toFixed(1) : null })) };
      result.voice.denoise = denoise;
      if (!denoise.apply) denoiseSkipped = { code: 'voice_denoise_skipped', reason: denoise.reason, measuredFloorDb: denoise.measuredFloorDb, thresholdDb: denoise.thresholdDb, message: `afftdn skipped (${denoise.reason}); the clean voice chain ran without it.` };
      onProgress(`voice floor ${denoise.measuredFloorDb ?? 'n/a'} dBFS over ${denoise.windowsUsed} pause window(s) [${denoise.spanSource}]; afftdn ${denoise.apply ? `at nf ${denoise.noiseFloorDb}` : `skipped (${denoise.reason})`}`);
      stage = 'stem_measurement';
    }
    const voiceChain = buildVoiceChain(options.voice, result.voice.denoise);
    result.voice.chain = voiceChain;
    const voice = await detect(options.video, 'voice', buildVoiceMeasureFilter(voiceChain));
    const effects = options.sfx ? await detect(options.sfx, 'effects') : null;
    const sfx = chooseMixSfxGain(voice, effects, options.under);
    result.stems = { voice, effects, sfx };
    result.sfxGainDb = sfx.gainDb;
    onProgress(`voice max ${voice.max} dB / mean ${voice.mean} dB; SFX ${sfx.status}${sfx.gainDb === null ? '' : `, gain ${sfx.gainDb} dB`}`);
    stage = 'stem_mix';


    const mixGraph = buildMixFilterGraph({ sfxMixed: sfx.status === 'mixed', sfxGain: sfx.gain, tighten: options.tighten, voiceChain });
    await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', options.video, ...(sfx.status === 'mixed' ? ['-i', options.sfx] : []), '-filter_complex', mixGraph, '-map', '[mix]', '-c:a', result.voice.intermediateCodec, tmp], path.join(scratch, 'mix.log'));
    stage = 'master_measurement';
    const pass1 = await runFfmpeg(['-hide_banner', '-i', tmp, '-af', `loudnorm=I=${options.lufs}:TP=${options.tp}:LRA=11:print_format=json`, '-f', 'null', '-'], path.join(scratch, 'measure-mix.log'));
    const measured = JSON.parse(pass1.slice(pass1.lastIndexOf('{'), pass1.lastIndexOf('}') + 1));
    const measuredI = Number(measured.input_i), measuredTP = Number(measured.input_tp);
    if (!Number.isFinite(measuredI) || !Number.isFinite(measuredTP)) throw new Error('Mix integrated loudness and true peak must be finite before gain correction.');
    const delta = +(options.lufs - measuredI).toFixed(2);
    const limiter = `volume=${delta}dB,alimiter=level_in=1:level_out=1:limit=${Math.pow(10, (options.tp - options.ceilPad) / 20).toFixed(4)}:attack=5:release=60:level=disabled`;
    result.mastering = { chain: 'measured volume correction + alimiter level=disabled', tighten: options.tighten, measuredLUFS: measuredI, measuredTruePeakDb: measuredTP, correctionDb: delta, limiterFilter: limiter, samplePeakPaddingDb: options.ceilPad };
    onProgress(`mix measured ${measuredI} LUFS / TP ${measuredTP}; applying ${delta} dB.`);
    stage = 'master_encode';
    await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', options.video, '-i', tmp, '-map', '0:v:0', '-map', '1:a:0', '-af', limiter, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart+negative_cts_offsets', candidate], path.join(scratch, 'master.log'));
    stage = 'delivery_measurement';
    const deliveredProbe = await probe(candidate);
    const deliveredAudio = deliveredProbe.streams.find(stream => stream.codec_type === 'audio');
    if (!deliveredAudio) throw new Error('Mastered output has no audio stream.');
    const deliveredDuration = Number(deliveredAudio.duration ?? deliveredProbe.format.duration);
    const delivered = parseMixLoudness(await runFfmpeg(['-hide_banner', '-i', candidate, '-map', '0:a:0', '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], path.join(scratch, 'verify.log')));
    Object.assign(result, assessMixDelivery(delivered, deliveredDuration, options), { delivered, durationSec: deliveredDuration });
    if (sfx.status === 'silent_bypassed') result.warnings.push({ code: 'silent_sfx_bypassed', message: 'The supplied SFX stem contains digital silence; it was bypassed without amplification.' });
    if (denoiseSkipped) result.warnings.push(denoiseSkipped);
    if (result.ok && result.warnings.length) result.status = 'passed_with_advisories';
    if (result.ok) {
      stage = 'publish';
      mixOutputPath(options.out);
      await fsp.mkdir(path.dirname(options.out), { recursive: true });
      await fsp.rename(candidate, options.out);
      result.published = true;
      result.outputSha256 = await hashFile(options.out);
      result.bytes = (await fsp.stat(options.out)).size;
    }
  } catch (error) {
    result.ok = false;
    result.status = 'failed';
    result.errors.push({ code: 'mix_processing_failed', stage, message: error.message });
  }
  if (result.diagnostics) await writeReport(path.join(result.diagnostics, 'mix-report.json'), result);
  if (options.reportFile) await writeReport(options.reportFile, result);
  return result;
}
