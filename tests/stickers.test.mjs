import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleEngine, setSsrFps, setSsrFrame} from './helpers/engine-bundle.mjs';
import {
  STICKERS, STICKER_BUDGET_BYTES, STICKER_SOURCES, normalizeLottie, stickerById, stickerFile, stickerSchema, stickerSourceUrl, stickerStartFrame,
} from '../engine/src/creative-kit/stickers.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const bytesOf = (list) => list.reduce((sum, item) => sum + item.bytes, 0);
const where = (predicate) => STICKERS.filter(predicate);

// A Windows checkout with core.autocrlf writes these text files with CRLF; the table stores the upstream LF size.
const lfByteLength = (bytes) => {
  let size = bytes.length;
  for (let i = 1; i < bytes.length; i++) {
    if (bytes[i - 1] === 13 && bytes[i] === 10) size -= 1;
  }
  return size;
};

test('the curated set respects the owner counts and the 4 MB budget', () => {
  const icons = where((s) => s.kind === 'lottie');
  const animated = where((s) => s.kind === 'emoji' && s.format === 'lottie');
  const stills = where((s) => s.kind === 'emoji' && s.format === 'svg');
  assert.ok(icons.length > 0 && icons.length <= 20, `icons: ${icons.length}`);
  assert.ok(animated.length > 0 && animated.length <= 20, `animated emoji: ${animated.length}`);
  assert.ok(stills.length > 0 && stills.length <= 20, `emoji stills: ${stills.length}`);
  assert.equal(STICKER_BUDGET_BYTES, 4 * 1024 * 1024);
  assert.ok(bytesOf(STICKERS) <= STICKER_BUDGET_BYTES, `total ${bytesOf(STICKERS)} bytes`);
  assert.deepEqual([...new Set(icons.map((s) => s.source))].sort(), ['meteocons', 'useanimations']);
  assert.deepEqual([...new Set(animated.map((s) => s.source))], ['noto-animated-emoji']);
  assert.deepEqual([...new Set(stills.map((s) => s.source))], ['fluent-emoji']);
});

