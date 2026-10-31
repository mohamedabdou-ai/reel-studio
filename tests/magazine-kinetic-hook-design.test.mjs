import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';

const sample = structuredClone(ARABIC_SCENES.find(s => s.family === 'kinetic-hook'));
const module = 'engine/src/styles/magazine-interview/designs/kinetic-hook.tsx';
const headBox = {x: 340, y: 640, width: 400, height: 400};
const render = (frame, scene = sample) => renderFamilyDesign({module, exportName: 'KineticHook', scene, frame, seam: 1080, headBox});
const tags = html => [...html.matchAll(/<[^/!][^>]*>/g)].map(m => m[0]);
const attr = (tag, key) => tag?.match(new RegExp(`${key}="([^"]*)"`))?.[1];

test('kinetic-hook keeps its 96px title, 44px stamp, approved geometry and marker', async () => {
  for (const frame of [0, 30, 120, sample.durationInFrames - 1]) {
    const html = await render(frame), all = tags(html);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.match(html, /data-style-system="magazine-interview"/);
    const hook = all.find(t => attr(t, 'data-p1-box') === 'hook');
    assert.equal(attr(hook, 'data-top'), '323'); assert.equal(attr(hook, 'data-bottom'), '600');
    const stamp = all.find(t => attr(t, 'data-p1-box') === 'stamp');
    assert.equal(attr(stamp, 'data-p1-stamp-size'), '44');
    assert.equal(attr(stamp, 'data-top'), '520'); assert.equal(attr(stamp, 'data-bottom'), '619');
    const text = all.find(t => attr(t, 'data-p1-stamp') !== undefined);
    assert.match(attr(text, 'style'), /font-size:44px/);
    assert.match(attr(text, 'style'), /rotate\(-2.5deg\)/);
    const padding = attr(text, 'style').match(/padding:([\d.]+)px ([\d.]+)px/);
    assert(Math.abs(Number(padding[1]) - 4 * 44 / 34) < 1e-8);
    assert(Math.abs(Number(padding[2]) - 16 * 44 / 34) < 1e-8);
    assert.match(html, /data-p1-size="96"/);
  }
});

test('the hook swaps on the original eight/four/fourteen frame phases', async () => {
  for (const [frame, old, incoming] of [[59, 1, 0], [60, 1, 0], [64, null, 0], [68, 0, null], [78, 0, 1]]) {
    const all = tags(await render(frame));
    const opacity = key => Number(attr(all.find(t => attr(t, 'data-p1-swap') === key), 'style').match(/opacity:([\d.]+)/)[1]);
    if (old !== null) assert.equal(opacity('old'), old);
    if (incoming !== null) assert.equal(opacity('new'), incoming);
    assert.equal(attr(all.find(t => attr(t, 'data-rule-at') !== undefined), 'data-rule-at'), String(sample.data.swapFrame));
    assert.equal(attr(all.find(t => attr(t, 'data-stamp-frame') !== undefined), 'data-stamp-frame'), String(sample.data.stampFrame));
  }
});

test('English kinetic-hook aligns its title and rule to the left', async () => {
  const html = await render(120, {...sample, data: {...sample.data, label: 'Tip 1', firstTitle: 'Common mistake', secondTitle: 'Three steps', stamp: 'Try 2024'}});
  assert.match(html, /data-direction="ltr"/);
  const title = tags(html).find(t => attr(t, 'data-swap-frame') !== undefined);
  assert.match(attr(title, 'style'), /left:65px/);
  assert.match(html, /text-align:left/);
});

test('the matte remains between title/rule and stamp with source-relative trim', async () => {
  // Source-relative timing is exercised through real designSet. The media layer uses
  // Remotion's actual video component, without requiring a source file to be rendered.
  const scene = {...sample, data: {...sample.data, foreground: {src: 'examples/matte.mp4', sourceSha256: 'a'.repeat(64), sourceFromFrame: 500, frames: 900, trimBeforeFrame: 600}}};
  const html = await render(120, scene);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  assert(html.indexOf('data-swap-frame') < html.indexOf('data-p1-matte'));
  assert(html.indexOf('data-p1-matte') < html.indexOf('data-stamp-frame'));
  const source = readFileSync(module, 'utf8');
  assert.match(source, /startFromSec=\{d\.foreground\.trimBeforeFrame \/ fps\}/);
});
