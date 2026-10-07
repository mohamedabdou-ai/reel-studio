import './lib/project-tmp.mjs';
import path from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs, ROOT } from './lib/media.mjs';
import { ENGINE, requireFromEngine } from './lib/bundle.mjs';
import { PROJECT_TMP } from './lib/project-tmp.mjs';
import { assertProjectOutput } from './lib/project-paths.mjs';
import { profileIds } from './lib/ig.mjs';



const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const text = typeof warning === 'string' ? warning : String(warning?.message ?? '');
  const code = typeof rest[0] === 'object' && rest[0] ? rest[0].code : rest[1];
  if (code === 'MODULE_TYPELESS_PACKAGE_JSON' || /Reparsing as ES module/.test(text)) return;
  return emitWarning(warning, ...rest);
};

const { STYLE_IDS } = await import('../engine/src/creative-kit/styles.ts');
const { CONCEPT_IDS, CONCEPT_FPS } = await import('../engine/src/motion-concepts/types.ts');
const { conceptCompositionId, conceptSettledFrame, getCatalogEntry, listMotionConcepts } = await import('../engine/src/motion-concepts/catalog.ts');
const { captionIssues } = await import('../engine/src/motion-concepts/fields.ts');

export const ENTRY = path.join(ENGINE, 'src', 'motion-concepts', 'entry.ts');
export const DEFAULT_OUT = path.join(ROOT, 'Projects', 'motion-concepts', 'stills');

export const DEFAULT_AT = '0.5f,settled';
const OUT_ROOTS = ['projects', 'state'];
const MODES = ['once', 'loop'];
const MAX_ASSET_BYTES = 200 * 1024 * 1024;



const list = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);


export function resolveConcepts(spec) {
  const wanted = list(spec);
  if (wanted.length === 0) throw new Error(`--concept is required: an id, a comma list or "all". Ids: ${CONCEPT_IDS.join(', ')}`);
  const ids = wanted.includes('all') ? [...CONCEPT_IDS] : wanted;
  for (const id of ids) if (!CONCEPT_IDS.includes(id)) throw new Error(`Unknown concept "${id}". Ids: ${CONCEPT_IDS.join(', ')}`);
  return CONCEPT_IDS.filter((id) => ids.includes(id));
}


export function resolveStyles(spec) {
  const wanted = list(spec ?? 'kinetic-paper');
  const ids = wanted.includes('all') ? [...STYLE_IDS] : wanted;
  for (const id of ids) if (!STYLE_IDS.includes(id)) throw new Error(`Unknown style "${id}". Styles: ${STYLE_IDS.join(', ')}`);
  return STYLE_IDS.filter((id) => ids.includes(id));
}

const AT_TOKEN = /^(\d+(?:\.\d+)?|\.\d+)(f|fr)?$/;


export function parseAt(spec) {
  const tokens = list(spec);
  if (tokens.length === 0) throw new Error('--at needs at least one time, e.g. 0.5,2.0 or 0.5f,settled');
  return tokens.map((raw) => {

    if (raw === 'settled') return { raw, kind: 'settled', value: 0 };
    const m = AT_TOKEN.exec(raw);
    if (!m) throw new Error(`Bad --at value "${raw}". Use seconds (1.5), a fraction of the scene (0.5f, 1.0f = last frame), a frame (90fr) or settled.`);
    const value = Number(m[1]);
    if (m[2] === 'f' && value > 1) throw new Error(`--at "${raw}": a fraction must be between 0 and 1.`);
    if (m[2] === 'fr' && !Number.isInteger(value)) throw new Error(`--at "${raw}": a frame must be a whole number.`);
    return { raw, kind: m[2] === 'f' ? 'fraction' : m[2] === 'fr' ? 'frame' : 'seconds', value };
  });
}





export function frameFor(token, duration, fps = CONCEPT_FPS, settled = undefined) {
  if (token.kind === 'settled') {
    if (!Number.isInteger(settled)) throw new Error('--at settled needs the concept\'s settled frame (conceptSettledFrame).');
    return Math.max(0, Math.min(duration - 1, settled));
  }
  const raw = token.kind === 'seconds' ? token.value * fps : token.kind === 'fraction' ? token.value * (duration - 1) : token.value;
  return Math.max(0, Math.min(duration - 1, Math.round(raw)));
}

export const stillName = ({ concept, style, mode, frame, guides, caption, ext }) =>
  `${concept}__${style}__${mode}__f${String(frame).padStart(4, '0')}${guides ? '-guides' : ''}${caption ? '-caption' : ''}.${ext}`;




