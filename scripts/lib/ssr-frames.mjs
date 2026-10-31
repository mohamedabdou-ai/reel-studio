// Render one frame of any scene to static markup through the real Remotion providers.
//
// Text measurement and font loading need a browser, so this harness swaps in a deterministic
// synthetic text metric (@remotion/layout-utils) and a minimal fake `document` while a frame
// renders. The markup is therefore only good for comparing two versions of the code with the
// same inputs (same input -> same markup). It does not show how a frame really looks; use
// stills and the rendered video for that.
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {ROOT} from './project-paths.mjs';

const engineRequire = createRequire(path.join(ROOT, 'engine', 'package.json'));

// Stand-in for @remotion/layout-utils: widths depend only on the characters, the size and the weight.
const LAYOUT_UTILS = `
const arabic = (ch) => { const code = ch.codePointAt(0); return code >= 0x600 && code <= 0x6ff; };
const unit = (ch) => ch === ' ' ? 0.28 : arabic(ch) ? 0.5 : ch >= '0' && ch <= '9' ? 0.58 : ch >= 'A' && ch <= 'Z' ? 0.64 : 0.54;
const weight = (w) => { const n = typeof w === 'number' ? w : w === 'bold' ? 700 : Number(w) || 400; return 1 + (n - 400) / 2500; };
export const measureText = (o) => {
  const text = o.textTransform === 'uppercase' ? o.text.toUpperCase() : o.text;
  let width = 0;
  for (const ch of text) width += unit(ch);
  const spacing = typeof o.letterSpacing === 'string' && o.letterSpacing.endsWith('px') ? parseFloat(o.letterSpacing) : 0;
  return {width: width * o.fontSize * weight(o.fontWeight) + spacing * [...text].length, height: Math.round(o.fontSize * 1.3)};
};
export const fitText = (o) => ({fontSize: o.withinWidth / measureText({...o, fontSize: 1}).width});
const lineCount = (o, size) => {
  let lines = 1, used = 0;
  for (const word of o.text.split(' ')) {
    const width = measureText({...o, text: (used ? ' ' : '') + word, fontSize: size}).width;
    if (used && used + width > o.maxBoxWidth) { lines++; used = measureText({...o, text: word, fontSize: size}).width; } else used += width;
  }
  return lines;
};
export const fitTextOnNLines = (o) => {
  for (let size = o.maxFontSize; size > 1; size--) if (lineCount(o, size) <= o.maxLines) return {fontSize: size};
  return {fontSize: 1};
};
export const fillTextBox = ({maxBoxWidth, maxLines}) => {
  let lines = 1, used = 0;
  return {add(item) {
    const width = measureText(item).width;
    if (used && used + width > maxBoxWidth) {
      if (lines + 1 > maxLines) return {exceedsBox: true, newLine: false};
      lines++; used = measureText({...item, text: item.text.trimStart()}).width;
      return {exceedsBox: false, newLine: true};
    }
    used += width;
    return {exceedsBox: false, newLine: false};
  }};
};
`;

// Stand-in for @remotion/lottie, which scenes reach through stickers: its lottie-web needs a real browser document and a frame never loads a file here.
const LOTTIE_STUB = `
import React from 'react';
export const Lottie = ({animationData, loop, playbackRate}) =>
  React.createElement('svg', {'data-lottie-player': String(animationData?.fr ?? ''), 'data-loop': String(Boolean(loop)), 'data-rate': String(playbackRate ?? 1)});
`;

