import path from 'node:path';
import { promises as fs,createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT } from './media.mjs';
import { useProcessTemp, hygienicRenderer } from './render-hygiene.mjs';



useProcessTemp();

export const ENGINE = path.join(ROOT, 'engine');
export const BUNDLE_CACHE = path.join(ROOT, 'state', 'cache', 'bundle');
const engineRequire = createRequire(path.join(ENGINE, 'package.json'));
let renderer = null;

export const requireFromEngine = Object.assign(
  (id) => (id === '@remotion/renderer' ? (renderer ??= hygienicRenderer(engineRequire(id))) : engineRequire(id)),
  { resolve: engineRequire.resolve.bind(engineRequire), cache: engineRequire.cache },
);

async function walk(dir, onFile) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if(e.isSymbolicLink())throw new Error(`Bundle input scan refuses a symbolic link: ${p}`);
    if (e.isDirectory()) await walk(p, onFile);
    else if(e.isFile())await onFile(p);
    else throw new Error(`Bundle input scan found a non-regular file: ${p}`);
  }
}















export async function linkPublic(srcDir, dstDir) {
  let linked = 0;
  let copied = 0;
  await fs.mkdir(dstDir, { recursive: true });
  for (const e of await fs.readdir(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, e.name);
    const to = path.join(dstDir, e.name);
    if (e.isDirectory()) {
      const r = await linkPublic(from, to);
      linked += r.linked;
      copied += r.copied;
    } else {
      try {
        await fs.link(from, to);
        linked++;
      } catch {
        await fs.copyFile(from, to);
        copied++;
      }
    }
  }
  return { linked, copied };
}


export async function publicContentHash(dir){
  const hash=createHash('sha256');
  await walk(dir,async file=>{hash.update(path.relative(dir,file));for await(const data of createReadStream(file))hash.update(data);});
  return hash.digest('hex');
}

export async function engineHash() {
  const h = createHash('sha1');
  await walk(path.join(ENGINE, 'src'), async (p) => {
    h.update(path.relative(ENGINE, p)).update(await fs.readFile(p));
  });
  h.update(await publicContentHash(path.join(ENGINE,'public')));
  h.update(requireFromEngine('remotion/package.json').version);
  h.update(await fs.readFile(path.join(ENGINE, 'tsconfig.json')));
  h.update(await fs.readFile(path.join(ENGINE, 'package-lock.json')).catch(() => Buffer.alloc(0)));
  h.update(await fs.readFile(path.join(ENGINE, 'proxies.json')).catch(() => Buffer.alloc(0)));
  return h.digest('hex').slice(0, 12);
}





export async function getServeUrl({ force = false, log = (m) => process.stderr.write(m + '\n') } = {}) {
  const hash = await engineHash();
  const outDir = path.join(BUNDLE_CACHE, hash);
  const marker = path.join(outDir, 'index.html');
  if (!force && (await fs.stat(marker).catch(() => null))) {
    log(`bundle: cached ${hash}`);
    return { serveUrl: outDir, hash, cached: true };
  }
  const { bundle } = requireFromEngine('@remotion/bundler');
  const { enableTailwind } = requireFromEngine('@remotion/tailwind-v4');
  await fs.mkdir(BUNDLE_CACHE, { recursive: true });


  const tmpDir = `${outDir}.tmp-${process.pid}`;
  await fs.rm(tmpDir, { recursive: true, force: true });
  const t0 = Date.now();
  const prevCwd = process.cwd();
  process.chdir(ENGINE);
  let serveUrl;


  const copyPublic = process.env.REEL_BUNDLE_COPY_PUBLIC === '1';
  const emptyPublic = path.join(ROOT, 'state', 'cache', 'empty-public');
  if (!copyPublic) await fs.mkdir(emptyPublic, { recursive: true });
  try {
    await bundle({
      entryPoint: path.join(ENGINE, 'src', 'index.ts'),
      outDir: tmpDir,
      publicDir: copyPublic ? path.join(ENGINE, 'public') : emptyPublic,
      rootDir: ENGINE,
      rspack: true,
      enableCaching: true,


      bundlerOverride: enableTailwind,
      onProgress: (p) => { if (p % 25 === 0) log(`bundle ${p}%`); },
    });
  } finally {
    process.chdir(prevCwd);
  }
  if (!copyPublic) {
    await fs.rm(path.join(tmpDir, 'public'), { recursive: true, force: true });
    const r = await linkPublic(path.join(ENGINE, 'public'), path.join(tmpDir, 'public'));
    log(`bundle: public/ = ${r.linked} hard link(s), ${r.copied} copied (0 extra bytes for linked files)`);
  }
  if (await fs.stat(marker).catch(() => null)) {

    await fs.rm(tmpDir, { recursive: true, force: true });
    serveUrl = outDir;
  } else {
    await fs.rename(tmpDir, outDir);
    serveUrl = outDir;
  }
  log(`bundle: built ${hash} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);




















  const PRUNE_AFTER_MS = 6 * 60 * 60 * 1000;
  const SAFE_AGE_MS = 45 * 60 * 1000;
  const MAX_BUNDLES = 8;
  const KEEP_NEWEST = 3;

  const dirs = (await fs.readdir(BUNDLE_CACHE, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== hash);
  const stats = await Promise.all(dirs.map(async (d) => ({ name: d.name, m: (await fs.stat(path.join(BUNDLE_CACHE, d.name))).mtimeMs })));
  stats.sort((a, b) => b.m - a.m);
  const now = Date.now();
  const drop = new Set();



  const candidates = stats.slice(KEEP_NEWEST - 1).filter((s) => now - s.m > SAFE_AGE_MS);
  for (const s of candidates) if (now - s.m > PRUNE_AFTER_MS) drop.add(s.name);


  let live = stats.length + 1 - drop.size;
  for (let i = candidates.length - 1; i >= 0 && live > MAX_BUNDLES; i--) {
    if (drop.has(candidates[i].name)) continue;
    drop.add(candidates[i].name);
    live--;
  }

  for (const name of drop) await fs.rm(path.join(BUNDLE_CACHE, name), { recursive: true, force: true });
  if (drop.size) log(`bundle: pruned ${drop.size} stale bundle(s), ${live} kept`);
  return { serveUrl, hash, cached: false };
}
