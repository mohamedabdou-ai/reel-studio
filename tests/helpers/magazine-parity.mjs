// Markup parity for the 14 approved magazine-interview designs in the layouts they draw today.
// Record once before the system move: node tests/helpers/magazine-parity.mjs --write
// Re-record only after Claude approves an intentional visual change: add --force.
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createFrameRenderer} from '../../scripts/lib/ssr-frames.mjs';
import {ARABIC_SCENES} from '../fixtures/arabic-scenes.mjs';
import {magazineTemplateData} from '../../engine/src/styles/magazine-interview/scenes/templates.ts';

export const PARITY_FILE = fileURLToPath(new URL('../fixtures/magazine-parity.json', import.meta.url));
export const PARITY_FRAMES = Object.freeze([0, 12, 50, 100, 179]);
const STYLE = 'magazine-interview';
// Families whose magazine drawing is takeover-only today; every other family keeps the layout of its fixture.
const TAKEOVER_ONLY = new Set(['intro', 'proof', 'process', 'comparison', 'comment', 'follow', 'chapter-quote']);
const APPROVED = new Set([...TAKEOVER_ONLY, 'checklist', 'statement', 'count', 'verdict', 'figures', 'chat-thread', 'proof-screen']);

export const stripSystemMarker = (html) => html.replace(/<span hidden="" data-style-system="[a-z-]+"><\/span>/g, '');

export function parityScenes() {
  const scenes = ARABIC_SCENES.filter((scene) => APPROVED.has(scene.family))
    .map((scene) => structuredClone(TAKEOVER_ONLY.has(scene.family) ? {...scene, layout: 'takeover'} : scene));
  scenes.push({id: 'verdict', family: 'verdict', layout: 'takeover', motion: 'land', fromFrame: 0, durationInFrames: 150, data: structuredClone(magazineTemplateData.verdict)});
  return scenes;
}

export async function captureMagazineParity() {
  const renderer = await createFrameRenderer();
  const hashes = {};
  for (const scene of parityScenes()) for (const frame of PARITY_FRAMES) {
    if (frame >= scene.durationInFrames) continue;
    const html = stripSystemMarker(renderer.renderScene({scene, style: STYLE, frame}));
    hashes[`${scene.id}@${scene.layout}@${frame}`] = createHash('sha256').update(html).digest('hex');
  }
  return hashes;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (!process.argv.includes('--write')) { console.error('Usage: node tests/helpers/magazine-parity.mjs --write [--force]'); process.exit(2); }
  if (existsSync(PARITY_FILE) && !process.argv.includes('--force')) { console.error(`${PARITY_FILE} exists; add --force only for an approved change.`); process.exit(2); }
  const hashes = await captureMagazineParity();
  await writeFile(PARITY_FILE, JSON.stringify({version: 1, style: STYLE, frames: PARITY_FRAMES, hashes}, null, 2) + '\n', 'utf8');
  console.log(`wrote ${Object.keys(hashes).length} hashes`);
}
