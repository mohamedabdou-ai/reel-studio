import './lib/project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs, ROOT, run, writeJson } from './lib/media.mjs';
import { getServeUrl, requireFromEngine } from './lib/bundle.mjs';
import { readRenderProps } from './lib/render-props.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';
import { editManifestSchema } from '../engine/src/prepared-edit/schema.ts';
import { compileEdit } from '../engine/src/prepared-edit/timeline.ts';
import { foregroundSourceFrame } from '../engine/src/prepared-edit/visibility.ts';
import {
  HEAD_CHECK_DEFAULTS, HEAD_EXIT, MANIFEST_GEOMETRY_COMPS, buildHeadEnvelope, headBoxAt, mapHeadRect, headWindowCut,
  manifestFrameState, normalizeGeometryFile, headCheckLandings, probeFrameStats, probeDiffInRect, classifyHeadFrame,
  overallHeadStatus, pickSheetFrames,
} from './lib/head-envelope.mjs';
import { splitCanvasHeightFor } from './lib/head-guide.mjs';

const PROBES = ['#00FF00', '#FF00FF'];
const SHEET_SCALE = 0.25;
const CHUNK = 48;
const USAGE = 'Usage: node scripts/head-check.mjs --comp <id> --props-file <file> [--out dir] [--method auto|blazeface] [--envelope-every N] [--rebuild-envelope] [--geometry file | --manifest-geometry] [--source file] [--from-frame N] [--to-frame N] [--stride 1] [--scale 0.25] [--min-alpha 0.1] [--min-area 16] [--concurrency 3]\n       node scripts/head-check.mjs --envelope-only --source <file> [--method auto|blazeface] [--rebuild-envelope]';
class UsageError extends Error {}
class ContractError extends Error {}
const log = (message) => process.stderr.write(`${message}\n`);
const rel = (file) => (file ? path.relative(ROOT, file).split(path.sep).join('/') : null);

const args = parseArgs(process.argv.slice(2));
const option = (key, fallback) => (args[key] === undefined ? fallback : Number(args[key]));
const SCALE = option('scale', HEAD_CHECK_DEFAULTS.scale);
const MIN_ALPHA = option('min-alpha', HEAD_CHECK_DEFAULTS.minAlpha);
const MIN_AREA = option('min-area', HEAD_CHECK_DEFAULTS.minAreaPx2);
const STRIDE = option('stride', HEAD_CHECK_DEFAULTS.stride);
const CONCURRENCY = option('concurrency', HEAD_CHECK_DEFAULTS.concurrency);
const METHOD = args.method === undefined ? 'auto' : String(args.method);
const MATTE = typeof args.matte === 'string' ? args.matte : null;
const EVERY = args['envelope-every'] === undefined ? null : Number(args['envelope-every']);

function validateOptions() {
  if (![0.25, 0.5, 1].includes(SCALE)) throw new UsageError('--scale must be 0.25, 0.5 or 1 (sizes Chrome renders exactly).');
  if (!(MIN_ALPHA > 0 && MIN_ALPHA <= 1)) throw new UsageError('--min-alpha must be in (0, 1].');
  if (!(MIN_AREA > 0)) throw new UsageError('--min-area must be a positive number of full-resolution px².');
  if (!Number.isInteger(STRIDE) || STRIDE < 1) throw new UsageError('--stride must be a positive integer.');
  if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 8) throw new UsageError('--concurrency must be 1-8.');
  if (!['auto', 'blazeface'].includes(METHOD)) throw new UsageError('--method must be auto or blazeface.');
  if (MATTE !== null) throw new UsageError('--matte is not part of this edition; the head envelope comes from BlazeFace.');
  if (EVERY !== null && (!Number.isInteger(EVERY) || EVERY < 1)) throw new UsageError('--envelope-every must be a positive integer.');
}


function decodePngs(pngs, w, h) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png', '-i', 'pipe:0',
      '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true });
    const chunks = [];
    let stderr = '';
    ff.stdout.on('data', (chunk) => chunks.push(chunk));
    ff.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      const all = Buffer.concat(chunks), size = w * h * 3;
      if (code !== 0 || all.length !== size * pngs.length) {
        reject(new ContractError(`probe decode returned ${(all.length / size).toFixed(2)} of ${pngs.length} frames at ${w}x${h} (ffmpeg exit ${code}); use a scale Chrome renders exactly. ${stderr}`));
        return;
      }
      resolve(pngs.map((_, i) => all.subarray(i * size, (i + 1) * size)));
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(Buffer.concat(pngs));
  });
}

