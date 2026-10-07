import './lib/project-tmp.mjs';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs, ROOT } from './lib/media.mjs';
import {shouldPruneFontFile} from './lib/font-files.mjs';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


const DECLARED = [
  { family: 'IBM Plex Sans Arabic', weights: [400, 500, 600, 700], subsets: ['arabic', 'latin'] },
  { family: 'Cairo', weights: [400, 600, 700, 900], subsets: ['arabic', 'latin'] },
  { family: 'Tajawal', weights: [400, 500, 700, 800], subsets: ['arabic', 'latin'] },
  { family: 'IBM Plex Mono', weights: [400, 600], subsets: ['latin'] },

  { family: 'Noto Naskh Arabic', weights: [400, 700], subsets: ['arabic', 'latin-ext', 'latin'] },
  { family: 'Source Serif 4', weights: [400, 700], subsets: ['vietnamese', 'latin-ext', 'latin'] },
];

const args = parseArgs(process.argv.slice(2));
const OUT = path.join(ROOT, 'engine', 'public', 'fonts');

const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '');


const fetchCss = async (family, weights) => {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}` +
    `:wght@${weights.join(';')}&display=swap`;
  const r = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
  if (!r.ok) throw new Error(`${family}: css ${r.status}`);
  return { css: await r.text(), url };
};






const parseFaces = (css) => {
  const faces = [];
  let subset = 'unknown';
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/|@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = re.exec(css))) {
    if (m[1]) { subset = m[1]; continue; }
    const body = m[2];
    const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/i.exec(body)?.[1];
    const weight = /font-weight:\s*(\d+)/i.exec(body)?.[1] ?? '400';
    const style = /font-style:\s*(\w+)/i.exec(body)?.[1] ?? 'normal';
    const unicodeRange = /unicode-range:\s*([^;]+)/i.exec(body)?.[1]?.trim();
    if (url && !unicodeRange) throw new Error(`Font face ${subset}/${weight} has no unicode-range`);
    if (url) faces.push({ subset, url, weight, style, unicodeRange });
  }
  return faces;
};

if (args.list) {
  const files = await fs.readdir(OUT).catch(() => []);
  console.log(JSON.stringify({ dir: OUT, count: files.length, files }, null, 2));
  process.exit(0);
}

const additive = Boolean(args.family);
const requested = additive
  ? [{
      family: String(args.family),
      weights: String(args.weights ?? '400,700').split(',').map(Number),
      subsets: String(args.subsets ?? 'arabic,latin').split(','),
    }]
  : DECLARED;

await fs.mkdir(OUT, { recursive: true });
const MANIFEST = path.join(OUT, 'manifest.json');




const requestedFamilies = new Set(requested.map((spec) => spec.family));
const existing = JSON.parse(await fs.readFile(MANIFEST, 'utf8').catch(() => '[]'));
const previous = additive ? existing : [];
const manifest = previous.filter((e) => !requestedFamilies.has(e.family));
let fetched = 0, kept = 0;

for (const spec of requested) {
  const { css, url: cssUrl } = await fetchCss(spec.family, spec.weights);
  const faces = parseFaces(css).filter((f) => spec.subsets.includes(f.subset));
  if (!faces.length) throw new Error(`${spec.family}: no face matched subsets ${spec.subsets.join(',')}`);
  for (const subset of spec.subsets) {
    for (const weight of spec.weights) {
      if (!faces.some((f) => f.subset === subset && Number(f.weight) === weight)) {
        throw new Error(`${spec.family}: missing requested ${subset}/${weight}`);
      }
    }
  }
  for (const f of faces) {
    const name = `${slug(spec.family)}-${f.subset}-${f.weight}${f.style === 'italic' ? '-italic' : ''}.woff2`;
    const dest = path.join(OUT, name);
    const have = await fs.stat(dest).catch(() => null);
    let downloaded = false;
    if (have && have.size > 1024) { kept++; }
    else {
      const r = await fetch(f.url, { headers: { 'User-Agent': CHROME_UA } });
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
      fetched++;
      downloaded = true;
    }
    const bytes = await fs.readFile(dest);
    if (bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`${name}: not a WOFF2 font`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const prior = existing.find((entry) => entry.file === name && entry.sha256 === sha256);
    manifest.push({
      family: spec.family, file: name, subset: f.subset,
      weight: Number(f.weight), style: f.style,
      bytes: bytes.length,
      unicodeRange: downloaded ? f.unicodeRange : prior?.unicodeRange ?? f.unicodeRange,
      sha256,


      sourceUrl: downloaded ? f.url : prior?.sourceUrl,
      cssUrl: downloaded ? cssUrl : prior?.cssUrl,
      retrievedAt: downloaded ? new Date().toISOString() : prior?.retrievedAt,
    });
  }
}






const ownedPrefixes = additive ? requested.map((spec) => `${slug(spec.family)}-`) : null;
const declaredFiles = new Set(manifest.map((entry) => entry.file));
let pruned = 0;
for (const stale of await fs.readdir(OUT)) {
  if (!shouldPruneFontFile(stale, declaredFiles, ownedPrefixes)) continue;
  await fs.rm(path.join(OUT, stale), { force: true });
  pruned++;
}

manifest.sort((a, b) => a.file.localeCompare(b.file));
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

const byFamily = {};
for (const m of manifest) (byFamily[m.family] ??= []).push(`${m.subset}/${m.weight}`);
console.log(JSON.stringify({
  ok: true, dir: OUT,
  mode: additive ? `additive: ${requested.map((spec) => spec.family).join(', ')}` : 'rebuild from DECLARED',
  fetched, kept, pruned,
  totalKB: Math.round(manifest.reduce((n, m) => n + m.bytes, 0) / 1024),
  families: byFamily,
}, null, 2));
