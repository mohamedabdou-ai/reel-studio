import './lib/project-tmp.mjs';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { parseArgs, ROOT, run, writeJson, readCachedJson } from './lib/media.mjs';
import { withOutputTransaction } from './lib/delivery.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';
import { getServeUrl, requireFromEngine, ENGINE } from './lib/bundle.mjs';
import { SPEC, levelFor, gopFrames, VUI_BSF, igCheck } from './lib/ig.mjs';
import { readRenderProps } from './lib/render-props.mjs';
import { renderBudget, freeBytes } from './lib/disk-report.mjs';
import { VOICE_MODES } from './lib/mix-contract.mjs';
import { plateGate, validateHeadFlags, headGatePlan, headCheckArgv, headGateResult, envelopeProblems, headBanner, installHeadEnvelope, readEnvelopeBack, headMethodConflict } from './lib/delivery-gates.mjs';

const args = parseArgs(process.argv.slice(2));
const comp = args._[0];
if (!comp) {
  console.error('Usage: node scripts/render.mjs <CompositionId> [--out x.mp4] [--preview|--deliver] [--frames a-b] [--props json] [--master] (delivery gates --motion-* / --head-*: see the header of scripts/render.mjs)');
  process.exit(1);
}

const mode = args.preview ? 'preview' : args.deliver || args.best ? 'deliver' : 'review';
if (args.preview && (args.deliver || args.best)) throw new Error('--preview and --deliver are mutually exclusive');


const HEAD = mode === 'deliver' ? await import('./lib/head-envelope.mjs') : null;
const headFlags = validateHeadFlags(args, { mode, comp, manifestComps: HEAD?.MANIFEST_GEOMETRY_COMPS ?? [] });
const faceReviewedBy = args['face-reviewed-by'] === undefined ? null : String(args['face-reviewed-by']).trim();
if (faceReviewedBy !== null && (mode !== 'deliver' || !faceReviewedBy || faceReviewedBy === 'true')) throw new Error('--face-reviewed-by <name> is a delivery option that records who looked at the face-check stills');
const PRESET = {
  preview: { scale: 0.5, crf: 28, x264Preset: 'ultrafast', jpegQuality: 60 },
  review: { scale: 1, crf: 17, x264Preset: 'medium', jpegQuality: 90 },
  deliver: { scale: 1, crf: 16, x264Preset: 'slow', jpegQuality: 95 },
}[mode];
const concurrency = args.concurrency ? (String(args.concurrency).endsWith('%') ? args.concurrency : Number(args.concurrency)) : 4;
const crf = args.crf ? Number(args.crf) : PRESET.crf;
const jpegQuality = args.jpeg ? Number(args.jpeg) : PRESET.jpegQuality;
const channel = args.channel ?? 'organic';
const inputProps = { ...await readRenderProps(args,{composition:comp}), __editorPreview: mode === 'preview' && !args['no-proxy'], __editorMediaEngine: args['media-engine'] === 'webcodecs' ? 'webcodecs' : 'offthread' };
if (mode === 'deliver' && (args['no-check'] || args.frames || inputProps.probe || inputProps.guides)) throw new Error('Delivery requires full-length source-quality output and all checks; preview/probe/guides/--frames/--no-check are not delivery options');
if ([args['motion-crop'],args['motion-plan'],args['motion-exempt']].filter(Boolean).length>1) throw new Error('Choose one motion check mode');
if (mode === 'deliver' && !args['motion-crop'] && !args['motion-plan'] && args['motion-exempt'] !== 'static-graphics') throw new Error('Delivery requires --motion-crop, --motion-plan for changing layouts, or --motion-exempt static-graphics for graphics-only work');
if (args['media-engine'] && !['webcodecs', 'offthread'].includes(args['media-engine'])) throw new Error('--media-engine must be offthread or webcodecs');


