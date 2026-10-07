import './project-tmp.mjs';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ROOT } from './media.mjs';
import { WHISPER_RUNTIME_FILE, inspectWhisperRuntime, resolveWhisperModel } from './transcription-install.mjs';
import {
  TRANSCRIPTION_SCHEMA, sha256File, transcriptionCacheKey, planTranscriptionChunks,
  mergeTranscriptionChunks, captionsToSrt, assertTranscriptionOutputPath,
  writeTranscriptionJson, writeTranscriptionCache, readTranscriptionCache,
} from './transcription.mjs';

const execute = promisify(execFile);
const OPTIONS = new Set(['_', 'media', 'lang', 'model', 'out', 'start', 'duration', 'chunk-seconds', 'overlap-seconds', 'threads', 'vad', 'backend', 'timing', 'force', 'help']);
const number = (value, name, min, max, fallback) => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || value === true) throw new Error(`Invalid --${name}. Expected ${min} to ${max}.`);
  return parsed;
};

export function normalizeTranscriptionOptions(args) {
  for (const key of Object.keys(args)) if (!OPTIONS.has(key)) throw new Error(`Unknown option --${key}. Dialogue transformations are unsupported.`);
  if (typeof args.media !== 'string' || !args.media.trim()) throw new Error('--media must name an existing source file.');
  if (args.backend !== undefined && args.backend !== 'cpu') throw new Error('Only the verified CPU backend is supported.');
  if (args.timing !== undefined && !['token', 'dtw'].includes(args.timing)) throw new Error('--timing accepts token or dtw.');
  if (args.vad !== undefined && ![true, false, 'on', 'off'].includes(args.vad)) throw new Error('--vad accepts on or off.');
  const chunkMs = Math.round(number(args['chunk-seconds'], 'chunk-seconds', 2, 30, 14) * 1000);
  const overlapMs = Math.round(number(args['overlap-seconds'], 'overlap-seconds', 0, 10, 2) * 1000);
  if (overlapMs >= chunkMs) throw new Error('Overlap must be smaller than the chunk.');
  const startMs = Math.round(number(args.start, 'start', 0, 86400, 0) * 1000);
  const durationMs = args.duration === undefined ? null : Math.round(number(args.duration, 'duration', 0.1, 86400, 1) * 1000);
  const threads = number(args.threads, 'threads', 1, 12, 4);
  if (!Number.isInteger(threads)) throw new Error('--threads must be an integer.');
  const language = args.lang ?? 'ar';
  if (typeof language !== 'string' || !/^(auto|[a-z]{2,3})$/i.test(language)) throw new Error('Invalid language code.');
  if (args.out !== undefined && typeof args.out !== 'string') throw new Error('--out requires a project-local directory.');
  return { media: path.resolve(args.media), outDir: args.out === undefined ? null : assertTranscriptionOutputPath(args.out), model: args.model ?? 'medium', language: language.toLowerCase(), startMs, durationMs, chunkMs, overlapMs, threads, timing: args.timing ?? 'token', vad: args.vad === true || args.vad === 'on', force: args.force === true, backend: 'cpu' };
}

export async function readTranscriptionChunk(directory, identity) {
  assertTranscriptionOutputPath(directory);
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(directory, 'chunk-manifest.json'), 'utf8'));
    if (manifest.cacheKey !== transcriptionCacheKey(identity)) return null;
    const resultFile = assertTranscriptionOutputPath(path.join(directory, 'chunk-result.json'));
    if (await sha256File(resultFile) !== manifest.sha256) return null;
    const result = JSON.parse(await fsp.readFile(resultFile, 'utf8'));
    return Array.isArray(result.raw?.transcription) ? result : null;
  } catch { return null; }
}

export async function writeTranscriptionChunk(directory, identity, result) {
  const file = path.join(directory, 'chunk-result.json');
  await writeTranscriptionJson(file, result);
  await writeTranscriptionJson(path.join(directory, 'chunk-manifest.json'), { schema: TRANSCRIPTION_SCHEMA, cacheKey: transcriptionCacheKey(identity), identity, sha256: await sha256File(file) });
}