test('every entry has a unique id per kind, a licence from its source, an Arabic label and a sized file', () => {
  const seen = new Set();
  for (const sticker of STICKERS) {
    assert.match(sticker.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, sticker.id);
    const key = `${sticker.kind}:${sticker.id}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
    const source = STICKER_SOURCES[sticker.source];
    assert.ok(source, `${sticker.id} names a known source`);
    assert.ok(['MIT', 'CC-BY-4.0'].includes(source.licence), source.licence);
    assert.ok(sticker.bytes > 100 && sticker.bytes < 200_000, `${sticker.id} bytes ${sticker.bytes}`);
    assert.match(sticker.ar, /^[؀-ۿ ]+$/u, `${sticker.id} has an Arabic label`);
    assert.equal(stickerById(sticker.kind, sticker.id), sticker);
    assert.ok(existsSync(path.join(ROOT, source.licenceFile)), `${source.licenceFile} exists`);
  }
  assert.equal(stickerById('lottie', 'does-not-exist'), undefined);
  assert.equal(STICKER_SOURCES['noto-animated-emoji'].licence, 'CC-BY-4.0');
  assert.equal(STICKER_SOURCES.useanimations.licence, 'MIT');
  assert.equal(STICKER_SOURCES.meteocons.licence, 'MIT');
  assert.equal(STICKER_SOURCES['fluent-emoji'].licence, 'MIT');
});

test('files land under engine/public/stickers and each source url is pinned and exact', () => {
  assert.equal(stickerFile(stickerById('lottie', 'checkmark')), 'stickers/icons/checkmark.json');
  assert.equal(stickerFile(stickerById('lottie', 'weather-clear-day')), 'stickers/icons/weather-clear-day.json');
  assert.equal(stickerFile(stickerById('emoji', 'fire')), 'stickers/emoji/animated/fire.json');
  assert.equal(stickerFile(stickerById('emoji', 'money-bag')), 'stickers/emoji/still/money-bag.svg');
  assert.match(stickerSourceUrl(stickerById('lottie', 'checkmark')), /^https:\/\/raw\.githubusercontent\.com\/useanimations\/react-useanimations\/[0-9a-f]{40}\/icons\/checkmark\.json$/);
  assert.match(stickerSourceUrl(stickerById('lottie', 'weather-clear-day')), /^https:\/\/cdn\.jsdelivr\.net\/npm\/@meteocons\/lottie@0\.1\.0\/fill\/clear-day\.json$/);
  assert.equal(stickerSourceUrl(stickerById('emoji', 'fire')), 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json');
  assert.match(stickerSourceUrl(stickerById('emoji', 'money-bag')), /^https:\/\/raw\.githubusercontent\.com\/microsoft\/fluentui-emoji\/[0-9a-f]{40}\/assets\/Money%20bag\/Color\/money_bag_color\.svg$/);
  for (const sticker of STICKERS) {
    assert.ok(stickerFile(sticker).startsWith('stickers/'), sticker.id);
    assert.match(stickerSourceUrl(sticker), /^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net|fonts\.gstatic\.com)\//, sticker.id);
  }
});

test('the sticker schema takes a kind, a known id and an optional start in seconds, and nothing else', () => {
  assert.deepEqual(stickerSchema.parse({kind: 'lottie', id: 'checkmark'}), {kind: 'lottie', id: 'checkmark'});
  assert.deepEqual(stickerSchema.parse({kind: 'emoji', id: 'fire', at: 1.5}), {kind: 'emoji', id: 'fire', at: 1.5});
  assert.throws(() => stickerSchema.parse({kind: 'lottie', id: 'fire'}), /fire/, 'an emoji id is not a lottie icon');
  assert.throws(() => stickerSchema.parse({kind: 'emoji', id: 'nope'}), /nope/);
  assert.throws(() => stickerSchema.parse({kind: 'gif', id: 'fire'}));
  assert.throws(() => stickerSchema.parse({kind: 'emoji', id: 'fire', at: -1}));
  assert.throws(() => stickerSchema.parse({kind: 'emoji', id: 'fire', at: 601}));
  assert.throws(() => stickerSchema.parse({kind: 'emoji', id: 'fire', src: 'https://example.com/x.json'}), 'no free-form sources');
  assert.equal(stickerStartFrame({kind: 'emoji', id: 'fire'}, 30), 0);
  assert.equal(stickerStartFrame({kind: 'emoji', id: 'fire', at: 0.5}, 30), 15);
  assert.equal(stickerStartFrame({kind: 'emoji', id: 'fire', at: 0.5}, 60), 30);
});

test('normalizeLottie accepts a plain Lottie file or one wrapped as animationData and refuses anything else', () => {
  const lottie = {v: '5.7.0', fr: 30, ip: 0, op: 60, w: 100, h: 100, layers: []};
  assert.equal(normalizeLottie(lottie, 'a.json'), lottie);
  assert.equal(normalizeLottie({animationData: lottie, interaction: 'click'}, 'a.json'), lottie);
  assert.throws(() => normalizeLottie({hello: 1}, 'a.json'), /a\.json/);
  assert.throws(() => normalizeLottie(null, 'a.json'), /a\.json/);
  assert.throws(() => normalizeLottie({...lottie, fr: 0}, 'a.json'), /frame rate/);
});

test('files already put in place match the table: size, and Lottie shape (skipped while the downloads are pending)', () => {
  let present = 0;
  for (const sticker of STICKERS) {
    const file = path.join(ROOT, 'engine', 'public', ...stickerFile(sticker).split('/'));
    if (!existsSync(file)) continue;
    present += 1;
    assert.equal(lfByteLength(readFileSync(file)), sticker.bytes, `${sticker.id}: ${stickerFile(sticker)} keeps the upstream size`);
    if (sticker.format === 'lottie') {
      const data = normalizeLottie(JSON.parse(readFileSync(file, 'utf8')), stickerFile(sticker));
      assert.ok(data.op > 0 && data.w > 0 && data.h > 0 && data.fr > 0, sticker.id);
    } else {
      assert.match(readFileSync(file, 'utf8'), /^\s*<svg[\s>]/, `${sticker.id} is an SVG`);
    }
  }
  assert.ok(present === 0 || present === STICKERS.length, `either none or all ${STICKERS.length} files are in place (found ${present})`);
});

test('the third-party pages list every sticker with its upstream file, size and licence', () => {
  const icons = read('third-party/icons/README.md'), emoji = read('third-party/emoji/README.md');
  for (const sticker of STICKERS) {
    const page = sticker.kind === 'lottie' ? icons : emoji;
    assert.ok(page.includes(`\`${sticker.id}\``), `${sticker.kind}/${sticker.id} is listed`);
    assert.ok(page.includes(sticker.upstream), `${sticker.id} names its upstream file ${sticker.upstream}`);
  }
  assert.match(icons, /MIT/);
  assert.match(emoji, /CC BY 4\.0/);
  assert.match(read('third-party/emoji/NOTICE-noto-animated-emoji.md'), /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(read('third-party/icons/LICENSE-useanimations'), /MIT License[\s\S]*useAnimations/);
  assert.match(read('third-party/icons/LICENSE-meteocons'), /MIT License[\s\S]*Bas Milius/);
  assert.match(read('third-party/emoji/LICENSE-fluent-emoji'), /MIT License[\s\S]*Microsoft Corporation/);
  const notice = read('NOTICE.md');
  for (const name of ['useAnimations', 'Meteocons', 'Noto', 'Fluent']) assert.ok(notice.includes(name), `NOTICE.md credits ${name}`);
  assert.match(notice, /CC BY 4\.0/);
});

