import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import './lib/project-tmp.mjs';
import { parseArgs, ROOT, writeJson } from './lib/media.mjs';
import { getServeUrl, requireFromEngine } from './lib/bundle.mjs';
import { SPEC, zone, zoneTests, profileIds } from './lib/ig.mjs';

const args = parseArgs(process.argv.slice(2), { step: '0.5', scale: '0.5', 'min-alpha': '0.35', 'min-area': '400', concurrency: '4' });
const { renderFrames, renderStill, selectComposition, openBrowser } = requireFromEngine('@remotion/renderer');

const SCALE = Number(args.scale);
const MIN_ALPHA = Number(args['min-alpha']);
const MIN_AREA = Number(args['min-area']);
const PROBES = ['#00FF00', '#FF00FF'];
const W = SPEC.frame.width, H = SPEC.frame.height;
const w = Math.round(W * SCALE), h = Math.round(H * SCALE);

const log = (m) => process.stderr.write(m + '\n');

if (!args.comp && !args['self-test']) {
  console.error('Usage: node scripts/safe-check.mjs --comp <id> [--profile id,id|all] [--at t,t] [--step 0.5]');
  process.exit(1);
}

const bandsPath = args.bands ? path.resolve(String(args.bands)) : null;
const outArg = args.out ? path.resolve(String(args.out)) : null;
if (!(Number(args.step) > 0)) { console.error('--step must be a positive number of seconds'); process.exit(1); }
if (!(SCALE > 0 && SCALE <= 1)) { console.error('--scale must be in (0, 1]'); process.exit(1); }

class ContractError extends Error {}

const { serveUrl, hash: engineHash } = await getServeUrl({ log });



const pngToRgb = (png) => new Promise((resolve, reject) => {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const chunks = [];
  ff.stdout.on('data', (c) => chunks.push(c));
  ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg png decode ' + code))));
  ff.on('error', reject);
  ff.stdin.end(png);
});


async function renderProbe(compId, extraProps, probe, frames, browser) {
  const inputProps = { ...extraProps, probe };

  const composition = await selectComposition({ serveUrl, id: compId, inputProps, logLevel: 'warn', puppeteerInstance: browser });
  if (composition.width !== W || composition.height !== H) {
    throw new ContractError(`Composition ${compId} is ${composition.width}x${composition.height}; zones are defined for ${W}x${H}.`);
  }
  const out = new Map();
  const sorted = [...frames].sort((a, b) => a - b);
  const contiguousStep = sorted.length > 2 ? sorted[1] - sorted[0] : 0;
  const isSweep = sorted.length > 2 && sorted.every((f, i) => i === 0 || f - sorted[i - 1] === contiguousStep);
  if (isSweep) {
    await renderFrames({
      composition, serveUrl, inputProps, imageFormat: 'png', outputDir: null, scale: SCALE,
      frameRange: [sorted[0], sorted[sorted.length - 1]], everyNthFrame: contiguousStep,
      concurrency: Number(args.concurrency), puppeteerInstance: browser, logLevel: 'warn',
      onFrameBuffer: async (buffer, frame) => { out.set(frame, await pngToRgb(buffer)); },
      onStart: () => {}, onFrameUpdate: () => {},
    });
  } else {
    for (const frame of sorted) {

      const { buffer } = await renderStill({ composition, serveUrl, inputProps, frame, imageFormat: 'png', scale: SCALE, output: null, puppeteerInstance: browser, logLevel: 'warn' });
      out.set(frame, await pngToRgb(buffer));
    }
  }
  return { composition, out };
}



const profilesAll = profileIds();
const bandFile = bandsPath ? JSON.parse(await fs.readFile(bandsPath, 'utf8')) : [];
const bandTests = bandFile.map((b) => ({ id: b.id ?? b.label, why: b.label ?? b.id, test: (x, y) => y >= b.top && y < b.bottom }));


