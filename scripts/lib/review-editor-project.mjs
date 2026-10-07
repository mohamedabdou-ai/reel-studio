import './project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ROOT } from './project-paths.mjs';
import { checkedPath, readJson, digest, relativePath } from './job-paths.mjs';
import { loadSoundCatalog } from './job-sound.mjs';
import { manifestRevision } from './review-editor-revision.mjs';
import { editManifestSchema } from '../../engine/src/prepared-edit/schema.ts';

export const PUBLIC_DIR = path.join(ROOT, 'engine', 'public');
const posix = (p) => p.split(path.sep).join('/');


export function resolveManifestPath(arg) {
  if (typeof arg !== 'string' || !arg.trim()) throw new Error('Usage: review-editor.mjs <Projects/<slug>/edit.json>');
  let rel = arg.trim();
  if (path.isAbsolute(rel) || path.win32.isAbsolute(rel)) {
    const inside = path.relative(ROOT, path.resolve(rel));
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`The manifest must be inside the project folder: ${arg}`);
    rel = posix(inside);
  }
  rel = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  relativePath(rel);
  if (!rel.startsWith('Projects/') || rel.split('/').length < 3 || path.extname(rel).toLowerCase() !== '.json') {
    throw new Error(`The manifest must be a .json file inside Projects/<slug>/: ${arg}`);
  }
  return rel;
}

const exists = (abs) => fs.stat(abs).then((s) => s.isFile()).catch(() => false);



async function acceptPlate(src, manifest) {
  if (typeof src !== 'string' || !/^_prepared\/[a-z0-9-]+\/[a-f0-9]+\.(mp4|mov)$/i.test(src)) return null;
  const abs = path.join(PUBLIC_DIR, ...src.split('/'));
  if (!(await exists(abs))) return null;
  const side = await fs.readFile(`${abs}.prepared.json`, 'utf8').then(JSON.parse).catch(() => null);
  if (!side || side.version !== 1 || digest(side.source) !== digest(manifest.source)) return null;
  return { src, segments: side.segments, sourceSha256: side.source.sha256, mtimeMs: (await fs.stat(abs)).mtimeMs, exact: digest(side.segments) === digest(manifest.segments) };
}

async function proxyFor(plateSrc) {
  const registry = await readJson('engine/proxies.json', { optional: true }).catch(() => null);
  const entry = registry?.[plateSrc];
  if (!entry || entry.verified !== true || typeof entry.proxy !== 'string') return null;
  const [source, proxy] = await Promise.all([fs.stat(path.join(PUBLIC_DIR, ...plateSrc.split('/'))), fs.stat(path.join(PUBLIC_DIR, ...entry.proxy.split('/')))]).catch(() => []);
  if (!source || !proxy || source.size !== entry.sourceIdentity?.sizeInBytes || proxy.size !== entry.proxyIdentity?.sizeInBytes) return null;
  return entry.proxy;
}

export async function findPlate(manifest, manifestRel) {
  const dirs = [...new Set([`${path.posix.dirname(manifestRel)}/prepared`, `Projects/${manifest.id}/prepared`])];
  const tried = [];
  const stale = [];
  for (const dir of dirs) {
    const props = await readJson(`${dir}/props.json`, { optional: true }).catch(() => null);
    if (props?.plate?.src) tried.push(props.plate.src);
    const hit = props?.plate?.src ? await acceptPlate(props.plate.src, manifest) : null;
    if (hit?.exact) return finishPlate(hit, manifest);
    if (hit) stale.push(hit);
  }
  const scanDir = path.join(PUBLIC_DIR, '_prepared', manifest.id);
  const names = (await fs.readdir(scanDir).catch(() => [])).filter((n) => /^[a-f0-9]+\.(mp4|mov)$/i.test(n));
  const found = [];
  for (const name of names) {
    const hit = await acceptPlate(`_prepared/${manifest.id}/${name}`, manifest);
    if (hit?.exact) found.push(hit);
    else if (hit) stale.push(hit);
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (found[0]) return finishPlate(found[0], manifest);



  stale.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (stale[0]) return { ...(await finishPlate(stale[0], manifest)), needsPrepare: true, needsPrepareReason: 'stale-plate' };
  return { plate: null, needsPrepare: true, needsPrepareReason: tried.length || names.length ? 'stale-plate' : 'never-prepared' };
}

async function finishPlate(hit, manifest) {
  const proxySrc = await proxyFor(hit.src);
  return {
    plate: { src: hit.src, width: manifest.source.width, height: manifest.source.height, segments: hit.segments, sourceSha256: hit.sourceSha256, ...(proxySrc ? { proxySrc } : {}) },
    needsPrepare: false,
  };
}

let staticCache = { at: 0, files: [] };

export async function listStaticFiles({ max = 5000 } = {}) {
  if (Date.now() - staticCache.at < 5000) return staticCache.files;
  const files = [];
  const walk = async (dir, prefix) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (files.length >= max) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel);
      else if (e.isFile()) files.push(rel);
    }
  };
  await walk(PUBLIC_DIR, '');
  staticCache = { at: Date.now(), files };
  return files;
}





export async function loadReviewProject(manifestRel) {
  const manifestText = await fs.readFile(await checkedPath(manifestRel, { mustExist: true }), 'utf8');
  const parsed = editManifestSchema.safeParse(JSON.parse(manifestText.replace(/^\uFEFF/, '')));
  if (!parsed.success) {
    const first = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${manifestRel} is not a valid edit manifest: ${first}`);
  }
  const manifest = parsed.data;
  const dir = path.posix.dirname(manifestRel);
  const warnings = [];
  if (!manifestRel.startsWith(`Projects/${manifest.id}/`)) warnings.push(`Manifest id "${manifest.id}" does not match its folder: prepare/export will refuse it (the pipeline needs Projects/${manifest.id}/).`);
  const { plate, needsPrepare, needsPrepareReason } = await findPlate(manifest, manifestRel);
  const motionPlanPath = (await exists(path.join(ROOT, dir, 'motion-plan.json'))) ? `${dir}/motion-plan.json` : null;
  const catalog = await loadSoundCatalog().catch(() => ({ recipes: [] }));
  const props = await readJson(`${dir}/prepared/props.json`, { optional: true }).catch(() => null);
  return {
    slug: manifest.id,
    manifestPath: manifestRel,
    manifest,
    manifestRevision: manifestRevision(manifestText),
    plate,
    needsPrepare,
    ...(needsPrepareReason ? { needsPrepareReason } : {}),
    staticFiles: await listStaticFiles(),
    hasMotionPlan: motionPlanPath !== null,
    motionPlanPath,
    exportModes: [
      { id: 'preview', label: 'معاينة سريعة (proxy)', available: true },
      { id: 'deliver', label: 'تصدير نهائي (Instagram)', available: motionPlanPath !== null, ...(motionPlanPath ? {} : { reason: 'مفيش motion-plan.json جنب الـ manifest' }) },
    ],
    recipes: catalog.recipes.map((r) => r.id),
    recipeInfo: catalog.recipes.map((r) => ({ id: r.id, name: r.name, use: r.use, duration: r.duration })),

    ...(props?.headGuide ? { headGuide: props.headGuide } : {}),
    warnings,
  };
}
