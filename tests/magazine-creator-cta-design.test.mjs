import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFamilyDesign} from './helpers/magazine-design-ssr.mjs';
import {ARABIC_SCENES} from './fixtures/arabic-scenes.mjs';

const sample = structuredClone(ARABIC_SCENES.find(s => s.family === 'creator-cta'));
const module = 'engine/src/styles/magazine-interview/designs/creator-cta.tsx';
const headBox = {x: 340, y: 640, width: 400, height: 400};
const render = (frame, scene = sample) => renderFamilyDesign({module, exportName: 'CreatorCta', scene, frame, seam: 1080, headBox});
const tags = html => [...html.matchAll(/<[^/!][^>]*>/g)].map(m => m[0]);
const attr = (tag, key) => tag?.match(new RegExp(`${key}="([^"]*)"`))?.[1];
const number = (tag, key) => Number(attr(tag, key));

test('creator-cta keeps the approved real 96px headline, frames, gaps and hidden captions', async () => {
  for (const frame of [0, 30, 120, sample.durationInFrames - 1]) {
    const html = await render(frame), all = tags(html), box = name => all.find(t => attr(t, 'data-p1-box') === name);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.match(html, /data-style-system="magazine-interview"/);
    assert.match(html, /data-caption="false"/);
    const title = all.find(t => attr(t, 'data-title-effective-size') !== undefined);
    assert.equal(attr(title, 'data-title-effective-size'), '96');
    assert.equal(attr(title, 'data-title-side'), 'right');
    assert.doesNotMatch(attr(title, 'style'), /transform:/);
    assert.equal(number(box('prompt'), 'data-top'), 1072);
    assert.equal(number(box('follow-label'), 'data-top') - number(box('prompt'), 'data-bottom'), 12);
    assert.equal(number(box('follow-card'), 'data-top') - number(box('follow-label'), 'data-bottom'), 8);
    assert.equal(number(box('follow-card'), 'data-follow-frame'), 40);
    assert.equal(number(box('follow-card'), 'data-clicked-frame'), 70);
    assert.equal(attr(box('follow-card'), 'data-followed'), String(frame >= 70));
    assert.match(html, /<bdi dir="auto">@example.handle<\/bdi>/);
    if (frame >= 120) {
      assert.equal(number(box('cta-panel'), 'data-top'), 1048); assert.equal(number(box('cta-panel'), 'data-bottom'), 1470);
      assert.match(attr(box('cta-panel'), 'style'), /left:65px.*width:950px.*height:422px/);
      assert.equal(number(box('follow-card'), 'data-bottom'), 1446);
    }
  }
});

test('English creator-cta anchors its unscaled headline to the left reading side', async () => {
  const html = await render(120, {...sample, data: {...sample.data, title: 'Want the complete guide?', prompt: 'Write {keyword} for three tips', keyword: 'guide'}});
  const title = tags(html).find(t => attr(t, 'data-title-side') !== undefined);
  assert.equal(attr(title, 'data-title-side'), 'left');
  assert.match(html, /text-align:left/);
  const box = tags(html).find(t => attr(t, 'data-p1-title') !== undefined);
  assert.match(attr(box, 'style'), /left:65px/);
});

// Read the emitted masks, translations, opacity and press scale, rather than
// importing panelMotion or treating hidden DOM boxes as visible content.
const css = node => Object.fromEntries((attr(node.markup, 'style') ?? '').split(';').filter(Boolean).map(d => {const i = d.indexOf(':'); return [d.slice(0, i), d.slice(i + 1)];}));
const dom = html => {
  const flat = [], stack = [], voids = new Set(['img', 'link', 'meta', 'input', 'br', 'hr', 'source', 'wbr']);
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const name = m[2].toLowerCase();
    if (m[1]) {while (stack.length && stack.pop().name !== name) {} continue;}
    const node = {name, markup: m[0], children: [], parent: stack.at(-1)};
    node.parent?.children.push(node); flat.push(node);
    if (!voids.has(name) && !m[0].endsWith('/>')) stack.push(node);
  }
  return flat;
};
test('the panel follows visible contents and entrance masks, including the card press', async () => {
  for (const frame of [0, 6, 12, 13, 30, 39, 40, 41, 42, 43, 45, 60, 69, 70, 72, 74, 75, 90, 120, 239]) {
    const html = await render(frame), nodes = dom(html), box = name => nodes.find(n => attr(n.markup, 'data-p1-box') === name);
    const panel = box('cta-panel'), ground = nodes.find(n => attr(n.markup, 'data-p1-panel-ground') !== undefined), rule = nodes.find(n => attr(n.markup, 'data-p1-panel-rule') !== undefined);
    const ps = css(panel), gs = css(ground), rs = css(rule), top = parseFloat(ps.top), bottom = top + parseFloat(ps.height), border = parseFloat(ps['border-top']);
    const visible = [];
    let promptProgress, promptOpacity;
    for (const name of ['prompt', 'follow-label', 'follow-card']) {
      const owner = box(name), os = css(owner), mask = owner.children.find(n => attr(n.markup, 'data-event-progress') !== undefined), inner = css(mask.children[0]);
      const rise = Number(inner.transform.match(/translateY\(([-\d.]+)px\)/)[1]), alpha = Number(inner.opacity);
      const height = parseFloat(os.height ?? css(mask).height), scale = Number(os.transform?.match(/^scale\(([\d.]+)\)$/)?.[1] ?? 1);
      const center = top + border + parseFloat(os.top) + height / 2;
      const low = Math.max(top + border, center + (rise - height / 2) * scale), high = Math.min(bottom, center + height / 2 * scale);
      if (alpha > 0 && low < high) visible.push(high);
      if (name === 'prompt') {promptProgress = number(mask.markup, 'data-event-progress'); promptOpacity = alpha;}
    }
    assert.equal(Number(gs.opacity), promptOpacity);
    assert(Math.abs(parseFloat(rs.width) - 950 * promptProgress) < 1e-8);
    assert.equal(rs.right, '0');
    assert.equal(ps['border-top'], '2px solid transparent'); assert.equal(ps.background, undefined);
    if (frame <= 12) {assert.equal(Number(gs.opacity), 0); assert.equal(visible.length, 0);}
    else {assert(visible.length > 0); assert(bottom - Math.max(...visible) <= 25, `empty panel at ${frame}`);}
    if (frame > 12 && frame <= 40) assert.equal(bottom, 1160);
    if (frame >= 120) assert.equal(bottom, 1470);
  }
});

test('the follow button flips on clickedFrame exactly', async () => {
  for (const frame of [69, 70]) {
    const html = await render(frame), card = tags(html).find(t => attr(t, 'data-p1-box') === 'follow-card');
    assert.equal(attr(card, 'data-followed'), String(frame >= 70));
    assert(html.includes(frame >= 70 ? 'تمت المتابعة' : '>متابعة<'));
  }
});