function analyse(a, b) {
  const n = w * h;
  if (a.length !== n * 3 || b.length !== n * 3) {
    throw new ContractError(`probe frame is ${a.length / 3} px, expected ${n} (${w}x${h}) — use a scale Chrome can honour exactly (0.5, 0.25, 1)`);
  }
  const alpha = new Float32Array(n);
  const mask = new Uint8Array(n);
  let painted = 0, identical = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const d = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
    if (d < 10) identical++;
    const al = 1 - d / 255;
    alpha[i] = al;
    if (al >= MIN_ALPHA) { mask[i] = 1; painted++; }
  }

  const label = new Int32Array(n);
  const blobs = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    const id = blobs.length + 1;
    let sp = 0; stack[sp++] = s; label[s] = id;
    const blob = { id, area: 0, alphaSum: 0, minX: w, minY: h, maxX: 0, maxY: 0, zones: {} };
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      blob.area++; blob.alphaSum += alpha[i];
      if (x < blob.minX) blob.minX = x; if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y; if (y > blob.maxY) blob.maxY = y;
      const fx = x / SCALE, fy = y / SCALE;
      for (const pid of profilesAll) {
        for (const t of zoneTests(zone(pid))) if (t.test(fx, fy)) blob.zones[`${pid}/${t.id}`] = (blob.zones[`${pid}/${t.id}`] ?? 0) + 1;
      }
      for (const t of bandTests) if (t.test(fx, fy)) blob.zones[`band/${t.id}`] = (blob.zones[`band/${t.id}`] ?? 0) + 1;
      const nb = [i - 1, i + 1, i - w, i + w];
      if (x === 0) nb[0] = -1; if (x === w - 1) nb[1] = -1;
      for (const j of nb) if (j >= 0 && j < n && mask[j] && !label[j]) { label[j] = id; stack[sp++] = j; }
    }
    if (blob.area >= 4) blobs.push(blob);
  }
  const toFull = (v) => Math.round(v / SCALE);
  const px2 = 1 / (SCALE * SCALE);
  const report = blobs.map((bl) => ({
    bbox: { x: toFull(bl.minX), y: toFull(bl.minY), w: toFull(bl.maxX - bl.minX + 1), h: toFull(bl.maxY - bl.minY + 1) },
    areaPx2: Math.round(bl.area * px2),
    alpha: +(bl.alphaSum / bl.area).toFixed(2),
    zones: Object.fromEntries(Object.entries(bl.zones).map(([k, v]) => [k, Math.round(v * px2)])),
  }));
  return { paintedFraction: painted / n, identicalFraction: identical / n, blobs: report };
}



async function runCheck({ compId, extraProps, times, enforced, outDir, keepPngs }) {
  const browser = await openBrowser('chrome', { logLevel: 'warn' });
  try {
    const compProbe = await selectComposition({ serveUrl, id: compId, inputProps: { ...extraProps, probe: PROBES[0] }, logLevel: 'warn', puppeteerInstance: browser });
    const fps = compProbe.fps;
    const frames = [...new Set(times.map((t) => Math.min(compProbe.durationInFrames - 1, Math.max(0, Math.round(t * fps)))))];
    if (!frames.length) throw new ContractError('no frames to test — check --at / --step / --range against the composition duration');
    log(`safe-check ${compId}: ${frames.length} frames @${fps} fps, scale ${SCALE}, enforced ${enforced.join(',')}`);
    const A = await renderProbe(compId, extraProps, PROBES[0], frames, browser);
    const B = await renderProbe(compId, extraProps, PROBES[1], frames, browser);
    const results = [];
    let contract = null;
    for (const frame of frames.sort((x, y) => x - y)) {
      const a = A.out.get(frame), b = B.out.get(frame);
      if (!a || !b) continue;
      const r = analyse(a, b);
      if (r.identicalFraction > 0.999 || r.paintedFraction > 0.9) {
        contract = `frame ${frame}: ${r.identicalFraction > 0.999 ? 'both probe renders are identical' : `${(r.paintedFraction * 100).toFixed(0)} % of the frame counts as painted`} — the composition does not honour the probe contract (core/safe.tsx)`;
      }
      const violations = {};
      for (const pid of profilesAll) {
        const v = [];
        for (const bl of r.blobs) {
          for (const [k, areaPx2] of Object.entries(bl.zones)) {
            const [p, zid] = k.split('/');
            if (p === pid && areaPx2 >= MIN_AREA) v.push({ zone: zid, areaPx2, bbox: bl.bbox, alpha: bl.alpha });
          }
        }
        violations[pid] = v;
      }
      const bands = [];
      for (const bl of r.blobs) for (const [k, areaPx2] of Object.entries(bl.zones)) if (k.startsWith('band/') && areaPx2 >= MIN_AREA) bands.push({ band: k.slice(5), areaPx2, bbox: bl.bbox, alpha: bl.alpha });
      results.push({ frame, t: +(frame / fps).toFixed(3), paintedFraction: +r.paintedFraction.toFixed(4), blobs: r.blobs.length, violations, bands });
      const worst = enforced.map((pid) => `${pid}:${violations[pid].length}`).join(' ');
      log(`  t=${(frame / fps).toFixed(2)}s  blobs ${r.blobs.length}  ${worst}${violations['ig-reels-ads']?.length ? `  ads:${violations['ig-reels-ads'].length}` : ''}`);
      if (keepPngs) await annotate(A.out.get(frame), frame, violations, outDir);
    }
    if (contract) return { contract, results };
    const enforcedViolations = results.filter((r) => enforced.some((pid) => r.violations[pid].length));

    const worstFrames = enforcedViolations
      .map((r) => ({ frame: r.frame, n: enforced.reduce((s, pid) => s + r.violations[pid].reduce((q, v) => q + v.areaPx2, 0), 0) }))
      .sort((x, y) => y.n - x.n).slice(0, 12);
    for (const wf of worstFrames) await annotate(A.out.get(wf.frame), wf.frame, results.find((r) => r.frame === wf.frame).violations, outDir);
    return { contract: null, results, enforcedViolations };
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}


async function annotate(rgb, frame, violations, outDir) {
  const file = path.join(outDir, `frame-${String(frame).padStart(5, '0')}.png`);
  const boxes = [];
  const colorOf = { 'ig-reels-organic': '0x39FF6A', 'ig-reels-ads': '0xFFB020', 'ig-reels-ads-disclaimer': '0xFF7A00', 'legacy-02': '0x8A8AFF' };
  for (const pid of profilesAll) {
    const z = zone(pid);
    const c = colorOf[pid] ?? '0xFFFFFF';
    boxes.push(`drawbox=x=${Math.round(z.left * SCALE)}:y=${Math.round(z.top * SCALE)}:w=${Math.round((z.right - z.left) * SCALE)}:h=${Math.round((z.bottom - z.top) * SCALE)}:color=${c}@0.9:t=2`);
    if (z.rail) boxes.push(`drawbox=x=${Math.round(z.rail.x * SCALE)}:y=${Math.round(z.rail.y * SCALE)}:w=${Math.round((W - z.rail.x) * SCALE)}:h=${Math.round((H - z.rail.y) * SCALE)}:color=0xFF3B30@0.9:t=2`);
  }
  const seen = new Set();
  for (const pid of Object.keys(violations)) for (const v of violations[pid]) {
    const k = `${v.bbox.x},${v.bbox.y},${v.bbox.w},${v.bbox.h}`;
    if (seen.has(k)) continue; seen.add(k);
    boxes.push(`drawbox=x=${Math.round(v.bbox.x * SCALE)}:y=${Math.round(v.bbox.y * SCALE)}:w=${Math.max(2, Math.round(v.bbox.w * SCALE))}:h=${Math.max(2, Math.round(v.bbox.h * SCALE))}:color=red@1:t=3`);
  }
  await new Promise((resolve) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-vf', boxes.join(','), '-frames:v', '1', file]);
    ff.on('close', resolve); ff.on('error', resolve);
    ff.stdin.end(rgb);
  });
}



