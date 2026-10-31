import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STYLE_IDS, getStyleMeta} from '../engine/src/styles/registry.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const engineRequire = createRequire(new URL('../engine/package.json', import.meta.url));
const {build} = engineRequire('esbuild');

// The captured baseline of the original hand tables. Shapes used here: baseline.styles is the
// list of recorded style ids; themes[id] is getSceneTheme(id); geometry[id][layout] is
// getSceneGeometry(id, layout). Only the recorded ids are compared, so a style registered later
// does not disturb the baseline.
const baseline = JSON.parse(await readFile(new URL('./fixtures/style-baselines.json', import.meta.url), 'utf8'));
const themeBaseline = (id) => baseline.themes[id];
const geometryBaseline = (id, layout) => baseline.geometry[id][layout];
const LAYOUTS = ['split', 'takeover'];

// Bundle the real modules. Importing them does not render, so no font gate is needed.
const bundle = await build({
  stdin: {
    contents: `
      export {getStyleTheme, getStyleLayout, getGalleryCut, getStyleCaption} from './engine/src/styles/themes';
      export {getSceneTheme, getSceneGeometry} from './engine/src/creative-kit/primitives';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  nodePaths: [path.join(root, 'engine/node_modules')],
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
});
const mod = {exports: {}};
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(engineRequire, mod, mod.exports);
const {getStyleTheme, getStyleLayout, getGalleryCut, getStyleCaption, getSceneTheme, getSceneGeometry} = mod.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('only the magazine caption contract opts into transition hiding and landing fade', () => {
  for (const id of STYLE_IDS) assert.equal(getStyleCaption(id)?.hideDuringTransitions ?? false, id === 'magazine-interview', id);
});

test('every registered style has a theme module that agrees with its meta', () => {
  for (const id of STYLE_IDS) {
    const legacy = getStyleMeta(id).legacy;
    assert.equal(getStyleLayout(id).kind, legacy ? 'legacy' : 'adapted', `${id}: layout kind follows meta.legacy`);
    assert.equal('grammar' in getStyleTheme(id), !legacy, `${id}: only adapted styles carry a grammar`);
    assert.ok(existsSync(new URL(`../engine/src/styles/${id}/theme.ts`, import.meta.url)), `${id}/theme.ts exists`);
  }
});

// Styles added after the capture (grid-glide) are covered by their own tests.
test('getStyleTheme and getSceneTheme return exactly the captured baseline theme', () => {
  for (const id of baseline.styles) {
    assert.deepEqual(plain(getStyleTheme(id)), themeBaseline(id), id);
    assert.deepEqual(plain(getSceneTheme(id)), themeBaseline(id), id);
  }
});

// Styles added after the capture (grid-glide) are covered by their own tests.
test('getSceneGeometry returns exactly the captured baseline for split and takeover', () => {
  for (const id of baseline.styles) {
    for (const layout of LAYOUTS) {
      assert.deepEqual(plain(getSceneGeometry(id, layout)), geometryBaseline(id, layout), `${id} ${layout}`);
    }
  }
});

test('the gallery cut table keeps the two original flashes and nothing else', () => {
  for (const id of STYLE_IDS) {
    const expected = id === 'section-deck' ? 'flash-bloom' : 'none';
    assert.equal(getGalleryCut(id), expected, id);
  }
});

test('the legacy token modules moved into their style folders and the hand tables are gone', async () => {
  for (const id of ['section-deck']) {
    assert.ok(existsSync(new URL(`../engine/src/styles/${id}/format.ts`, import.meta.url)), `${id}/format.ts`);
    assert.equal(existsSync(new URL(`../engine/src/style-${id}`, import.meta.url)), false, `style-${id} folder is removed`);
  }
  const primitives = await readFile(new URL('../engine/src/creative-kit/primitives.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(primitives, /case "liquid-glass"|SPLIT_LAYOUT|DECK_LAYOUT|style-split-canvas|style-section-deck/);
  const gallery = await readFile(new URL('../engine/src/creative-kit/Gallery.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(gallery, /props\.style === "(section-deck|split-canvas)"/);
});

test('an unknown style id still fails with the registry message', () => {
  assert.throws(() => getSceneTheme('no-such-style'), /Unknown style "no-such-style"/);
  assert.throws(() => getSceneGeometry('no-such-style', 'split'), /Unknown style "no-such-style"/);
  assert.throws(() => getGalleryCut('no-such-style'), /Unknown style "no-such-style"/);
});
