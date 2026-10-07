import path from 'node:path';
import { promises as fs } from 'node:fs';
import './lib/project-tmp.mjs';
import { parseArgs, ROOT } from './lib/media.mjs';
import { getServeUrl, requireFromEngine } from './lib/bundle.mjs';
import {readRenderProps} from './lib/render-props.mjs';
import {assertProjectOutput} from './lib/project-paths.mjs';

const args = parseArgs(process.argv.slice(2), { scale: '0.5' });
const { renderStill, selectComposition, openBrowser } = requireFromEngine('@remotion/renderer');

const comps = String(args.comps ?? '').split(',').filter(Boolean);
const times = String(args.at ?? '0').split(',').map(Number).filter((n) => !Number.isNaN(n));
if (!comps.length || !times.length) { console.error('Usage: node scripts/stills.mjs --comps A,B --at 1,2 --out dir [--guides]'); process.exit(1); }

const inputProps = {...await readRenderProps(args,{composition:comps.includes('PreparedEdit')?'PreparedEdit':undefined})};
if (args.guides) inputProps.guides = args['guides-profile'] ? String(args['guides-profile']).split(',') : true;
const ext = args.png ? 'png' : 'jpg';
const outDir = assertProjectOutput(args.out ?? path.join(ROOT, 'engine', 'out', 'stills'));
await fs.mkdir(outDir, { recursive: true });

const { serveUrl } = await getServeUrl({ force: !!args['force-bundle'] });
let browser = await openBrowser('chrome', { logLevel: 'warn' });
const written = [];
try {
  for (const id of comps) {
    const composition = await selectComposition({ serveUrl, id, inputProps, logLevel: 'warn', puppeteerInstance: browser });
    for (const t of times) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps));
      const output = path.join(outDir, `${id}-t${String(t).replace('.', '_')}${args.guides ? '-guides' : ''}.${ext}`);
      const opts = { composition, serveUrl, output, frame, inputProps, logLevel: 'warn', imageFormat: args.png ? 'png' : 'jpeg', ...(args.png ? {} : { jpegQuality: 82 }), scale: Number(args.scale), overwrite: true };
      try {
        await renderStill({ ...opts, puppeteerInstance: browser });
      } catch (err) {


        process.stderr.write(`still ${id} @${t}s failed (${String(err.message).split('\n')[0]}) — reopening browser\n`);
        await browser.close({ silent: true }).catch(() => {});
        browser = await openBrowser('chrome', { logLevel: 'warn' });
        await renderStill({ ...opts, puppeteerInstance: browser });
      }
      written.push({ id, t, frame, output });
      process.stderr.write(`still ${id} @${t}s (frame ${frame})\n`);
    }
  }
} finally {
  await browser.close({ silent: true }).catch(() => {});
}
console.log(JSON.stringify({ ok: true, count: written.length, outDir, written }, null, 2));
process.exit(0);