const voiceMode = args.voice === undefined ? 'off' : args.voice;
if (!VOICE_MODES.includes(voiceMode)) throw new Error(`--voice must be one of ${VOICE_MODES.join('|')}`);
if (voiceMode !== 'off' && !args.sfx) throw new Error('--voice runs inside the scripts/mix.mjs master, which render.mjs uses only with --sfx <stem.wav>; add the sound-design stem (every delivery carries one) or run scripts/mix.mjs --voice on the rendered file');

const VALID_CHANNELS = ['organic', 'ads', 'api'];
if (!VALID_CHANNELS.includes(channel)) { console.error(`--channel must be one of ${VALID_CHANNELS.join('|')}`); process.exit(1); }
const finalOut = assertProjectOutput(args.out ?? path.join(ENGINE, 'out', `${comp}${mode === 'preview' ? '-preview' : ''}.mp4`));
if (!['.mp4', '.mov'].includes(path.extname(finalOut).toLowerCase())) throw new Error('Render output must be .mp4 or .mov');
const published = await withOutputTransaction(finalOut, async (out) => {
const outParts = path.parse(out);
const raw = path.join(outParts.dir, `${outParts.name}.raw${outParts.ext || '.mp4'}`);

const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(1);
const log = (m) => process.stderr.write(`[render ${sec()}s] ${m}\n`);


const { serveUrl, hash, cached } = await getServeUrl({ force: !!args['force-bundle'], log });


const { renderMedia, selectComposition } = requireFromEngine('@remotion/renderer');
const composition = await selectComposition({ serveUrl, id: comp, inputProps, logLevel: 'warn' });
log(`composition ${comp}: ${composition.width}x${composition.height} @${composition.fps} fps, ${composition.durationInFrames} frames`);
if (mode === 'deliver' && composition.fps < SPEC.video.fps.organicMin) throw new Error(`Delivery fps ${composition.fps} is below ${SPEC.video.fps.organicMin}; use an approved delivery-rate composition`);






const warnings = [];
const plateDecision = plateGate({ comp, mode, props: composition.props, inputProps, noCheck: !!args['no-check'] });
for (const message of plateDecision.messages) log(`${{ ok: '', warn: 'WARN ', fail: 'REFUSED ' }[plateDecision.level]}plate guard: ${message}`);
if (plateDecision.level === 'warn') warnings.push(...plateDecision.messages.map((message) => `plate guard: ${message}`));
if (plateDecision.action === 'refuse') throw new Error(`Plate guard refused delivery: ${plateDecision.messages.join(' | ')}`);
if (plateDecision.action === 'check') {
  const guard = await run(process.execPath, [
    path.join(ROOT, 'scripts', 'plates.mjs'), 'check', '--fps', String(composition.fps),
    '--only', plateDecision.only.join(','),
  ], { allowFail: true, cwd: ROOT });
  let report = null;
  try { report = JSON.parse(guard.stdout); } catch {                   }
  const hard = (report?.problems ?? []).filter((p) => !p.warn);
  if (!guard.ok || hard.length) {
    console.error('Plate guard failed:\n' + JSON.stringify(hard.length ? hard : guard.stderr, null, 2));
    throw new Error('Plate guard failed');
  }
  const soft = (report?.problems ?? []).filter((p) => p.warn);
  if (soft.length) log(`plate guard: ${soft.length} warning(s): ${soft.map((p) => `${p.plate}: ${p.problem}`).join(' | ')}`);
}


let frameRange = null;
if (args.frames) {
  const m = String(args.frames).match(/^(\d+)-(\d+)$/);
  if (!m) throw new Error('--frames expects a-b');
  frameRange = [Number(m[1]), Number(m[2])];
  if (frameRange[1] < frameRange[0] || frameRange[1] >= composition.durationInFrames) throw new Error('--frames must be inside the composition');
}


if (mode !== 'preview') {
  const budget = renderBudget({ frames: frameRange ? frameRange[1] - frameRange[0] + 1 : composition.durationInFrames, freeRamBytes: os.freemem(), freeDiskBytes: freeBytes(ROOT), width: composition.width, height: composition.height, png: !!args.png });
  log(`budget: ${budget.message}`);
  if (!budget.ok && !args['no-budget-check']) throw new Error(`Not enough disk for this render. ${budget.message} Free space (node scripts/disk-report.mjs --clean), close other renders, or pass --no-budget-check.`);
}


let safe = null;
let head = null;
if (mode === 'deliver') {
  const step = Number(args['safe-step'] ?? 0.5);
  if (!(step > 0 && step <= 0.5)) throw new Error('--safe-step must be positive and <= 0.5 seconds for delivery');
  const safeDir = assertProjectOutput(`${out}.checks`);
  const propsFile = `${out}.props.json`;
  await writeJson(propsFile,inputProps);
  const checked = await run(process.execPath, [path.join(ROOT, 'scripts/safe-check.mjs'), '--comp', comp, '--props-file', propsFile, '--step', String(step), '--out', safeDir,
    ...(channel === 'ads' ? ['--strict-ads'] : []), ...(args['safe-bands'] ? ['--bands', path.resolve(args['safe-bands'])] : [])], { cwd: ROOT, allowFail: true });
  if (!checked.ok) throw new Error(`Safe-zone gate failed: ${checked.stderr.slice(-1600)} ${checked.stdout.slice(-1000)}`);
  safe = { ok: true, directory: `${finalOut}.checks`, stepSec: step };





  const headInputs = {
    ...headFlags,
    geometry: headFlags.geometry ? path.resolve(headFlags.geometry) : null,
    source: headFlags.source ? path.relative(ROOT, path.resolve(headFlags.source)).split(path.sep).join('/') : null,
  };
  const plan = headGatePlan({ comp, flags: headInputs, footageMounted: plateDecision.only.length > 0, manifestComps: HEAD.MANIFEST_GEOMETRY_COMPS, presenter: composition.props?.edit?.presenter !== false });
  head = { status: plan.status, ran: plan.run, reason: plan.reason, directory: null, exitCode: null, counts: null, envelope: null };
  if (plan.run) {
    const installed = headInputs.envelope ? await installHeadEnvelope(path.resolve(headInputs.envelope), HEAD) : null;
    if (installed) {
      const conflict = headMethodConflict({ requested: headInputs.method, installedMethod: installed.provided.method });
      if (conflict) throw new Error(conflict);
    }




    const argvFlags = installed ? { ...headInputs, method: installed.provided.method } : headInputs;
    const headDir = path.join(safeDir, 'head');
    const argv = headCheckArgv({ script: path.join(ROOT, 'scripts', 'head-check.mjs'), comp, propsFile, outDir: headDir, plan, flags: argvFlags });
    log(`head gate: scripts/head-check.mjs ${plan.geometryArgs[0]}${installed ? ` against ${path.relative(ROOT, installed.source)}` : ''}`);
    const ran = await runNode(argv);
    const checked = await readCachedJson(path.join(headDir, 'report.json'));
    const outcome = headGateResult({ exitCode: ran.code, report: checked, exitCodes: HEAD.HEAD_EXIT, reviewedBy: faceReviewedBy });
    const problems = installed ? envelopeProblems({ provided: installed.provided, report: checked, cachedAfter: await readEnvelopeBack(installed.target, HEAD) }) : [];
    head = {
      status: problems.length ? 'ERROR' : outcome.status,
      ran: true,
      reason: [outcome.reason, ...problems].filter(Boolean).join('; ') || null,
      directory: path.join(`${finalOut}.checks`, 'head'),
      exitCode: ran.code,
      reviewedBy: faceReviewedBy,
      counts: outcome.counts,
      envelope: checked?.envelope ? { ...checked.envelope, provided: installed ? path.relative(ROOT, installed.source).split(path.sep).join('/') : null, installedToCache: installed ? installed.installed : false } : null,
    };
    if (outcome.block || problems.length) {
      const kept = assertProjectOutput(`${finalOut}.head-check`);
      await fs.rm(kept, { recursive: true, force: true });
      if (await fs.stat(headDir).catch(() => null)) await fs.cp(headDir, kept, { recursive: true });
      if (ran.stdout.trim()) process.stderr.write(`${ran.stdout.slice(-2000)}\n`);
      throw new Error(`Head keep-out gate ${head.status}: ${head.reason}. Evidence: ${kept}`);
    }
  }
  if (head.status === 'NEEDS-REVIEW') {
    warnings.push(`head keep-out NEEDS-REVIEW: ${head.reason}`);
    process.stderr.write(`\n${headBanner(head, head.directory)}\n\n`);
  } else log(`head gate: ${head.status}${head.reason ? ` — ${head.reason}` : ''}`);
}


const fps = composition.fps;
const gop = gopFrames(fps);
const level = levelFor(fps);
const igOverride = ({ args: ffArgs }) => {
  const i = ffArgs.indexOf('-c:v');
  if (i === -1 || ffArgs[i + 1] !== 'libx264') return ffArgs;
  const outPath = ffArgs[ffArgs.length - 1];
  const head = ffArgs.slice(0, -1);
  const extra = ['-profile:v', 'high', '-level', level, '-keyint_min', String(gop), '-sc_threshold', '0'];
  if (!head.includes('-g')) extra.push('-g', String(gop));
  return [...head, ...extra, outPath];
};

log(`mode ${mode}: crf ${crf}, x264 ${PRESET.x264Preset}, jpeg ${jpegQuality}, scale ${PRESET.scale}, concurrency ${concurrency}, gop ${gop}, level ${level}`);
let lastPct = -5;
const renderStart = Date.now();
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: raw,
  inputProps,
  overwrite: true,
  concurrency,
  scale: PRESET.scale,
  crf,
  x264Preset: PRESET.x264Preset,






  ...(args.png ? { imageFormat: 'png' } : { jpegQuality, imageFormat: 'jpeg' }),
  pixelFormat: 'yuv420p',
  colorSpace: 'bt709',
  audioCodec: 'aac',
  audioBitrate: `${SPEC.video.audio.renderKbps}k`,
  enforceAudioTrack: true,
  muted: !!args.muted,
  frameRange,
  ...(mode === 'deliver' ? { encodingMaxRate: SPEC.video.bitrate.vbvMaxrate, encodingBufferSize: SPEC.video.bitrate.vbvBufsize } : {}),
  ffmpegOverride: igOverride,
  logLevel: 'warn',
  onProgress: ({ progress, renderedFrames, encodedFrames }) => {
    const pct = Math.floor(progress * 100);
    if (pct >= lastPct + 5 || pct === 100) {
      lastPct = pct;
      const elapsed = (Date.now() - renderStart) / 1000;
      const fpsNow = renderedFrames / Math.max(0.001, elapsed);
      log(`${pct}%  rendered ${renderedFrames}  encoded ${encodedFrames}  ${fpsNow.toFixed(2)} fps`);
    }
  },
});
const renderSec = +((Date.now() - renderStart) / 1000).toFixed(1);
const rawStat = await fs.stat(raw).catch(() => null);
if (!rawStat || rawStat.size === 0) throw new Error(`Render reported success but ${raw} is missing or empty.`);


