import './project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { ROOT } from './project-paths.mjs';

export const ENGINE = path.join(ROOT, 'engine');
export const APP_DIR = path.join(ENGINE, 'src', 'review-editor');
export const APP_ENTRY = path.join(APP_DIR, 'entry.tsx');
const engineRequire = createRequire(path.join(ENGINE, 'package.json'));

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8' };
const posix = (p) => p.split(path.sep).join('/');


async function panelImports() {
  const dir = path.join(APP_DIR, 'panels');
  const names = (await fs.readdir(dir).catch(() => []))
    .filter((n) => /\.tsx?$/.test(n) && !/\.d\.ts$/.test(n) && !/\.test\.tsx?$/.test(n) && !n.startsWith('_'))
    .sort();
  return { names, code: names.map((n) => `import ${JSON.stringify(posix(path.join(dir, n)))};`).join('\n') || 'export {};' };
}

const panelsPlugin = {
  name: 'review-editor-panels',
  setup(build) {
    build.onResolve({ filter: /^virtual:panels$/ }, () => ({ path: 'virtual:panels', namespace: 'review-panels' }));
    build.onLoad({ filter: /.*/, namespace: 'review-panels' }, async () => ({ contents: (await panelImports()).code, loader: 'js', resolveDir: APP_DIR }));


    build.onResolve({ filter: /.*/, namespace: 'review-panels' }, (args) => ({ path: args.path, sideEffects: true }));
  },
};

export const indexHtml = ({ title = 'Review Editor' } = {}) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>${title}</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<div id="root"></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;






export async function buildReviewApp({ dev = false } = {}) {
  const esbuild = engineRequire('esbuild');
  const t0 = performance.now();
  const outdir = path.join(ROOT, 'state', 'tmp', 'review-editor-virtual');
  const result = await esbuild.build({
    entryPoints: { app: APP_ENTRY },
    outdir,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    jsx: 'automatic',
    tsconfig: path.join(ENGINE, 'tsconfig.json'),
    absWorkingDir: ENGINE,
    alias: { '@remotion/studio': path.join(APP_DIR, 'shims', 'studio.ts') },
    plugins: [panelsPlugin],
    define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
    sourcemap: dev ? 'inline' : false,
    minify: false,
    legalComments: 'none',
    logLevel: 'silent',
    metafile: true,
  });
  const files = new Map();
  let bytes = 0;
  for (const out of result.outputFiles) {
    const name = `/${path.basename(out.path)}`;
    files.set(name, { contents: Buffer.from(out.contents), type: TYPES[path.extname(name)] ?? 'application/octet-stream' });
    bytes += out.contents.byteLength;
  }
  if (!files.has('/app.js')) throw new Error('review-editor build produced no app.js');
  files.set('/index.html', { contents: Buffer.from(indexHtml()), type: 'text/html; charset=utf-8' });
  return {
    files,
    ms: Math.round(performance.now() - t0),
    bytes,
    panels: (await panelImports()).names,
    warnings: result.warnings.map((w) => `${w.text}${w.location ? ` (${w.location.file}:${w.location.line})` : ''}`),
  };
}
