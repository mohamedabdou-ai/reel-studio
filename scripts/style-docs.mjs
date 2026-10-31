import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {hasStyleSystem} from '../engine/src/style-kit/system/zones.ts';

export const HUB = 'instructions/STYLES.md';
export const REGISTRY = 'engine/src/styles/registry.ts';
export const TABLE_START = '<!-- styles:table:start -->';
export const TABLE_END = '<!-- styles:table:end -->';
/** The per-style guide template, in order; Design system applies only to system styles. */
export const GUIDE_HEADINGS = ['Look', 'Best for', 'Layouts and footage', 'Palette and brand', 'Recipe', 'Design system', 'Style-owned scenes', 'Avoid'];
export const RECIPE_BULLETS = ['Decision', 'Composition/material', 'Timing/action', 'Transition/sound', 'Application/review'];

export function assertGuideHeadings(style, headings) {
  const expected = GUIDE_HEADINGS.filter(title => title !== 'Design system' || hasStyleSystem(style));
  if (headings.length !== expected.length || headings.some((title, index) => title !== expected[index])) {
    throw new Error(`instructions/styles/${style}.md must have exactly these sections, in order: ${expected.join(', ')}.`);
  }
}

const cell = value => String(value).replace(/\|/g, '\\|');

/** One row per registered style, in registry order. The id cell carries the anchor other documents link to. */
export function renderStyleTable(metas) {
  const rows = metas.map(meta => {
    const own = meta.ownScenes.length ? meta.ownScenes.map(family => `\`${family}\``).join(', ') : 'none';
    return `| <a id="${meta.id}"></a>[\`${meta.id}\`](styles/${meta.id}.md) | ${cell(meta.label.en)} · ${cell(meta.label.ar)} | ${meta.useCases.join(', ')} | ${meta.brand ? 'profile colours' : 'own palette'} | ${own} |`;
  });
  return ['| Style | Label | Best for | Brand colours | Own scenes |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}

export function replaceStyleTable(text, table) {
  const start = text.indexOf(TABLE_START), end = text.indexOf(TABLE_END);
  if (start < 0 || end < start || text.indexOf(TABLE_START, start + 1) >= 0) {
    throw new Error(`${HUB} must contain ${TABLE_START} and ${TABLE_END} once, in that order.`);
  }
  return `${text.slice(0, start + TABLE_START.length)}\n${table}\n${text.slice(end)}`;
}

async function loadMetas(root) {
  const registry = await import(pathToFileURL(path.join(root, REGISTRY)).href);
  return registry.STYLE_METAS;
}

/** Regenerates (or, with check, only verifies) the style table in the hub from the registry. */
export async function syncStyleDocs(root, {check = false, metas} = {}) {
  const file = path.join(root, HUB);
  const bytes = await fs.readFile(file);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error(`${HUB} must use UTF-8 without a BOM.`);
  const raw = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.replace(/\r\n/g, '\n');
  const next = replaceStyleTable(text, renderStyleTable(metas ?? await loadMetas(root)));
  if (check) return {ok: next === text, changed: false, file: HUB};
  if (next !== text) await fs.writeFile(file, next.replace(/\n/g, eol));
  return {ok: true, changed: next !== text, file: HUB};
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/style-docs.mjs [--check]');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    for (const meta of await loadMetas(root)) {
      const guide = await fs.readFile(path.join(root, 'instructions', 'styles', `${meta.id}.md`), 'utf8');
      assertGuideHeadings(meta.id, [...guide.matchAll(/^## (.+)$/gm)].map(match => match[1].trim()));
    }
    const result = await syncStyleDocs(root, {check: args.includes('--check')});
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exitCode = 1;
  } catch (error) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }
}