const SWITCHES = ['guides', 'png', 'no-bundle-cache', 'list', 'help', 'h'];









export function parseCliArgs(argv, defaults = {}) {
  const args = parseArgs(argv, defaults);
  for (const flag of SWITCHES) {
    const value = args[flag];
    if (typeof value !== 'string') continue;
    if (MODES.includes(value)) {
      args[flag] = true;
      args._.push(value);
    } else if (value === 'true' || value === 'false') args[flag] = value === 'true';
    else throw new Error(`--${flag} takes no value, got "${value}".${flag === 'guides' ? ' Use --guides-profile to pick safe-zone profiles.' : ''}`);
  }
  return args;
}


export function resolveMode(args) {
  const bare = args._ ?? [];

  if (bare.length > 1 || (bare.length === 1 && !MODES.includes(bare[0]))) throw new Error(`Unexpected argument ${bare.map((a) => JSON.stringify(a)).join(' ')}. Only once or loop may be given as a bare word.`);
  if (bare.length === 1 && args.mode !== 'once' && args.mode !== bare[0]) throw new Error(`--mode ${args.mode} contradicts the bare word ${bare[0]}.`);
  const mode = String(bare[0] ?? args.mode);
  if (!MODES.includes(mode)) throw new Error(`--mode must be once or loop, got "${mode}".`);
  return mode;
}







export function resolveGuides(args) {
  const raw = args['guides-profile'];
  if (raw === true) throw new Error(`--guides-profile needs a value: one or more of ${profileIds().join(', ')}.`);
  const ids = raw === undefined ? [] : list(raw);
  const known = profileIds();
  for (const id of ids) if (!known.includes(id)) throw new Error(`Unknown --guides-profile "${id}". Profiles: ${known.join(', ')}`);
  if (!args.guides) {
    if (ids.length) throw new Error('--guides-profile only applies together with --guides.');
    return false;
  }
  return ids.length ? ids : true;
}


export function resolveCaption(args) {
  if (args.caption === undefined) return undefined;
  if (args.caption === true || String(args.caption) === '') throw new Error('--caption needs the caption text, e.g. --caption "شغّل Claude Code الآن".');
  const problems = captionIssues(String(args.caption));
  if (problems.length) throw new Error(`--caption: ${problems.join('; ')}.`);
  return String(args.caption);
}


export function resolveOut(value) {
  const out = assertProjectOutput(value ?? DEFAULT_OUT);
  const top = path.relative(ROOT, out).split(path.sep)[0].toLowerCase();
  if (!OUT_ROOTS.includes(top)) throw new Error(`--out must be a folder under Projects/ or state/, got ${out}`);
  return out;
}


export function resolveAssets(spec) {
  const publicRoot = path.join(ENGINE, 'public');
  const found = list(spec).map((rel) => {
    if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split(/[\\/]/).includes('..')) throw new Error(`--assets "${rel}": use a path relative to engine/public, without "..".`);
    const from = path.resolve(publicRoot, rel);
    if (!from.startsWith(publicRoot + path.sep)) throw new Error(`--assets "${rel}" resolves outside engine/public.`);
    if (!existsSync(from) || !statSync(from).isFile()) throw new Error(`--assets "${rel}" is not a file under engine/public.`);
    return { rel: rel.replace(/\\/g, '/'), from, bytes: statSync(from).size };
  });
  const total = found.reduce((n, a) => n + a.bytes, 0);
  if (total > MAX_ASSET_BYTES) throw new Error(`--assets total ${(total / 1048576).toFixed(0)} MB exceeds ${MAX_ASSET_BYTES / 1048576} MB: this private bundle is meant to stay small.`);
  return found;
}

const dirSize = (dir) => {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return n;
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

const removeDir = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });


export function sweepStale() {
  const swept = [];
  for (const name of readdirSync(PROJECT_TMP)) {
    const m = /^concept-(?:bundle|public)-(\d+)$/.exec(name);
    if (!m || Number(m[1]) === process.pid || alive(Number(m[1]))) continue;
    removeDir(path.join(PROJECT_TMP, name));
    swept.push(name);
  }
  return swept;
}