const ENTRY = `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Internals} from 'remotion';
import {SceneLayer, CaptionTrack} from './engine/src/prepared-edit/PreparedEdit';
import {compileEdit} from './engine/src/prepared-edit/timeline';
import {CreativeKitGallery} from './engine/src/creative-kit/Gallery';
import {creativeGalleryDefaults, getGalleryDuration} from './engine/src/creative-kit/schema';
import {getSceneGeometry, getSceneTheme} from './engine/src/creative-kit/primitives';
import {LOADED_FAMILIES} from './engine/src/core/fonts';
import {DigitsProvider} from './engine/src/creative-kit/digits';
import {TypographyProvider} from './engine/src/creative-kit/chapter-theme';
import {PreparedPlateProvider} from './engine/src/screen-recording/ScreenRecordingScene';

const h = React.createElement;

function withBrowserGlobals(run) {
  const before = {document: globalThis.document, localStorage: globalThis.localStorage};
  globalThis.document = {createElement: () => ({getContext: () => null}), fonts: {forEach(visit) { for (const family of LOADED_FAMILIES) visit({family, status: 'loaded'}); }}};
  globalThis.localStorage = {getItem: () => null, setItem() {}};
  try { return run(); } finally {
    for (const [name, value] of Object.entries(before)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
  }
}

function inComposition(node, frame, durationInFrames) {
  const composition = {id: 'frame', component: () => null, durationInFrames, fps: 30, width: 1080, height: 1920, defaultProps: {}};
  const metadata = {durationInFrames, fps: 30, width: 1080, height: 1920, props: {}, defaultProps: {}};
  return withBrowserGlobals(() => renderToStaticMarkup(
    h(Internals.RemotionRootContexts, {frameState: {frame}, numberOfAudioTags: 0, logLevel: 'error', audioLatencyHint: 'interactive', videoEnabled: true, audioEnabled: true},
      h(Internals.CanUseRemotionHooksProvider, null,
        h(Internals.CompositionManager.Provider, {value: {compositions: [composition], folders: [], currentCompositionMetadata: metadata, currentAssetMetadata: null, canvasContent: {type: 'composition', compositionId: 'frame'}}}, node)))));
}

export function renderScene(scene, style, frame, options = {}) {
  const seam = getSceneGeometry(style, 'split').canvasHeight;
  const geometry = {windowTop: seam, windowHeight: 1920 - seam, videoWidth: 486, videoLeft: 297, videoTop: seam};
  let node = h(SceneLayer, {scene, style, geometry, aspect: 16 / 9, seam, headBox: null, words: options.words ?? []});
  // The providers PreparedEdit mounts. An option that is left out mounts nothing, so the default markup is the old markup.
  if (options.fontFamily) node = h(TypographyProvider, {fontFamily: options.fontFamily}, node);
  if (options.digits !== undefined) node = h(DigitsProvider, {digits: options.digits}, node);
  if (options.plate) node = h(PreparedPlateProvider, {plate: options.plate}, node);
  return inComposition(node, frame, scene.durationInFrames);
}

export function renderCaptionTrack(edit, frame, center = 1500) {
  const compiled = compileEdit(edit);
  return inComposition(h(CaptionTrack, {edit, compiled, center}), frame, Math.max(frame + 1, compiled.durationInFrames));
}

export function renderGallery(style, frame, props) {
  const input = {...creativeGalleryDefaults, ...props, style};
  return inComposition(h(CreativeKitGallery, input), frame, getGalleryDuration(input));
}

export {getSceneGeometry, getSceneTheme};
`;

export async function createFrameRenderer() {
  const {build} = engineRequire('esbuild');
  const bundle = await build({
    stdin: {contents: ENTRY, resolveDir: ROOT, loader: 'tsx'},
    nodePaths: [path.join(ROOT, 'engine', 'node_modules')],
    bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
    plugins: [{
      name: 'frame-renderer',
      setup(builder) {
        builder.onResolve({filter: /^@remotion\/layout-utils$/}, () => ({path: 'layout-utils', namespace: 'frame-renderer'}));
        builder.onResolve({filter: /^@remotion\/lottie$/}, () => ({path: 'lottie-stub', namespace: 'frame-renderer'}));
        builder.onLoad({filter: /^layout-utils$/, namespace: 'frame-renderer'}, () => ({contents: LAYOUT_UTILS, loader: 'js'}));
        builder.onLoad({filter: /^lottie-stub$/, namespace: 'frame-renderer'}, () => ({contents: LOTTIE_STUB, loader: 'js', resolveDir: path.join(ROOT, 'engine')}));
        // Fonts only load in a browser. Replace only the isolated font gate; keep every provider, theme and layout calculation real.
        builder.onLoad({filter: /creative-kit[\\/]primitives\.tsx$/}, ({path: file}) => {
          const source = readFileSync(file, 'utf8');
          const start = source.indexOf('export const CreativeFonts:');
          const end = source.indexOf('export const SceneCanvas:', start);
          if (start < 0 || end <= start) throw new Error('ssr-frames: the isolated CreativeFonts gate moved; update this adapter.');
          return {contents: `${source.slice(0, start)}export const CreativeFonts = ({children}) => <>{children}</>;\n${source.slice(end)}`, loader: 'tsx', resolveDir: path.dirname(file)};
        });
      },
    }],
  });
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(engineRequire, module, module.exports);
  const api = module.exports;
  return {
    renderScene: ({scene, style, frame, ...options}) => api.renderScene(scene, style, frame, options),
    renderCaptions: ({edit, frame, center}) => api.renderCaptionTrack(edit, frame, center),
    renderGallery: ({style, frame, props = {}}) => api.renderGallery(style, frame, props),
    theme: (style) => api.getSceneTheme(style),
    geometry: (style, layout) => api.getSceneGeometry(style, layout),
  };
}
