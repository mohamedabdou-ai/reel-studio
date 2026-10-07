import './project-tmp.mjs';
import path from 'node:path';
import { promises as fs, createReadStream, constants, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { requireFromEngine } from './bundle.mjs';
import { ROOT, writeJson } from './media.mjs';
import { assertProjectOutput } from './project-paths.mjs';
import { checkedPath, fileSnapshot } from './job-paths.mjs';
import { mergeFaceDetections } from './face-merge.mjs';


const PINS = JSON.parse(readFileSync(new URL('./face-model-pins.json', import.meta.url), 'utf8'));

export const FACE_MODEL = Object.freeze({
  id: 'blazeface-short-range-float16-v1',
  path: 'Tools/models/face-blazeface-short-range-v1/blaze_face_short_range.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  sha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
  bytes: 229746,
  documentation: 'https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js',
});
export const FACE_MODEL_FULL = Object.freeze({
  id: 'blazeface-full-range-float16-v1',
  path: 'Tools/models/face-blazeface-full-range-v1/blaze_face_full_range.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite',
  sha256: PINS['blazeface-full-range-float16-v1'].sha256,
  bytes: PINS['blazeface-full-range-float16-v1'].bytes,
  documentation: 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector',
});
export const FACE_MODELS = Object.freeze([FACE_MODEL, FACE_MODEL_FULL]);
const BROWSER = 'engine/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

async function installOne(model) {
  const target = assertProjectOutput(await checkedPath(model.path));
  const cached = !!(await fs.stat(target).catch(() => null));
  if (!cached) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = assertProjectOutput(`${target}.${randomUUID()}.download`);
    try {
      const response = await fetch(model.url, { signal: AbortSignal.timeout(120000), redirect: 'error' });
      if (!response.ok) throw new Error(`Official face model ${model.id} returned HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== model.bytes || createHash('sha256').update(bytes).digest('hex') !== model.sha256) throw new Error(`Face model ${model.id} download does not match its pinned SHA256`);
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
      await fs.copyFile(temporary, target, constants.COPYFILE_EXCL);
    } finally { await fs.unlink(temporary).catch((e) => { if (e.code !== 'ENOENT') throw e; }); }
  }
  const snapshot = await fileSnapshot(model.path);
  if (snapshot.sha256 !== model.sha256 || snapshot.size !== model.bytes) throw new Error(`Installed face model ${model.id} failed pinned SHA256 verification; no inference was run`);
  const manifest = { version: 1, ...model, verified: true, installedSnapshot: snapshot };
  await writeJson(assertProjectOutput(`${target}.model.json`), manifest);
  return { ...manifest, cached };
}


export async function installFaceModel() {
  const models = [];
  for (const model of FACE_MODELS) models.push(await installOne(model));
  return { ...models[0], models };
}

export async function faceRuntimeIdentity() {
  const models = [];
  for (const model of FACE_MODELS) {
    const snapshot = await fileSnapshot(model.path).catch(() => { throw new Error(`Local face model ${model.id} missing; run node scripts/reframe.mjs install`); });
    if (snapshot.sha256 !== model.sha256) throw new Error(`Face model ${model.id} SHA256 mismatch`);
    models.push({ ...model, snapshot });
  }
  const packageDir = path.dirname(requireFromEngine.resolve('@mediapipe/tasks-vision'));
  const pkg = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf8'));
  if (pkg.version !== '1.0.1') throw new Error(`Face detector runtime requires pinned tasks-vision 1.0.1, found ${pkg.version}`);
  const files = ['vision_bundle.mjs', ...(await fs.readdir(path.join(packageDir, 'wasm'))).filter((name) => /\.(?:wasm|js)$/.test(name)).sort().map((name) => `wasm/${name}`)];
  const assets = [];
  for (const file of files) assets.push(await fileSnapshot(rel(path.join(packageDir, file))));
  return { model: models[0], models, package: { name: pkg.name, version: pkg.version }, assets,
    browser: await fileSnapshot(BROWSER), remotionVersion: requireFromEngine('@remotion/renderer/package.json').version,
    delegate: 'CPU', inference: 'MediaPipe Tasks Vision WebAssembly, local Chromium, explicit CPU delegate, short-range + full-range BlazeFace merged',
    packageDir: rel(packageDir) };
}


export async function detectFrameFiles(frames, { runtime, minConfidence = 0.5, log = () => {} } = {}) {
  if (!frames.length) throw new Error('Face detection requires decoded frames');
  const identity = runtime ?? await faceRuntimeIdentity();
  const packageDir = await checkedPath(identity.packageDir, { file: false, mustExist: true });
  const prefix = `/${randomUUID()}`;
  const routes = new Map();
  routes.set(`${prefix}/vision_bundle.mjs`, path.join(packageDir, 'vision_bundle.mjs'));
  for (const entry of identity.assets) if (entry.path.includes('/wasm/')) routes.set(`${prefix}/wasm/${path.basename(entry.path)}`, await checkedPath(entry.path, { mustExist: true }));
  const modelIds = FACE_MODELS.map((model) => model.id);
  for (let m = 0; m < FACE_MODELS.length; m++) routes.set(`${prefix}/model-${m}.tflite`, await checkedPath(FACE_MODELS[m].path, { mustExist: true }));
  for (let i = 0; i < frames.length; i++) routes.set(`${prefix}/frame/${i}.png`, await checkedPath(frames[i].path, { mustExist: true }));
  const requested = new Set();
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' blob:; worker-src 'self' blob:");
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (url.pathname === `${prefix}/`) { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><meta charset="utf-8"><title>Local face crop analysis</title>'); return; }
    const file = routes.get(url.pathname);
    if (!file) { response.writeHead(404); response.end(); return; }
    requested.add(rel(file));
    const ext = path.extname(file);
    response.setHeader('Content-Type', ext === '.wasm' ? 'application/wasm' : ext === '.png' ? 'image/png' : /\.m?js$/.test(ext) ? 'text/javascript' : 'application/octet-stream');
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const baseUrl = `http://127.0.0.1:${server.address().port}${prefix}`;
  let browser;
  let page;
  const browserLogs = [];
  try {
    browser = await requireFromEngine('@remotion/renderer').openBrowser('chrome', { browserExecutable: await checkedPath(BROWSER, { mustExist: true }), logLevel: 'error', chromiumOptions: { headless: true } });
    page = await browser.newPage({ context: () => null, logLevel: 'error', indent: false, pageIndex: 0,
      onBrowserLog: ({ text, type }) => { if (browserLogs.length < 30) browserLogs.push({ type, text: text.slice(0, 1200) }); },
      onLog: ({ previewString }) => { if (browserLogs.length < 30) browserLogs.push(previewString.slice(0, 1200)); } });
    await page.goto({ url: `${baseUrl}/`, timeout: 30000 });
    const browserRuntime = await page.evaluate(async (url, confidence, count) => {


      const originalFetch = window.fetch.bind(window);
      window.localNetworkPolicy = { externalRequestsAllowed: false, blockedRequests: [] };
      window.fetch = (input, options) => {
        const target = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (target.origin !== location.origin) {
          window.localNetworkPolicy.blockedRequests.push({ url: `${target.origin}${target.pathname}`, method: options?.method ?? (input instanceof Request ? input.method : 'GET'), blockedBeforeNetwork: true });
          return Promise.reject(new TypeError('External requests are disabled for local face analysis'));
        }
        return originalFetch(input, options);
      };
      const { FilesetResolver, FaceDetector } = await import(`${url}/vision_bundle.mjs`);
      const vision = await FilesetResolver.forVisionTasks(`${url}/wasm`);
      window.localFaceDetectors = [];
      for (let m = 0; m < count; m++) {
        window.localFaceDetectors.push(await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${url}/model-${m}.tflite`, delegate: 'CPU' }, runningMode: 'VIDEO',
          minDetectionConfidence: confidence, minSuppressionThreshold: 0.3,
        }));
      }
      return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, crossOriginIsolated,
        wasmLoader: vision.wasmLoaderPath, wasmBinary: vision.wasmBinaryPath, delegate: 'CPU', mode: 'VIDEO', detectors: count };
    }, baseUrl, minConfidence, FACE_MODELS.length);
    const samples = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const result = await page.evaluate(async (url, timestampMs) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Decoded frame missing');
        const bitmap = await createImageBitmap(await response.blob());
        try {
          const perModel = window.localFaceDetectors.map((detector) => detector.detectForVideo(bitmap, timestampMs).detections
            .map((d) => ({ box: d.boundingBox, score: Math.max(...d.categories.map((c) => c.score)) })));
          return { width: bitmap.width, height: bitmap.height, perModel };
        } finally { bitmap.close(); }
      }, `${baseUrl}/frame/${i}.png`, Math.max(0, frame.timeSec * 1000));
      const faces = mergeFaceDetections(result.perModel.flatMap((detections, m) => detections.map(({ box, score }) => {
        const x = Math.max(0, box.originX / result.width), y = Math.max(0, box.originY / result.height);
        const right = Math.min(1, (box.originX + box.width) / result.width), bottom = Math.min(1, (box.originY + box.height) / result.height);
        return { x, y, width: right - x, height: bottom - y, score, model: modelIds[m] };
      })).filter((f) => f.width > 0 && f.height > 0 && Number.isFinite(f.score)));
      samples.push({ timeSec: frame.timeSec, sourceTimeSec: frame.sourceTimeSec, frame: frame.path, faces });
      if (i % 25 === 0 || i === frames.length - 1) log(`face detection: ${i + 1}/${frames.length} decoded samples`);
    }
    const networkPolicy = await page.evaluate(() => {
      for (const detector of window.localFaceDetectors) detector.close();
      window.localFaceDetectors = [];
      return window.localNetworkPolicy;
    });
    return { samples, runtime: { ...identity, actual: { ...browserRuntime, networkPolicy,
      wasmLoader: rel(routes.get(new URL(browserRuntime.wasmLoader).pathname)), wasmBinary: rel(routes.get(new URL(browserRuntime.wasmBinary).pathname)),
      requestedAssets: [...requested].filter((p) => !frames.some((f) => f.path === p)), browserLogs } } };
  } finally {
    try {
      if (page) await page.evaluate(() => { for (const detector of window.localFaceDetectors ?? []) detector.close(); }).catch(() => {});
      if (browser) await browser.close({ silent: true });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
}