export function neededFontFiles() {
  const { buildSync } = requireFromEngine('esbuild');
  const code = buildSync({
    stdin: { contents: 'export {REGISTERED} from "./core/fonts.ts";', resolveDir: path.join(ENGINE, 'src'), loader: 'ts', sourcefile: 'fonts-probe.ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(requireFromEngine, mod, mod.exports);
  const files = [...new Set(mod.exports.REGISTERED.map((r) => r.file))];
  if (files.length === 0) throw new Error('core/fonts REGISTERED is empty: refusing to build a bundle with no fonts.');
  return files;
}



const USAGE = `Usage:
  node scripts/concept-stills.mjs --concept <id|a,b|all> [--at 0.5f,settled] [--style <id|a,b|all>] [--mode once|loop]
       [--guides [--guides-profile ig-reels-organic,ig-reels-ads]] [--caption "text"] [--scale 0.5] [--png] [--assets a.png,b.png] [--out Projects/motion-concepts/stills]
  node scripts/concept-stills.mjs --list [--query dashboard] [--family data] [--style split-canvas]
Concepts: ${CONCEPT_IDS.join(', ')}
Styles:   ${STYLE_IDS.join(', ')}`;

async function main() {
  const args = parseCliArgs(process.argv.slice(2), { scale: '0.5', at: DEFAULT_AT, mode: 'once' });

  if (args.list) {
    const style = args.style === true ? undefined : args.style;
    const family = args.family === true ? undefined : args.family;
    const query = args.query === true ? '' : args.query;
    console.log(JSON.stringify(listMotionConcepts({ query, style, family }), null, 2));
    return 0;
  }


  if (args.help || args.h || args.concept === undefined) {
    console.error(USAGE);
    return args.help || args.h ? 0 : 1;
  }
  const concepts = resolveConcepts(args.concept === true ? '' : args.concept);
  const styles = resolveStyles(args.style === true ? undefined : args.style);
  const at = parseAt(args.at === true ? '' : args.at);
  const mode = resolveMode(args);
  if (mode === 'loop') {
    const notLoopable = concepts.filter((id) => !getCatalogEntry(id).loopable);
    if (notLoopable.length) throw new Error(`--mode loop: not implemented for ${notLoopable.join(', ')}.`);
  }
  const scale = Number(args.scale);
  if (!(scale > 0 && scale <= 2)) throw new Error(`--scale must be between 0 and 2, got "${args.scale}".`);
  const outDir = resolveOut(args.out === true ? undefined : args.out);
  const assets = resolveAssets(args.assets === true ? '' : args.assets);
  const ext = args.png ? 'png' : 'jpg';
  const guides = resolveGuides(args);
  const caption = resolveCaption(args);
  const total = concepts.length * styles.length * at.length;
  if (total > 200) process.stderr.write(`warning: ${total} stills requested (${concepts.length} concepts x ${styles.length} styles x ${at.length} times)\n`);

  const swept = sweepStale();
  if (swept.length) process.stderr.write(`swept ${swept.length} stale private bundle dir(s): ${swept.join(', ')}\n`);

  const bundleDir = path.join(PROJECT_TMP, `concept-bundle-${process.pid}`);
  const publicDir = path.join(PROJECT_TMP, `concept-public-${process.pid}`);
  const cleanup = () => {
    removeDir(bundleDir);
    removeDir(publicDir);
  };

  process.on('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

  const report = { ok: false, count: 0, outDir, bundle: {}, timingsMs: {}, written: [] };
  let browser = null;
  const t0 = performance.now();
  try {

    const fonts = neededFontFiles();
    mkdirSync(path.join(publicDir, 'fonts'), { recursive: true });
    for (const file of fonts) {
      const from = path.join(ENGINE, 'public', 'fonts', file);
      if (!existsSync(from)) throw new Error(`Font file engine/public/fonts/${file} is missing (core/fonts registers it). Run node scripts/fetch-fonts.mjs.`);
      copyFileSync(from, path.join(publicDir, 'fonts', file));
    }
    for (const a of assets) {
      const to = path.join(publicDir, a.rel);
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(a.from, to);
    }
    const publicBytes = dirSize(publicDir);


    const { bundle } = requireFromEngine('@remotion/bundler');
    const { enableTailwind } = requireFromEngine('@remotion/tailwind-v4');
    const tBundle = performance.now();
    const prevCwd = process.cwd();
    process.chdir(ENGINE);
    try {
      await bundle({
        entryPoint: ENTRY,
        outDir: bundleDir,
        publicDir,
        rootDir: ENGINE,
        rspack: true,
        enableCaching: !args['no-bundle-cache'],
        bundlerOverride: enableTailwind,
        onProgress: (p) => {
          if (p % 25 === 0) process.stderr.write(`bundle ${p}%\n`);
        },
      });
    } finally {
      process.chdir(prevCwd);
    }
    const bundleBytes = dirSize(bundleDir);
    report.bundle = {
      entry: path.relative(ROOT, ENTRY).replace(/\\/g, '/'),
      dir: path.relative(ROOT, bundleDir).replace(/\\/g, '/'),
      totalBytes: bundleBytes,
      totalMB: Number((bundleBytes / 1048576).toFixed(2)),
      publicFiles: fonts.length + assets.length,
      publicBytes,
      fonts: fonts.length,
      assets: assets.map((a) => a.rel),
    };
    report.timingsMs.bundle = Math.round(performance.now() - tBundle);
    process.stderr.write(`bundle: ${report.bundle.totalMB} MB in ${(report.timingsMs.bundle / 1000).toFixed(1)}s (${fonts.length} font files in its public dir)\n`);


    const { renderStill, renderMedia, selectComposition, openBrowser } = requireFromEngine('@remotion/renderer');
    mkdirSync(outDir, { recursive: true });
    browser = await openBrowser('chrome', { logLevel: 'warn' });
    const tRender = performance.now();
    for (const concept of concepts) {
      for (const style of styles) {
        const inputProps = { style, mode, ...(guides ? { guides } : {}), ...(caption ? { caption } : {}) };
        const id = conceptCompositionId(concept);
        const composition = await selectComposition({ serveUrl: bundleDir, id, inputProps, logLevel: 'warn', puppeteerInstance: browser, timeoutInMilliseconds: 60000 });
        if (args.video) {


          const output = path.join(outDir, `${concept}__${style}__${mode}.mp4`);
          const tVideo = performance.now();
          await renderMedia({
            composition, serveUrl: bundleDir, outputLocation: output, inputProps, codec: 'h264', scale, crf: 23,
            overwrite: true, logLevel: 'warn', timeoutInMilliseconds: 120000, puppeteerInstance: browser, muted: true,
          });
          const ms = Math.round(performance.now() - tVideo);
          report.written.push({ concept, style, mode, video: true, frames: composition.durationInFrames, fps: composition.fps, ms, output });
          process.stderr.write(`video ${concept} ${style} ${mode} ${composition.durationInFrames}f (${(ms / 1000).toFixed(1)}s)\n`);
          continue;
        }

        const settled = at.some((t) => t.kind === 'settled') ? conceptSettledFrame(concept, mode, composition.durationInFrames) : undefined;
        const seen = new Set();
        for (const token of at) {
          const frame = frameFor(token, composition.durationInFrames, composition.fps, settled);
          if (seen.has(frame)) continue;
          seen.add(frame);
          const output = path.join(outDir, stillName({ concept, style, mode, frame, guides, caption, ext }));
          const opts = {
            composition, serveUrl: bundleDir, output, frame, inputProps, logLevel: 'warn', scale, overwrite: true, timeoutInMilliseconds: 60000,
            imageFormat: args.png ? 'png' : 'jpeg', ...(args.png ? {} : { jpegQuality: 90 }),
          };
          const tStill = performance.now();
          try {
            await renderStill({ ...opts, puppeteerInstance: browser });
          } catch (err) {

            process.stderr.write(`still ${concept} ${style} f${frame} failed (${String(err.message).split('\n')[0]}), reopening browser\n`);
            await browser.close({ silent: true }).catch(() => {});
            browser = await openBrowser('chrome', { logLevel: 'warn' });
            await renderStill({ ...opts, puppeteerInstance: browser });
          }
          const ms = Math.round(performance.now() - tStill);
          report.written.push({ concept, style, mode, at: token.raw, frame, seconds: Number((frame / composition.fps).toFixed(3)), ms, output });
          process.stderr.write(`still ${concept} ${style} ${mode} f${frame} (${(ms / 1000).toFixed(1)}s)\n`);
        }
      }
    }
    report.timingsMs.render = Math.round(performance.now() - tRender);
    report.count = report.written.length;
    report.ok = true;
  } finally {
    if (browser) await browser.close({ silent: true }).catch(() => {});
    cleanup();
    report.bundle.deleted = !existsSync(bundleDir) && !existsSync(publicDir);
    report.timingsMs.total = Math.round(performance.now() - t0);
  }
  console.log(JSON.stringify(report, null, 2));
  return report.bundle.deleted ? 0 : 1;
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let code = 1;
  try {
    code = await main();
  } catch (err) {
    console.error(`concept-stills: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(code);
}
