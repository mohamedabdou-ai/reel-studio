import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {bundleEngine, setSsrFrame} from './helpers/engine-bundle.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';

const api = await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {KineticText} from './engine/src/styles/magazine-interview/designs/kinetic-text';
  import {DigitsProvider} from './engine/src/creative-kit/digits';
  export {getPreviewDefinition, previewAuthoredWords} from './engine/src/library-preview/fixtures';
  export const mapped = (props, digits) => renderToStaticMarkup(<DigitsProvider digits={digits}><KineticText {...props}/></DigitsProvider>);
`, {ssr: true});
const preview = api.getPreviewDefinition('scene:kinetic-text');
const sample = structuredClone(ARABIC_SCENES.find(s => s.family === 'kinetic-text') ?? preview.fixture.scene);
const words = (preview.fixture.words ?? api.previewAuthoredWords()).filter(w => sample.data.sourceIndices.includes(w.sourceIndex));
const module = 'engine/src/styles/magazine-interview/designs/kinetic-text.tsx';
const render = (scene, frame, selected = words) => renderFamilyDesign({module, exportName: 'KineticText', scene, frame, seam: 1080, words: selected});
const tags = html => [...html.matchAll(/<[^/!][^>]*>/g)].map(m => m[0]);
const attr = (tag, key) => tag?.match(new RegExp(`${key}="([^"]*)"`))?.[1];

test('kinetic-text keeps the approved split/takeover type, zones and source word clocks', async () => {
  assert.deepEqual(words.map(w => w.sourceIndex), sample.data.sourceIndices);
  for (const layout of ['takeover', 'split']) for (const frame of [0, 30, 120, sample.durationInFrames - 1]) {
    const html = await render({...sample, layout}, frame), all = tags(html);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.match(html, /data-style-system="magazine-interview"/);
    const spoken = all.find(t => attr(t, 'data-p1-rows') !== undefined);
    assert.equal(Number(attr(spoken, 'data-p1-size')), layout === 'split' ? 74 : 150);
    assert(Number(attr(spoken, 'data-p1-rows')) <= (layout === 'split' ? 2 : 3));
    const zone = all.find(t => attr(t, 'data-p1-box') === 'spoken-zone');
    assert.equal(attr(zone, 'data-top'), '350');
    assert.equal(Number(attr(zone, 'data-bottom')), layout === 'split' ? 992 : 1150);
    const tokens = all.filter(t => attr(t, 'data-p1-token') !== undefined);
    assert.equal(tokens.length, words.length);
    for (const [i, token] of tokens.entries()) {
      assert.equal(Number(attr(token, 'data-enter-frame')), words[i].fromFrame - sample.fromFrame);
      const opacity = Number(attr(token, 'style').match(/opacity:([\d.]+)/)[1]);
      assert.equal(opacity > 0, frame >= words[i].fromFrame - sample.fromFrame);
      assert(Number(attr(token, 'data-x')) >= 0);
      assert(Number(attr(token, 'data-x')) + Number(attr(token, 'data-width')) <= 950);
    }
  }
});

test('English kinetic-text starts on the left in both layouts', async () => {
  const enWords = words.map((w, i) => ({...w, text: ['One', 'clear', 'idea'][i]}));
  for (const layout of ['takeover', 'split']) {
    const html = await render({...sample, layout, data: {...sample.data, title: 'A clear idea', lang: 'en'}}, 120, enWords);
    assert.match(html, /data-direction="ltr"/);
    assert.match(html, /text-align:left/);
    assert.equal(attr(tags(html).find(t => attr(t, 'data-p1-token') !== undefined), 'data-x'), '0');
  }
});

test('the folio chooses the shared numeral face after mapping, independently of language', () => {
  setSsrFrame(120);
  for (const lang of ['ar', 'en']) for (const digits of ['latin', 'arabic-indic']) {
    const html = api.mapped({scene: {...sample, layout: 'takeover', data: {...sample.data, lang}}, words, seam: 1080, style: 'magazine-interview'}, digits);
    const folio = tags(html).find(t => attr(t, 'data-p1-folio') === 'true');
    assert.equal(attr(folio, 'data-number-shown'), digits === 'latin' ? '01' : '٠١');
    assert(attr(folio, 'data-number-face').includes(digits === 'latin' ? 'IBM Plex Mono' : 'Alexandria'));
    assert.equal(Number(attr(folio, 'data-number-weight')), digits === 'latin' ? 500 : 600);
    assert.match(html, /font-variant-numeric:tabular-nums/);
  }
});

test('overflow warns at the floor and remains clipped to three takeover rows', async () => {
  const previous = console.warn, warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const selected = [{...words[0], text: 'W'.repeat(180)}];
    const html = await render({...sample, layout: 'takeover', data: {...sample.data, sourceIndices: [words[0].sourceIndex], emphasis: []}}, 120, selected);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    const spoken = tags(html).find(t => attr(t, 'data-p1-line-box') !== undefined);
    assert.equal(attr(spoken, 'data-p1-size'), '34');
    const height = Number(attr(spoken, 'style').match(/height:([\d.]+)px/)[1]);
    assert(height <= 3 * Number(attr(spoken, 'data-p1-line-box')));
    assert(warnings.some(w => w.includes('fit-warning')));
  } finally { console.warn = previous; }
});