function pipeFfmpeg(ffArgs, input) {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', ffArgs, { windowsHide: true });
    let stderr = '';
    ff.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
    ff.on('error', (error) => resolve({ ok: false, stderr: String(error) }));
    ff.on('close', (code) => resolve({ ok: code === 0, stderr }));
    ff.stdin.on('error', () => {});
    ff.stdin.end(input);
  });
}

async function firstExisting(files) {
  for (const file of files) if (await fs.stat(file).catch(() => null)) return file;
  return null;
}


async function contactSheet({ picks, rows, outDir, props, select, renderStill, serveUrl, browser }) {
  if (!picks.length) return null;
  const cellsDir = path.join(outDir, 'cells');
  await fs.mkdir(cellsDir, { recursive: true });
  const composition = await select(props);
  const byFrame = new Map(rows.map((row) => [row.frame, row]));
  const font = await firstExisting(['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf']);
  const cw = Math.round(1080 * SHEET_SCALE), ch = Math.round(1920 * SHEET_SCALE);
  const box = (r, color) => `drawbox=x=${Math.floor(r.x * SHEET_SCALE)}:y=${Math.floor(r.y * SHEET_SCALE)}:w=${Math.max(2, Math.ceil(r.width * SHEET_SCALE))}:h=${Math.max(2, Math.ceil(r.height * SHEET_SCALE))}:color=${color}@1:t=2`;
  const cells = [];
  for (let i = 0; i < picks.length; i++) {
    const row = byFrame.get(picks[i].frame);
    const { buffer } = await renderStill({ composition, serveUrl, inputProps: props, frame: row.frame, imageFormat: 'png', scale: SHEET_SCALE, output: null, puppeteerInstance: browser, logLevel: 'warn' });
    const boxes = [...(row.headRect ? [box(row.headRect, 'yellow')] : []), ...(row.hitBBox ? [box(row.hitBBox, 'red')] : [])];
    const label = `f${row.frame} ${row.status}${row.reason ? ` ${row.reason}` : ''}`;
    const text = font ? `drawtext=fontfile='${font.replace(':', '\\:')}':text='${label}':x=6:y=h-th-8:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4` : null;
    const file = path.join(cellsDir, `cell-${String(i).padStart(3, '0')}.png`);
    const annotate = (filters) => pipeFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-i', 'pipe:0',
      '-vf', filters.length ? filters.join(',') : 'null', '-frames:v', '1', file], buffer);
    let done = await annotate(text ? [...boxes, text] : boxes);
    if (!done.ok && text) done = await annotate(boxes);
    if (!done.ok) throw new Error(`Could not annotate head-check frame ${row.frame}: ${done.stderr}`);
    cells.push({ cell: i + 1, frame: row.frame, t: row.t, role: picks[i].role, status: row.status, reason: row.reason, sceneId: row.sceneId,
      landing: row.landing, headRect: row.headRect, hitBBox: row.hitBBox, paintedPx2: row.paintedPx2 });
  }
  const cols = Math.min(4, picks.length), gridRows = Math.ceil(picks.length / cols);
  for (let i = picks.length; i < cols * gridRows; i++) {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${cw}x${ch}`, '-frames:v', '1',
      path.join(cellsDir, `cell-${String(i).padStart(3, '0')}.png`)]);
  }
  const sheetFile = path.join(outDir, 'sheet.jpg');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(cellsDir, 'cell-%03d.png'),
    '-vf', `tile=${cols}x${gridRows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', sheetFile]);
  const legend = { yellow: "head rectangle: source envelope mapped through this frame's plate window", red: 'bounding box of style-painted pixels inside it' };
  await writeJson(path.join(outDir, 'sheet.json'), { sheet: rel(sheetFile), cols, rows: gridRows, scale: SHEET_SCALE, legend, cells });
  return { file: rel(sheetFile), json: rel(path.join(outDir, 'sheet.json')), cells: cells.length };
}

async function envelopeOnly() {
  if (typeof args.source !== 'string') throw new UsageError('--envelope-only needs --source <repo-relative file>.');
  const built = await buildHeadEnvelope({ source: args.source, method: METHOD, matte: MATTE, every: EVERY, force: args['rebuild-envelope'] === true, log });
  const samples = built.envelope.samples;
  console.log(JSON.stringify({ ok: built.envelope.method !== 'none', method: built.envelope.method, file: rel(built.file), cached: built.cached,
    samples: samples.length, nullSamples: samples.filter((sample) => !sample.box).length, errors: built.errors }, null, 2));
  return built.envelope.method === 'none' ? HEAD_EXIT['NEEDS-REVIEW'] : HEAD_EXIT.PASS;
}

async function checkComposition(comp) {
  const props = await readRenderProps(args, { composition: comp });
  delete props.probe;
  const propsSha256 = createHash('sha256').update(JSON.stringify(props)).digest('hex');
  const renderProps = { ...props, guides: false };
  const edit = props.edit ? editManifestSchema.parse(props.edit) : null;
  const compiled = edit ? compileEdit(edit) : null;
  const geometryFile = typeof args.geometry === 'string'
    ? normalizeGeometryFile(JSON.parse(await fs.readFile(path.resolve(String(args.geometry)), 'utf8'))) : null;
  const geometryMode = geometryFile ? `file:${args.geometry}`
    : edit && (MANIFEST_GEOMETRY_COMPS.includes(comp) || args['manifest-geometry'] === true) ? 'manifest' : null;
  if (args.out === undefined && !edit) throw new UsageError('--out is required when the props carry no edit manifest.');
  const outDir = assertProjectOutput(args.out !== undefined ? path.resolve(String(args.out))
    : path.join(ROOT, 'Projects', edit.id, 'qa', 'head-check', `${comp}-${propsSha256.slice(0, 8)}`));
  await fs.mkdir(outDir, { recursive: true });
  for (const stale of ['report.json', 'sheet.jpg', 'sheet.json']) await fs.rm(path.join(outDir, stale), { force: true });
  await fs.rm(path.join(outDir, 'cells'), { recursive: true, force: true });

  const sourcePath = typeof args.source === 'string' ? args.source : edit?.source.path ?? null;
  const built = sourcePath
    ? await buildHeadEnvelope({ source: sourcePath, method: METHOD, matte: MATTE, every: EVERY, force: args['rebuild-envelope'] === true, log })
    : { envelope: null, file: null, cached: false, errors: ['No source: pass --source or props that carry an edit manifest.'] };
  const envelope = built.envelope;
  if (edit && envelope && envelope.source.sha256 !== edit.source.sha256) throw new UsageError(`${sourcePath} is not this edit's source (sha256 differs from props.edit.source).`);

  const { serveUrl, hash: engineHash } = await getServeUrl({ log });
  const { renderFrames, renderStill, selectComposition, openBrowser } = requireFromEngine('@remotion/renderer');
  const browser = await openBrowser('chrome', { logLevel: 'warn' });
  try {
    const select = (inputProps) => selectComposition({ serveUrl, id: comp, inputProps, logLevel: 'warn', puppeteerInstance: browser });
    const meta = await select({ ...renderProps, probe: PROBES[0] });
    if (meta.width !== 1080 || meta.height !== 1920) throw new ContractError(`Composition ${comp} is ${meta.width}x${meta.height}; the head gate is defined for 1080x1920.`);
    const fps = meta.fps, duration = meta.durationInFrames;
    const listed = geometryFile ? [...geometryFile.keys()].sort((a, b) => a - b) : null;
    const from = args['from-frame'] !== undefined ? Number(args['from-frame']) : listed ? listed[0] : 0;
    const to = args['to-frame'] !== undefined ? Number(args['to-frame']) : listed ? listed.at(-1) + 1 : duration;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > duration) {
      throw new UsageError(`Frame range ${from}-${to} is outside the composition (0-${duration}).`);
    }
    const landings = compiled ? headCheckLandings(edit, compiled) : new Map();
    const grid = [];
    for (let frame = from; frame < to; frame += STRIDE) grid.push(frame);
    const onGrid = new Set(grid);
    const extras = [...landings.keys()].filter((frame) => frame >= from && frame < to && !onGrid.has(frame));
    const frames = [...grid, ...extras].sort((a, b) => a - b);

    const sourceAspect = envelope ? envelope.source.height / envelope.source.width : null;
    const aspect = props.plate?.width > 0 && props.plate?.height > 0 ? props.plate.height / props.plate.width : sourceAspect;
    const aspectReason = sourceAspect !== null && Math.abs(aspect - sourceAspect) > 0.01 * sourceAspect ? 'plate-aspect-mismatch' : null;
    const splitCanvasHeight = geometryMode === 'manifest' && !edit.footage ? splitCanvasHeightFor(edit.style) : null;
    const sceneAt = (frame) => edit?.scenes.find((s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationInFrames) ?? null;
    const frameState = (frame) => {
      if (!geometryMode) return { geometryReason: 'no-geometry' };
      if (aspectReason) return { geometryReason: aspectReason };
      if (geometryMode === 'manifest') return manifestFrameState(edit, frame, { aspect, splitCanvasHeight });
      const entry = geometryFile.get(frame);
      if (!entry) return { geometryReason: 'no-geometry' };
      const sourceFrame = entry.sourceFrame ?? (edit ? foregroundSourceFrame(edit, frame) : null);
      if (sourceFrame === null) return { geometryReason: 'no-source-frame' };
      const scene = sceneAt(frame);
      return { sceneId: scene?.id ?? null, family: scene?.family ?? null, layout: 'file', geo: entry.geo, visible: entry.geo !== null, sourceFrame,
        foregroundMatte: scene?.family === 'kinetic-hook' && !!scene.data?.foreground };
    };
    const rows = frames.map((frame) => {
      const state = frameState(frame);
      const env = state.geometryReason || !state.visible ? { box: null, confidence: 0, reason: null } : headBoxAt(envelope, state.sourceFrame);
      return { frame, t: +(frame / fps).toFixed(3), sourceFrame: state.sourceFrame ?? null, sceneId: state.sceneId ?? null, layout: state.layout ?? null,
        landing: landings.get(frame) ?? [], state, envReason: env.reason, sourceBox: env.box, confidence: env.confidence,
        headRect: env.box ? mapHeadRect(env.box, state.geo, { sourceAspect: aspect }) : null,
        windowCut: env.box ? headWindowCut(env.box, state.geo, { sourceAspect: aspect }) : null,
        paintedPx2: 0, hitBBox: null };
    });

    let contractFailure = null;
    if (rows.some((row) => row.headRect)) {
      const sweep = async (probe) => {
        const inputProps = { ...renderProps, probe };
        const composition = await select(inputProps);
        const out = new Map();
        log(`head-check ${comp}: probe ${probe}, frames ${grid[0]}-${grid.at(-1)} every ${STRIDE} + ${extras.length} landing stills @ scale ${SCALE}`);
        await renderFrames({ composition, serveUrl, inputProps, imageFormat: 'png', outputDir: null, scale: SCALE,
          frameRange: [grid[0], grid.at(-1)], everyNthFrame: STRIDE, concurrency: CONCURRENCY, puppeteerInstance: browser, logLevel: 'warn',
          onFrameBuffer: async (buffer, frame) => { out.set(frame, Buffer.from(buffer)); }, onStart: () => {}, onFrameUpdate: () => {} });
        for (const frame of extras) {
          const { buffer } = await renderStill({ composition, serveUrl, inputProps, frame, imageFormat: 'png', scale: SCALE, output: null, puppeteerInstance: browser, logLevel: 'warn' });
          out.set(frame, Buffer.from(buffer));
        }
        return out;
      };
      const take = (map, frame) => { const png = map.get(frame); if (!png) throw new ContractError(`probe render is missing frame ${frame}`); map.delete(frame); return png; };
      const A = await sweep(PROBES[0]);
      const B = await sweep(PROBES[1]);
      const w = Math.round(1080 * SCALE), h = Math.round(1920 * SCALE);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const [ra, rb] = await Promise.all([decodePngs(chunk.map((row) => take(A, row.frame)), w, h), decodePngs(chunk.map((row) => take(B, row.frame)), w, h)]);
        chunk.forEach((row, j) => {
          const stats = probeFrameStats(ra[j], rb[j], w, h, MIN_ALPHA);
          if (!contractFailure && (stats.identicalFraction > 0.999 || stats.paintedFraction > 0.9)) {
            contractFailure = `frame ${row.frame}: ${stats.identicalFraction > 0.999 ? 'both probe renders are identical' : `${(stats.paintedFraction * 100).toFixed(0)} % of the frame counts as painted`}; the composition does not honour the probe contract (core/safe.tsx)`;
          }
          if (!row.headRect) return;
          const diff = probeDiffInRect(ra[j], rb[j], w, h, row.headRect, { scale: SCALE, minAlpha: MIN_ALPHA });
          row.paintedPx2 = diff.paintedPx2;
          row.hitBBox = diff.bbox;
        });
        if ((i / CHUNK) % 10 === 0) log(`head-check: analysed ${Math.min(rows.length, i + CHUNK)}/${rows.length} frames`);
      }
    }

    for (const row of rows) {
      Object.assign(row, classifyHeadFrame({ geometryReason: row.state.geometryReason ?? null, visible: !!row.state.visible, box: row.sourceBox,
        boxReason: row.envReason, headRect: row.headRect, windowCut: row.windowCut, paintedPx2: row.paintedPx2, minAreaPx2: MIN_AREA,
        foregroundMatte: !!row.state.foregroundMatte }));
    }
    const status = contractFailure ? 'CONTRACT-FAILURE' : overallHeadStatus(rows);
    const sheet = contractFailure ? null : await contactSheet({ picks: pickSheetFrames(rows), rows, outDir, props: renderProps, select, renderStill, serveUrl, browser });
    const statuses = ['PASS', 'FAIL', 'NEEDS-REVIEW', 'SKIPPED', 'HEAD-OFFSCREEN'];
    const report = {
      version: 1, tool: 'scripts/head-check.mjs', status, comp,
      props: { file: typeof args['props-file'] === 'string' ? args['props-file'] : null, sha256: propsSha256 }, engineHash,
      envelope: envelope ? { file: rel(built.file), method: envelope.method, sourcePath: envelope.source.path, sourceSha256: envelope.source.sha256,
        samples: envelope.samples.length, nullSamples: envelope.samples.filter((s) => !s.box).length, cached: built.cached, errors: built.errors }
        : { file: null, method: 'none', errors: built.errors },
      geometry: geometryMode ?? 'unknown',
      aspect: { value: aspect, source: props.plate ? 'props.plate' : 'envelope.source', mismatch: aspectReason !== null },
      settings: { scale: SCALE, minAlpha: MIN_ALPHA, minAreaPx2: MIN_AREA, stride: STRIDE, from, to, fps },
      counts: { frames: rows.length, ...Object.fromEntries(statuses.map((s) => [s, rows.filter((row) => row.status === s).length])),
        landings: rows.filter((row) => row.landing.length).length },
      method: 'Per-frame head rectangle = source head envelope (hair and beard padded; union of the two bracketing samples) mapped through the composition plate window at that frame. Each frame rendered twice with probe colours #00FF00/#FF00FF under the core/safe.tsx contract; pixels identical in both renders were painted by the style. FAIL when painted area inside the rectangle reaches minAreaPx2, or when an interior window seam crosses the padded head. Missing envelope, null samples or unknown geometry are NEEDS-REVIEW, never PASS.',
      contractFailure, sheet,
      frames: rows.map(({ state, envReason, ...row }) => row),
    };
    await writeJson(path.join(outDir, 'report.json'), report);
    if (contractFailure) throw new ContractError(contractFailure);
    console.log(JSON.stringify({
      ok: status === 'PASS', status, comp, envelope: report.envelope.method, geometry: report.geometry, frames: rows.length, counts: report.counts,
      failures: rows.filter((row) => row.status === 'FAIL').slice(0, 20).map((row) => ({ frame: row.frame, t: row.t, sceneId: row.sceneId, reason: row.reason, paintedPx2: row.paintedPx2, bbox: row.hitBBox })),
      needsReview: rows.filter((row) => row.status === 'NEEDS-REVIEW').slice(0, 20).map((row) => ({ frame: row.frame, t: row.t, reason: row.reason })),
      report: rel(path.join(outDir, 'report.json')), sheet: sheet?.file ?? null,
    }, null, 2));
    return HEAD_EXIT[status];
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}

async function main() {
  validateOptions();
  if (args['envelope-only'] === true) return envelopeOnly();
  if (typeof args.comp !== 'string') throw new UsageError('--comp is required.');
  return checkComposition(args.comp);
}

let code;
try { code = await main(); }
catch (error) {
  if (error instanceof UsageError) { console.error(`${error.message}\n${USAGE}`); code = HEAD_EXIT.usage; }
  else if (error instanceof ContractError) { console.error(`PROBE CONTRACT FAILURE: ${error.message}`); code = HEAD_EXIT.contract; }
  else { console.error(error?.stack ?? String(error)); code = HEAD_EXIT.usage; }
}
process.exit(code);