if (args['self-test']) {
  let ok = true;
  const outDir = path.join(ROOT, 'state', 'cache', 'work', 'safecheck', 'self-test');
  await fs.mkdir(outDir, { recursive: true });
  for (const pid of profilesAll) {
    const z = zone(pid);
    const expected = new Set(['TOP', 'BOTTOM', 'LEFT', 'RIGHT', ...(z.rail ? ['RAIL'] : [])]);
    let r;
    try {
      r = await runCheck({ compId: 'SafeCalibration', extraProps: { profile: pid }, times: [0.5], enforced: [pid], outDir, keepPngs: false });
    } catch (e) {
      if (e instanceof ContractError) { log(`SELF-TEST ${pid}: CONTRACT FAIL — ${e.message}`); ok = false; continue; }
      throw e;
    }
    if (r.contract) { log(`SELF-TEST ${pid}: CONTRACT FAIL — ${r.contract}`); ok = false; continue; }
    const got = new Set(r.results[0].violations[pid].map((v) => v.zone));

    const counts = {};
    for (const v of r.results[0].violations[pid]) counts[v.zone] = (counts[v.zone] ?? 0) + 1;
    const same = [...expected].every((e) => got.has(e)) && [...got].every((g) => expected.has(g)) && Object.values(counts).every((c) => c === 1);
    log(`SELF-TEST ${pid}: ${same ? 'PASS' : 'FAIL'} — expected ${[...expected].join(',')} got ${JSON.stringify(counts)}`);
    if (!same) ok = false;
  }
  console.log(JSON.stringify({ ok, engineHash }, null, 2));
  process.exit(ok ? 0 : 2);
}



const compId = args.comp;
const {readRenderProps} = await import('./lib/render-props.mjs');
const extraProps = await readRenderProps(args,{composition:args.comp});
delete extraProps.probe;
const propsHash = createHash('sha1').update(JSON.stringify(extraProps)).digest('hex').slice(0, 8);
const enforced = args.profile
  ? args.profile === 'all' ? profilesAll : String(args.profile).split(',').map((s) => s.trim())
  : [SPEC.defaultProfile, ...(args['strict-ads'] ? ['ig-reels-ads'] : [])];