export async function runTranscriptionCommand(executable, args, logFile, { timeout = 120000 } = {}) {
  assertTranscriptionOutputPath(logFile);
  const log = await fsp.open(logFile, 'w');
  try {
    await new Promise((resolve, reject) => {

      const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', log.fd, log.fd], timeout, cwd: ROOT, env: process.env });
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(Object.assign(new Error('Command failed'), { code, signal })));
    });
  } catch (error) {
    throw new Error(`${path.basename(executable)} failed (${error.code ?? error.signal ?? 'unknown'}). See ${logFile}.`, { cause: error });
  } finally { await log.close(); }
}

async function probeAudio(ffprobe, media) {
  const { stdout } = await execute(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_streams', '-show_format', '-of', 'json', media], { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: process.env });
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  if (!stream) throw new Error(`No audio stream in ${path.basename(media)}.`);
  const durationMs = Math.round(Number(stream.duration ?? probe.format?.duration) * 1000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('Audio duration is unavailable or invalid.');
  return { durationMs, sampleRate: Number(stream.sample_rate), channels: stream.channels, codec: stream.codec_name };
}

export function whisperArguments({ options, runtime, model, wav, outputPrefix }) {


  const args = ['-m', model.path, '-f', wav, '-l', options.language, '-t', String(options.threads), '--no-gpu', '--no-flash-attn', '--output-json-full', '--output-file', outputPrefix, '--max-len', '1', '--split-on-word'];
  if (options.timing === 'dtw') args.push('--dtw', options.model.replaceAll('-', '.'));
  if (options.vad) args.push('--vad', '--vad-model', runtime.vad.path);
  return args;
}

export async function transcriptionCodeIdentity({
  decoder = path.join(ROOT, 'scripts/lib/transcription-run.mjs'),
  converter = path.join(ROOT, 'scripts/lib/transcription.mjs'),
  wrapper = path.join(ROOT, 'engine/tools/transcribe.mjs'),
} = {}) {
  const [decoderSha256, converterSha256, wrapperSha256] = await Promise.all([sha256File(decoder), sha256File(converter), sha256File(wrapper)]);
  return {
    decode: { decoderSources: { 'scripts/lib/transcription-run.mjs': decoderSha256 } },
    conversion: { conversionSources: { 'scripts/lib/transcription.mjs': converterSha256, 'engine/tools/transcribe.mjs': wrapperSha256 } },
  };
}

async function transcribeChunk({ chunk, identity, options, runtime, model, ffmpeg, ffprobe, onProgress }) {
  const directory = assertTranscriptionOutputPath(path.join(ROOT, 'state', 'cache', 'transcript-chunks', transcriptionCacheKey(identity)));
  const existing = options.force ? null : await readTranscriptionChunk(directory, identity);
  if (existing) return { ...existing, chunk, cached: true, cacheDir: directory };
  await fsp.mkdir(directory, { recursive: true });
  const attempt = path.join(directory, `attempt-${randomUUID()}`);
  await fsp.mkdir(attempt);
  const startedAt = performance.now();
  const durationMs = chunk.endMs - chunk.startMs;
  const wav = path.join(attempt, 'audio-16k.wav');
  onProgress(`Chunk ${chunk.index + 1}: ${chunk.startMs / 1000}-${chunk.endMs / 1000}s, ${options.threads} CPU threads.`);
  await runTranscriptionCommand(ffmpeg, ['-hide_banner', '-nostdin', '-y', '-i', options.media, '-ss', (chunk.startMs / 1000).toFixed(3), '-t', (durationMs / 1000).toFixed(3), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], path.join(attempt, 'ffmpeg.log'));
  const converted = await probeAudio(ffprobe, wav);
  if (converted.codec !== 'pcm_s16le' || converted.sampleRate !== 16000 || converted.channels !== 1 || Math.abs(converted.durationMs - durationMs) > 50) throw new Error(`Chunk audio does not match 16 kHz mono PCM or its requested duration: ${wav}.`);
  const outputPrefix = path.join(attempt, 'whisper');
  const cliArgs = whisperArguments({ options, runtime, model, wav, outputPrefix });
  await runTranscriptionCommand(runtime.executable, cliArgs, path.join(attempt, 'whisper.log'), { timeout: 20 * 60000 });
  const raw = JSON.parse(await fsp.readFile(`${outputPrefix}.json`, 'utf8'));
  if (!Array.isArray(raw.transcription)) throw new Error(`Whisper did not produce valid JSON: ${outputPrefix}.json.`);
  const result = { raw, durationMs, elapsedMs: Math.round(performance.now() - startedAt), command: { executable: runtime.executable, args: cliArgs }, rawFile: `${outputPrefix}.json`, logFile: path.join(attempt, 'whisper.log'), audioFile: wav };
  await writeTranscriptionChunk(directory, identity, result);
  return { ...result, chunk, cached: false, cacheDir: directory };
}

export async function transcribeMedia(args, { onProgress = message => console.error(message) } = {}) {
  const startTime = performance.now();
  const options = normalizeTranscriptionOptions(args);
  const source = await fsp.realpath(options.media);
  const relative = path.relative(await fsp.realpath(ROOT), source);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Source must be an existing project-local file.');
  const sourceStat = await fsp.stat(source);
  if (!sourceStat.isFile()) throw new Error('Source is not a file.');
  options.media = source;
  if (options.outDir && path.relative(options.outDir, source) === '') throw new Error('Output directory cannot be the input file.');
  let runtime;
  try { runtime = JSON.parse(await fsp.readFile(WHISPER_RUNTIME_FILE, 'utf8')); } catch { throw new Error('Modern whisper.cpp is not installed. Run node engine/tools/install-whisper.mjs --with-vad.'); }
  const toolsDir = path.join(ROOT, 'Tools', 'bin');
  const ffmpeg = path.join(toolsDir, 'ffmpeg.exe'), ffprobe = path.join(toolsDir, 'ffprobe.exe');
  if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) throw new Error('Project-local Tools/bin/ffmpeg.exe and ffprobe.exe are required.');
  onProgress('Hashing source and model; checking the installed CPU runtime.');
  const [sourceSha256, model, actualRuntime, audioProbe, ffmpegSha256] = await Promise.all([
    sha256File(source), resolveWhisperModel(options.model), inspectWhisperRuntime(runtime.directory, { expectedBinaryFiles: runtime.binaryFiles }), probeAudio(ffprobe, source), sha256File(ffmpeg),
  ]);
  runtime = { ...runtime, ...actualRuntime };
  if (options.vad && (!runtime.capabilities.vadFlag || !runtime.vad?.path || !fs.existsSync(runtime.vad.path))) throw new Error('VAD model is unavailable. Run node engine/tools/install-whisper.mjs --with-vad.');
  const vadSha256 = options.vad ? await sha256File(runtime.vad.path) : null;
  if (options.vad && vadSha256 !== runtime.vad.sha256) throw new Error('VAD model hash changed since installation.');
  if (options.startMs >= audioProbe.durationMs) throw new Error('--start is outside the audio duration.');
  const durationMs = options.durationMs ?? (audioProbe.durationMs - options.startMs);
  if (options.startMs + durationMs > audioProbe.durationMs + 20) throw new Error('Requested range exceeds audio duration.');
  const duration = Math.min(durationMs, audioProbe.durationMs - options.startMs);
  const codeIdentity = await transcriptionCodeIdentity();
  const decodeIdentity = {
    sourceSha256, modelSha256: model.sha256, runtimeSha256: transcriptionCacheKey(actualRuntime.binaryFiles), ffmpegSha256,
    options: { model: options.model, language: options.language, threads: options.threads, backend: 'cpu', timing: options.timing, flashAttention: false, maxLength: 1, splitOnWord: true, vad: options.vad, vadSha256 },
    ...codeIdentity.decode,
  };


  const identity = { ...decodeIdentity, ...codeIdentity.conversion, range: { startMs: options.startMs, durationMs: duration, chunkMs: options.chunkMs, overlapMs: options.overlapMs } };
  const cacheKey = transcriptionCacheKey(identity);
  const cacheDir = assertTranscriptionOutputPath(path.join(ROOT, 'state', 'cache', 'transcripts', cacheKey));
  const outDir = options.outDir ?? cacheDir;
  const cached = options.force ? null : await readTranscriptionCache(cacheDir, identity);
  if (cached) {
    if (outDir !== cacheDir) await writeTranscriptionCache(outDir, identity, cached);
    return { ok: cached.report.srtValid, cached: true, outDir, cacheDir, cacheKey, words: cached.captions.length, srtCues: cached.report.srtCues, requiresReview: cached.report.requiresReview, elapsedMs: Math.round(performance.now() - startTime), report: cached.report };
  }
  const chunks = planTranscriptionChunks({ startMs: options.startMs, durationMs: duration, chunkMs: options.chunkMs, overlapMs: options.overlapMs });
  const results = [];
  for (const chunk of chunks) results.push(await transcribeChunk({ chunk, identity: { ...decodeIdentity, startMs: chunk.startMs, endMs: chunk.endMs }, options, runtime, model, ffmpeg, ffprobe, onProgress }));
  const sourceAfter = await fsp.stat(source);
  if (sourceAfter.size !== sourceStat.size || sourceAfter.mtimeMs !== sourceStat.mtimeMs) throw new Error('Source changed during transcription; cached output was not promoted.');
  const merged = mergeTranscriptionChunks(results);
  if (options.timing === 'token') merged.issues.push({ code: 'estimated_token_timing', message: 'Word boundaries are whisper token estimates, not forced alignment. Listen and correct timing before editorial use.' });
  let srt = '', srtCues = 0, srtValid = true;
  try { const exported = captionsToSrt(merged.captions); srt = exported.srt; srtCues = exported.cues; }
  catch (error) { srtValid = false; merged.issues.push({ code: 'srt_invalid_timing', message: error.message }); }
  const systemInfo = [...new Set(results.map(result => result.raw.systeminfo).filter(Boolean))];
  const report = {
    schema: TRANSCRIPTION_SCHEMA, status: 'draft', transcriptVerified: false,
    policy: 'Unverified ASR hypotheses. The pipeline preserves decoded text without translation, rewriting, spelling normalization or dialogue repair. Recognition can mishear or hallucinate words; listen and review before editorial use.',
    confidence: { method: 'minimum token probability within each word', calibrated: false, reviewThreshold: 0.6 },
    timeBasis: 'absolute milliseconds from the original source; --start never resets captions to zero',
    source: { path: source, sha256: sourceSha256, audioDurationMs: audioProbe.durationMs, selectedStartMs: options.startMs, selectedDurationMs: duration },
    runtime: { releaseTag: runtime.releaseTag, binaryVersion: runtime.binaryVersion, executable: runtime.executable, model: options.model, modelPath: model.path, modelSha256: model.sha256, threads: options.threads, timingMethod: options.timing === 'dtw' ? 'whisper-dtw' : 'whisper-token-estimates', backend: 'cpu', systemInfo,
      openvinoCompiled: systemInfo.some(info => /OPENVINO\s*=\s*1/.test(info)),
      openvinoActivated: false, vad: options.vad, vadModelSha256: vadSha256 },
    cacheKey, chunks: results.map(result => ({ ...result.chunk, cached: result.cached, elapsedMs: result.elapsedMs, rawFile: result.rawFile, logFile: result.logFile, audioFile: result.audioFile })),
    elapsedMs: Math.round(performance.now() - startTime), words: merged.captions.length, srtCues, srtValid,
    requiresReview: true, issues: merged.issues, excludedOverlap: merged.excludedOverlap, rejected: merged.rejected,
  };
  const raw = { format: 'whisper.cpp-chunks-v1', source: report.source, chunks: results.map(result => ({ chunk: result.chunk, raw: result.raw })) };
  const outputs = { raw, captions: merged.captions, srt, report };
  await writeTranscriptionCache(cacheDir, identity, outputs);
  if (outDir !== cacheDir) await writeTranscriptionCache(outDir, identity, outputs);
  return { ok: srtValid, cached: false, outDir, cacheDir, cacheKey, words: merged.captions.length, srtCues, requiresReview: report.requiresReview, elapsedMs: report.elapsedMs, report };
}