let master = null;
const finalizeStart = Date.now();


const MOV = '+faststart+negative_cts_offsets';
const fail = (what, r) => { throw new Error(`${what} (ffmpeg exit ${r.code}):\n` + r.buf.slice(-1500)); };
let masterMode = args.master && !args.sfx ? 'loudnorm' : 'copy';
let meas = null;
if (args.master && !args.sfx) {
  const COMP = args.compress ? 'acompressor=threshold=-24dB:ratio=2:attack=10:release=220,' : '';
  const TARGET = { I: SPEC.video.loudness.integratedLUFS, TP: SPEC.video.loudness.truePeakDBTP, LRA: 7 };
  const probe = await ffmpeg(['-hide_banner', '-nostats', '-i', raw, '-af', `${COMP}loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-']);
  if (probe.code !== 0) fail('loudnorm measurement', probe);
  const m = probe.buf.match(/\{[^{}]*"target_offset"[^{}]*\}/);
  if (!m) throw new Error('loudnorm measurement failed:\n' + probe.buf.slice(-1500));
  meas = JSON.parse(m[0]);
  if (!Number.isFinite(Number(meas.input_i))) {

    log(`master: measured I=${meas.input_i} LUFS (silent track) — skipping loudnorm, copying audio`);
    masterMode = 'copy';
  } else {
    const norm = [`measured_I=${meas.input_i}`, `measured_TP=${meas.input_tp}`, `measured_LRA=${meas.input_lra}`, `measured_thresh=${meas.input_thresh}`, `offset=${meas.target_offset}`, 'linear=true', 'print_format=json'].join(':');
    const applied = await ffmpeg([
      '-hide_banner', '-nostats', '-y', '-i', raw,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'copy', '-bsf:v', VUI_BSF,
      '-af', `${COMP}loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:${norm}`,
      '-c:a', 'aac', '-b:a', `${SPEC.video.audio.renderKbps}k`, '-ar', String(SPEC.video.audio.sampleRateHz),
      '-movflags', MOV, out,
    ]);
    if (applied.code !== 0 || !(await fs.stat(out).catch(() => null))) fail('audio master', applied);


    const m2 = applied.buf.match(/\{[^{}]*"normalization_type"[^{}]*\}/);
    const normType = m2 ? JSON.parse(m2[0]).normalization_type : 'unknown';
    if (normType !== 'linear') log(`WARN master: loudnorm used ${normType} normalisation (not linear) — the mix breathed to fit TP ${TARGET.TP}`);
    master = { measuredLUFS: Number(meas.input_i), measuredTP: Number(meas.input_tp), target: TARGET, normalization: normType };
  }
}




const sfxStem = args.sfx ? path.resolve(String(args.sfx)) : null;
if (sfxStem && !(await fs.stat(sfxStem).catch(() => null))) throw new Error(`--sfx stem not found: ${sfxStem}`);
if (sfxStem && args.master) log('NOTE: --sfx implies the mix.mjs master; --master (loudnorm) is skipped');
let mix = null;
if (masterMode === 'copy' || sfxStem) {
  const target = sfxStem ? path.join(outParts.dir, `${outParts.name}.vo${outParts.ext || '.mp4'}`) : out;
  const applied = await ffmpeg(['-hide_banner', '-nostats', '-y', '-i', raw, '-map', '0', '-c', 'copy', '-bsf:v', VUI_BSF, '-movflags', MOV, target]);
  if (applied.code !== 0 || !(await fs.stat(target).catch(() => null))) fail('finalize', applied);
  if (sfxStem) {
    const mixOut = await new Promise((resolve) => {
      const mixArgs = [path.join(ROOT, 'scripts', 'mix.mjs'), '--video', target, '--sfx', sfxStem, '--out', out];
      if(comp==='PreparedEdit' && inputProps.edit?.style) mixArgs.push('--style',inputProps.edit.style);
      if (args.tighten) mixArgs.push('--tighten', '1');
      if (args['sfx-under'] !== undefined) mixArgs.push('--under', String(args['sfx-under']));
      if (args['audio-ceil-pad'] !== undefined) mixArgs.push('--ceilPad', String(args['audio-ceil-pad']));
      if (voiceMode !== 'off') mixArgs.push('--voice', voiceMode);
      if (args.lufs) mixArgs.push('--lufs', String(args.lufs));
      const child = spawn(process.execPath, mixArgs, { windowsHide: true });
      let so = '', se = '';
      child.stdout.on('data', (d) => { so += d; });
      child.stderr.on('data', (d) => { se += d; });
      child.on('close', (code) => resolve({ code: code ?? 1, so, se }));
      child.on('error', (err) => resolve({ code: 127, so: '', se: String(err) }));
    });
    process.stderr.write(mixOut.se);
    if (mixOut.code !== 0 || !(await fs.stat(out).catch(() => null))) throw new Error(`sfx mix failed (exit ${mixOut.code}):\n${mixOut.so.slice(-1800)}\n${mixOut.se.slice(-1500)}`);
    try { mix = JSON.parse(mixOut.so.slice(mixOut.so.indexOf('{'))); } catch { mix = { raw: mixOut.so.slice(-500) }; }
    await fs.rm(target, { force: true });
  }
}
await fs.rm(raw, { force: true });
const finalizeSec = +((Date.now() - finalizeStart) / 1000).toFixed(1);

const stat = await fs.stat(out).catch(() => null);
if (!stat || stat.size === 0) throw new Error(`Output ${out} is missing or empty.`);


let check = null;
if (mode !== 'preview' && !args['no-check']) {
  const rep = await igCheck(out, { channel, withLoudness: true });
  check = { ok: rep.ok, fails: rep.fails, warnings: rep.warnings, summary: rep.summary };
  for (const c of rep.checks) if (c.level !== 'pass') log(`${c.level.toUpperCase()} ${c.id}: ${c.actual} → ${c.expected}`);
}

if (check && !check.ok) throw new Error(`Encode QC failed: ${check.fails.join(', ')}`);
let motion = null;
if (mode === 'deliver' && (args['motion-crop'] || args['motion-plan'])) {
  const motionArgs=args['motion-plan']?['--plan',path.resolve(String(args['motion-plan']))]:['--crop',String(args['motion-crop'])];
  const checked = await run(process.execPath, [path.join(ROOT, 'scripts/motion-check.mjs'), '--video', out, ...motionArgs], { cwd: ROOT, allowFail: true });
  if (!checked.ok) throw new Error(`Motion QC failed: ${checked.stderr.slice(-1500)} ${checked.stdout.slice(-1000)}`);
  motion = JSON.parse(checked.stdout);
  motion.video = finalOut;
} else if (mode === 'deliver') motion = { exempt: 'static-graphics', presenterChecked: false };
const digest = createHash('sha256');
for await (const chunk of createReadStream(out)) digest.update(chunk);
const report = { ok: true, comp, mode, out: finalOut, bytes: stat.size, outputSha256: digest.digest('hex'), bundle: { hash, cached }, frames: frameRange ?? [0, composition.durationInFrames - 1], timing: { renderSec, finalizeSec, totalSec: +sec() }, master, sfx: sfxStem ? { stem: sfxStem, mix } : null, igCheck: check, safe, motion, plates: plateDecision, head, warnings, inputProps, mediaSelection:composition.props.__editorMediaSelection??null };
await writeJson(`${out}.qc.json`, report);
return report;
}, { sidecars: ['.qc.json', ...(mode === 'deliver' ? ['.checks'] : [])] });
console.log(JSON.stringify(published, null, 2));
if (mode === 'deliver') await fs.rm(assertProjectOutput(`${finalOut}.head-check`), { recursive: true, force: true });
if (published.head?.status === 'NEEDS-REVIEW') process.stderr.write(`\n${headBanner(published.head, published.head.directory)}\n`);


function ffmpeg(ffArgs) {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ffArgs, { windowsHide: true });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.stderr.on('data', (d) => { buf += d; });
    child.on('close', (code) => resolve({ code: code ?? 1, buf }));
    child.on('error', (err) => resolve({ code: 127, buf: String(err) }));
  });
}


function runNode(argv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', (code) => resolve({ code, stdout }));
    child.on('error', (err) => resolve({ code: null, stdout: String(err) }));
  });
}