const mod = await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {LottieIcon, lottieRate} from './engine/src/core/lottie-icon';
  import {StickerView} from './engine/src/creative-kit/sticker-view';
  import {SafeRoot} from './engine/src/core/safe';
  export const icon = (props) => renderToStaticMarkup(React.createElement(LottieIcon, props));
  export const iconProbe = (props) => renderToStaticMarkup(React.createElement(SafeRoot, {probe: '#00FF00'}, React.createElement(LottieIcon, props)));
  export const sticker = (props) => renderToStaticMarkup(React.createElement(StickerView, props));
  export {lottieRate};
`, {ssr: true, media: true, lottieStub: true});

// Remotion's Lottie moves one file frame per video frame; without this scale a 60 fps sticker plays at half speed in a 30 fps reel.
test('lottieRate plays every sticker at its own speed whatever the video frame rate', () => {
  assert.equal(mod.lottieRate(1, 60, 30), 2);
  assert.equal(mod.lottieRate(1, 30, 30), 1);
  assert.equal(mod.lottieRate(0.5, 60, 30), 1);
  assert.equal(mod.lottieRate(1, 30, 60), 0.5);
});

test('LottieIcon reserves its box before the file loads, so layout does not jump', () => {
  setSsrFrame(0);
  const html = mod.icon({src: 'stickers/icons/checkmark.json', size: 120});
  assert.match(html, /data-lottie-icon="stickers\/icons\/checkmark\.json"/);
  assert.match(html, /width:120px/);
  assert.match(html, /height:120px/);
});

test('decoration icons draw nothing under the safe-zone probe, content icons stay so the probe can see them', () => {
  setSsrFrame(0);
  assert.doesNotMatch(mod.iconProbe({src: 'stickers/icons/checkmark.json', size: 120}), /data-lottie-icon/);
  assert.match(mod.iconProbe({src: 'stickers/icons/checkmark.json', size: 120, decoration: false}), /data-lottie-icon/);
});

test('StickerView resolves a sticker to its file: a Lottie player for icons and animated emoji, an image for stills', () => {
  setSsrFrame(0);
  assert.match(mod.sticker({sticker: {kind: 'lottie', id: 'checkmark'}, size: 90}), /data-lottie-icon="stickers\/icons\/checkmark\.json"/);
  assert.match(mod.sticker({sticker: {kind: 'emoji', id: 'fire'}, size: 90}), /data-lottie-icon="stickers\/emoji\/animated\/fire\.json"/);
  const still = mod.sticker({sticker: {kind: 'emoji', id: 'money-bag'}, size: 90});
  assert.match(still, /<img[^>]+src="\/stickers\/emoji\/still\/money-bag\.svg"/);
  assert.match(still, /width:90px/);
  assert.throws(() => mod.sticker({sticker: {kind: 'emoji', id: 'nope'}, size: 90}), /nope/);
});

test('a sticker that starts later is hidden before its start and draws from it', () => {
  const sticker = {kind: 'emoji', id: 'money-bag', at: 1};
  setSsrFps(30);
  setSsrFrame(10);
  assert.doesNotMatch(mod.sticker({sticker, size: 90}), /<img/);
  setSsrFrame(30);
  assert.match(mod.sticker({sticker, size: 90}), /<img/);
  setSsrFrame(0);
});