for (const pid of enforced) zone(pid);

const compForTimes = await selectComposition({ serveUrl, id: compId, inputProps: { ...extraProps, probe: PROBES[0] }, logLevel: 'warn' });
const durationSec = compForTimes.durationInFrames / compForTimes.fps;
let times;
if (args.at) times = String(args.at).split(',').map(Number).filter((n) => !Number.isNaN(n));
else {
  const [a, b] = args.range ? String(args.range).split('-').map(Number) : [0, durationSec];
  const step = Number(args.step);
  times = [];
  if (!(a >= 0) || !(b > a)) { console.error('--range expects a-b with 0 <= a < b (seconds)'); process.exit(1); }
  for (let t = a; t < Math.min(b, durationSec); t += step) times.push(+t.toFixed(4));
}
if (!times.length) { console.error(`no frames to test: composition is ${durationSec.toFixed(2)} s, requested ${args.at ?? args.range ?? 'sweep'}`); process.exit(1); }

const outDir = outArg ?? path.join(ROOT, 'state', 'cache', 'work', 'safecheck', `${compId}-${propsHash}`);
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

let run;
try {
  run = await runCheck({ compId, extraProps, times, enforced, outDir, keepPngs: !!args.keep });
} catch (e) {
  if (e instanceof ContractError) { console.error('PROBE CONTRACT FAILURE: ' + e.message); process.exit(2); }
  throw e;
}
if (run.contract) {
  await writeJson(path.join(outDir, 'report.json'), { comp: compId, props: extraProps, engineHash, contractFailure: run.contract, results: run.results });
  console.error('PROBE CONTRACT FAILURE: ' + run.contract);
  process.exit(2);
}

const perProfile = Object.fromEntries(profilesAll.map((pid) => [pid, run.results.filter((r) => r.violations[pid].length).length]));
const report = {
  comp: compId, props: extraProps, engineHash, scale: SCALE, minAlpha: MIN_ALPHA, minAreaPx2: MIN_AREA,
  enforced, framesTested: run.results.length, framesWithViolations: perProfile,
  bands: bandFile.map((b) => b.id ?? b.label),
  results: run.results,
};
await writeJson(path.join(outDir, 'report.json'), report);


const lines = [`# Safe-zone report — ${compId}`, '', `engine ${engineHash} · props ${JSON.stringify(extraProps)} · ${run.results.length} frames · scale ${SCALE} · min alpha ${MIN_ALPHA} · min area ${MIN_AREA} px²`, '',
  `| profile | frames with violations | enforced |`, `|---|---|---|`,
  ...profilesAll.map((pid) => `| ${pid} | ${perProfile[pid]} / ${run.results.length} | ${enforced.includes(pid) ? 'yes' : 'report only'} |`), ''];
for (const pid of profilesAll) {
  const bad = run.results.filter((r) => r.violations[pid].length);
  if (!bad.length) continue;
  lines.push(`## ${pid}`, '', '| t (s) | zone | area px² | bbox (x,y,w,h) | alpha |', '|---|---|---|---|---|');
  for (const r of bad) for (const v of r.violations[pid]) lines.push(`| ${r.t} | ${v.zone} | ${v.areaPx2} | ${v.bbox.x},${v.bbox.y},${v.bbox.w},${v.bbox.h} | ${v.alpha} |`);
  lines.push('');
}
const bandHits = run.results.filter((r) => r.bands.length);
if (bandHits.length) {
  lines.push('## content bands', '', '| t (s) | band | area px² | bbox |', '|---|---|---|---|');
  for (const r of bandHits) for (const v of r.bands) lines.push(`| ${r.t} | ${v.band} | ${v.areaPx2} | ${v.bbox.x},${v.bbox.y},${v.bbox.w},${v.bbox.h} |`);
  lines.push('');
}
await fs.writeFile(path.join(outDir, 'summary.md'), lines.join('\n'), 'utf8');

const enforcedBad = run.results.filter((r) => enforced.some((pid) => r.violations[pid].length));
console.log(JSON.stringify({
  ok: enforcedBad.length === 0, comp: compId, enforced, framesTested: run.results.length, framesWithViolations: perProfile,
  violations: enforcedBad.map((r) => ({ t: r.t, ...Object.fromEntries(enforced.filter((pid) => r.violations[pid].length).map((pid) => [pid, r.violations[pid].map((v) => `${v.zone}:${v.areaPx2}px²@${v.bbox.x},${v.bbox.y}`)])) })),
  adsWarnings: enforced.includes('ig-reels-ads') ? undefined : run.results.filter((r) => r.violations['ig-reels-ads'].length).map((r) => r.t),
  outDir,
}, null, 2));
process.exit(enforcedBad.length ? 3 : 0);
